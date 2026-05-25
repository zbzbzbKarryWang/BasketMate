-- ============================================================
-- 函数: complete_purchase_task
-- 功能: 完成采购任务（原子性操作）
-- 原子性要求:
--   - 步骤1：遍历 checked_items，更新 ingredients 表的 quantity（库存增加），若原 quantity 为0则更新 added_at
--   - 步骤2：从 purchase_tasks 的 pending_items 中移除 checked_items
--   - 步骤3：将 checked_items 追加到 purchase_tasks 的 completed_items
--   - 步骤4：如果 pending_items 为空，更新 status 为 false（已完成），并设置 completed_at
--   - 如果步骤2失败，步骤1必须回滚；如果步骤3失败，步骤1和2必须回滚；如果步骤4失败，步骤1-3必须回滚
-- ============================================================

CREATE OR REPLACE FUNCTION complete_purchase_task(
    p_task_id UUID,
    p_checked_items JSONB  -- 格式: [{ingredient_id, ingredient_name, need_quantity, is_custom, custom_id}]
)
RETURNS JSONB AS $$
DECLARE
    v_item JSONB;
    v_ingredient_id UUID;
    v_quantity FLOAT;
    v_old_quantity FLOAT;
    v_pending_items JSONB;
    v_completed_items JSONB;
    v_custom_items JSONB;
    v_pending_idx INT;
    v_removed_count INT := 0;
    v_added_count INT := 0;
    v_is_completed BOOLEAN := FALSE;
BEGIN
    -- 获取当前任务
    SELECT pending_items, completed_items, custom_items 
    INTO v_pending_items, v_completed_items, v_custom_items
    FROM purchase_tasks WHERE id = p_task_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION '采购任务不存在: %', p_task_id;
    END IF;
    
    v_pending_items := COALESCE(v_pending_items, '[]'::JSONB);
    v_completed_items := COALESCE(v_completed_items, '[]'::JSONB);
    v_custom_items := COALESCE(v_custom_items, '[]'::JSONB);
    
    -- 遍历每个勾选的项
    FOR v_item IN SELECT jsonb_array_elements(p_checked_items) LOOP
        -- 步骤1：更新库存
        IF (v_item->>'is_custom')::BOOLEAN = FALSE THEN
            v_ingredient_id := (v_item->>'ingredient_id')::UUID;
            v_quantity := COALESCE((v_item->>'need_quantity')::FLOAT, 0);
            
            IF v_ingredient_id IS NOT NULL AND v_quantity > 0 THEN
                -- 获取旧数量
                SELECT quantity INTO v_old_quantity FROM ingredients WHERE id = v_ingredient_id;
                
                -- 更新库存
                UPDATE ingredients
                SET quantity = COALESCE(quantity, 0) + v_quantity,
                    added_at = CASE WHEN COALESCE(quantity, 0) = 0 THEN NOW() ELSE added_at END
                WHERE id = v_ingredient_id;
            END IF;
        END IF;
        
        -- 步骤2：从 pending_items 移除
        v_pending_idx := -1;
        FOR i IN 0..jsonb_array_length(v_pending_items) - 1 LOOP
            IF (v_pending_items->i->>'ingredient_id') = (v_item->>'ingredient_id')
               AND (v_item->>'is_custom')::BOOLEAN = FALSE THEN
                v_pending_idx := i;
                EXIT;
            END IF;
            -- 也检查 custom_id
            IF (v_item->>'is_custom')::BOOLEAN = TRUE
               AND (v_pending_items->i->>'custom_id') = (v_item->>'custom_id') THEN
                v_pending_idx := i;
                EXIT;
            END IF;
        END LOOP;
        
        IF v_pending_idx >= 0 THEN
            v_pending_items := v_pending_items - v_pending_idx;
            v_removed_count := v_removed_count + 1;
        END IF;
        
        -- 步骤3：添加到 completed_items
        v_completed_items := v_completed_items || jsonb_build_array(v_item);
        v_added_count := v_added_count + 1;
        
        -- 如果是自定义项，从 custom_items 移除
        IF (v_item->>'is_custom')::BOOLEAN = TRUE THEN
            DECLARE
                v_new_custom JSONB := '[]'::JSONB;
                v_custom JSONB;
            BEGIN
                FOR v_custom IN SELECT jsonb_array_elements(v_custom_items) LOOP
                    IF (v_custom->>'id') <> (v_item->>'custom_id') THEN
                        v_new_custom := v_new_custom || jsonb_build_array(v_custom);
                    END IF;
                END LOOP;
                v_custom_items := v_new_custom;
            END;
        END IF;
    END LOOP;
    
    -- 检查是否所有待购项都已处理
    IF jsonb_array_length(v_pending_items) = 0 AND jsonb_array_length(v_custom_items) = 0 THEN
        v_is_completed := TRUE;
    END IF;
    
    -- 步骤4：更新采购任务（包含状态和完成时间）
    UPDATE purchase_tasks
    SET pending_items = v_pending_items,
        completed_items = v_completed_items,
        custom_items = v_custom_items,
        status = NOT v_is_completed,  -- true=活跃, false=已完成
        completed_at = CASE WHEN v_is_completed THEN NOW() ELSE completed_at END
    WHERE id = p_task_id;
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'task_id', p_task_id,
        'removed_count', v_removed_count,
        'added_count', v_added_count,
        'is_completed', v_is_completed
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE;
END;
$$ LANGUAGE plpgsql;