-- ============================================================
-- 函数: update_ingredient_safe
-- 功能: 安全更新食材库存，联动更新采购清单
-- 原子性要求:
--   - 步骤1：更新 ingredients 表的 quantity 字段
--   - 步骤2：重新计算该食材在采购清单中的需求（pending_items），并更新 purchase_tasks
--   - 如果步骤2失败，步骤1必须回滚
-- ============================================================

CREATE OR REPLACE FUNCTION update_ingredient_safe(
    p_ingredient_id UUID,
    p_new_quantity FLOAT
)
RETURNS JSONB AS $$
DECLARE
    v_old_quantity FLOAT;
    v_pending_items JSONB;
    v_task RECORD;
BEGIN
    -- 获取食材当前数量
    SELECT quantity INTO v_old_quantity FROM ingredients WHERE id = p_ingredient_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION '食材不存在: %', p_ingredient_id;
    END IF;
    
    -- 如果数量未变化，直接返回成功
    IF COALESCE(v_old_quantity, 0) = p_new_quantity THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'ingredient_id', p_ingredient_id,
            'quantity_changed', FALSE
        );
    END IF;
    
    -- 步骤1：更新 ingredients 表的 quantity 字段
    UPDATE ingredients
    SET quantity = p_new_quantity,
        added_at = CASE WHEN v_old_quantity = 0 THEN NOW() ELSE added_at END
    WHERE id = p_ingredient_id;
    
    -- 步骤2：更新采购清单
    SELECT * INTO v_task FROM purchase_tasks WHERE status = TRUE LIMIT 1;
    
    IF FOUND THEN
        v_pending_items := v_task.pending_items;
        
        -- 遍历所有待购项，找到该食材
        FOR i IN 0..jsonb_array_length(v_pending_items) - 1 LOOP
            DECLARE
                v_item JSONB := v_pending_items->i;
            BEGIN
                IF (v_item->>'ingredient_id') = p_ingredient_id::TEXT THEN
                    -- 获取该食材的需求来源
                    DECLARE
                        v_sources JSONB := COALESCE(v_item->'sources', '{}'::JSONB);
                        v_total_need FLOAT := 0;
                        v_key TEXT;
                        v_val FLOAT;
                    BEGIN
                        -- 计算总需求量
                        FOR v_key, v_val IN SELECT * FROM jsonb_each_text(v_sources) LOOP
                            v_total_need := v_total_need + v_val;
                        END LOOP;
                        
                        -- 如果库存充足，移除该项；否则更新缺货量
                        IF p_new_quantity >= v_total_need THEN
                            v_pending_items := v_pending_items - i;
                        ELSE
                            v_pending_items := jsonb_set(v_pending_items, ARRAY[i, 'need_quantity'], to_jsonb(v_total_need - p_new_quantity));
                        END IF;
                    END;
                    EXIT;
                END IF;
            END;
        END LOOP;
        
        -- 更新采购任务
        UPDATE purchase_tasks
        SET pending_items = v_pending_items
        WHERE id = v_task.id;
    END IF;
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'ingredient_id', p_ingredient_id,
        'quantity_changed', TRUE
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE;
END;
$$ LANGUAGE plpgsql;
