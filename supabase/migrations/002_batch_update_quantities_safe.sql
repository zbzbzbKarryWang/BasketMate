-- ============================================================
-- 函数: batch_update_quantities_safe
-- 功能: 批量更新食材库存，联动更新采购清单
-- 原子性要求:
--   - 步骤1：批量更新 ingredients 表的 quantity 字段
--   - 步骤2：遍历所有被修改的食材，重新计算采购清单需求，更新 purchase_tasks 的 pending_items
--   - 如果步骤2失败，步骤1必须回滚
-- ============================================================

CREATE OR REPLACE FUNCTION batch_update_quantities_safe(
    p_updates JSONB  -- 格式: [{id: uuid, quantity: float}]
)
RETURNS JSONB AS $$
DECLARE
    v_update JSONB;
    v_ingredient_id UUID;
    v_new_quantity FLOAT;
    v_old_quantity FLOAT;
    v_quantity_changed BOOLEAN := FALSE;
    v_pending_items JSONB;
    v_task RECORD;
    v_updated_count INT := 0;
    v_needs_refresh BOOLEAN := FALSE;
    v_affected_ingredients UUID[] := '{}';
BEGIN
    -- 步骤1：批量更新 ingredients 表
    FOR v_update IN SELECT jsonb_array_elements(p_updates) LOOP
        v_ingredient_id := (v_update->>'id')::UUID;
        v_new_quantity := (v_update->>'quantity')::FLOAT;
        
        -- 获取旧数量用于比较
        SELECT quantity INTO v_old_quantity FROM ingredients WHERE id = v_ingredient_id;
        IF FOUND THEN
            IF v_old_quantity <> v_new_quantity THEN
                v_needs_refresh := TRUE;
                v_affected_ingredients := array_append(v_affected_ingredients, v_ingredient_id);
            END IF;
            
            -- 更新数量
            UPDATE ingredients
            SET quantity = v_new_quantity,
                added_at = CASE WHEN v_old_quantity = 0 THEN NOW() ELSE added_at END
            WHERE id = v_ingredient_id;
            
            v_updated_count := v_updated_count + 1;
        END IF;
    END LOOP;
    
    -- 步骤2：如果有数量变化，更新采购清单
    IF v_needs_refresh THEN
        SELECT * INTO v_task FROM purchase_tasks WHERE status = TRUE LIMIT 1;
        
        IF FOUND THEN
            v_pending_items := v_task.pending_items;
            
            -- 遍历所有待购项
            DECLARE
                v_new_pending_items JSONB := '[]'::JSONB;
                v_item JSONB;
            BEGIN
                FOR v_item IN SELECT jsonb_array_elements(v_pending_items) LOOP
                    DECLARE
                        v_ing_id TEXT := v_item->>'ingredient_id';
                        v_sources JSONB := COALESCE(v_item->'sources', '{}'::JSONB);
                        v_total_need FLOAT := 0;
                        v_stock FLOAT;
                        v_key TEXT;
                        v_val FLOAT;
                    BEGIN
                        -- 检查是否受影响的食材
                        IF v_ing_id = ANY(v_affected_ingredients) THEN
                            -- 计算总需求
                            FOR v_key, v_val IN SELECT * FROM jsonb_each_text(v_sources) LOOP
                                v_total_need := v_total_need + v_val;
                            END LOOP;
                            
                            -- 获取新库存
                            SELECT quantity INTO v_stock FROM ingredients WHERE id = v_ing_id::UUID;
                            v_stock := COALESCE(v_stock, 0);
                            
                            -- 如果库存充足，跳过；否则添加到新列表
                            IF v_stock < v_total_need THEN
                                v_item := jsonb_set(v_item, ARRAY['need_quantity'], to_jsonb(v_total_need - v_stock));
                                v_new_pending_items := v_new_pending_items || v_item;
                            END IF;
                        ELSE
                            -- 不受影响的项直接保留
                            v_new_pending_items := v_new_pending_items || v_item;
                        END IF;
                    END;
                END LOOP;
                
                -- 更新采购任务
                UPDATE purchase_tasks
                SET pending_items = v_new_pending_items
                WHERE id = v_task.id;
            END;
        END IF;
    END IF;
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'updated_count', v_updated_count
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE;
END;
$$ LANGUAGE plpgsql;
