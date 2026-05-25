-- ============================================================
-- 函数: delete_plan_with_refresh
-- 功能: 删除计划并增量更新采购清单
-- 原子性要求:
--   - 步骤1：从 plans 表删除该计划
--   - 步骤2：从 purchase_tasks 的 pending_items 中移除该计划的贡献（减少 need_quantity，若降为0则删除该项）
--   - 如果步骤2失败，步骤1必须回滚
-- ============================================================

CREATE OR REPLACE FUNCTION delete_plan_with_refresh(
    p_plan_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_pending_items JSONB := '[]'::JSONB;
    v_task RECORD;
    v_new_pending JSONB := '[]'::JSONB;
    v_item JSONB;
    v_sources JSONB;
    v_key TEXT;
    v_val FLOAT;
    v_removed_count INT := 0;
BEGIN
    -- 步骤1：删除计划
    DELETE FROM plans WHERE id = p_plan_id;
    
    -- 步骤2：更新采购清单
    SELECT * INTO v_task FROM purchase_tasks WHERE status = TRUE LIMIT 1;
    
    IF FOUND THEN
        v_pending_items := COALESCE(v_task.pending_items, '[]'::JSONB);
        
        -- 遍历每个待购项
        FOR v_item IN SELECT jsonb_array_elements(v_pending_items) LOOP
            v_sources := COALESCE(v_item->'sources', '{}'::JSONB);
            
            -- 检查是否有该计划的来源
            IF v_sources ? p_plan_id::TEXT THEN
                -- 移除该来源
                v_sources := v_sources - p_plan_id::TEXT;
                
                -- 如果没有其他来源，删除该项
                IF jsonb_object_keys(v_sources) IS NULL THEN
                    v_removed_count := v_removed_count + 1;
                    CONTINUE;
                END IF;
                
                -- 计算新的总需求和缺货量
                DECLARE
                    v_total_need FLOAT := 0;
                    v_stock FLOAT;
                    v_ing_id TEXT := v_item->>'ingredient_id';
                BEGIN
                    FOR v_key, v_val IN SELECT * FROM jsonb_each_text(v_sources) LOOP
                        v_total_need := v_total_need + v_val;
                    END LOOP;
                    
                    SELECT quantity INTO v_stock FROM ingredients WHERE id = v_ing_id::UUID;
                    v_stock := COALESCE(v_stock, 0);
                    
                    IF v_stock >= v_total_need THEN
                        -- 库存充足，删除该项
                        v_removed_count := v_removed_count + 1;
                    ELSE
                        -- 更新缺货量和来源
                        v_item := jsonb_set(v_item, ARRAY['sources'], v_sources);
                        v_item := jsonb_set(v_item, ARRAY['need_quantity'], to_jsonb(v_total_need - v_stock));
                        v_new_pending := v_new_pending || jsonb_build_array(v_item);
                    END IF;
                END;
            ELSE
                -- 不受影响的项直接保留
                v_new_pending := v_new_pending || jsonb_build_array(v_item);
            END IF;
        END LOOP;
        
        UPDATE purchase_tasks SET pending_items = v_new_pending WHERE id = v_task.id;
    END IF;
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'plan_id', p_plan_id,
        'items_removed', v_removed_count
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE;
END;
$$ LANGUAGE plpgsql;
