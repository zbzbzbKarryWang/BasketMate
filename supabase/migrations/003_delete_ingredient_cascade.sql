-- ============================================================
-- 函数: delete_ingredient_cascade
-- 功能: 删除食材，级联清理所有引用
-- 原子性要求:
--   - 步骤1：从 ingredients 表删除该食材
--   - 步骤2：从所有 recipes 的 ingredients JSONB 中移除该 ingredient_id
--   - 步骤3：从 purchase_tasks 的 pending_items 和 completed_items 中移除该 ingredient_id
--   - 如果步骤2失败，步骤1必须回滚；如果步骤3失败，步骤1和2必须回滚
-- ============================================================

CREATE OR REPLACE FUNCTION delete_ingredient_cascade(
    p_ingredient_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_recipe RECORD;
    v_task RECORD;
    v_recipes_updated INT := 0;
    v_items_removed INT := 0;
BEGIN
    -- 检查食材是否存在
    IF NOT EXISTS (SELECT 1 FROM ingredients WHERE id = p_ingredient_id) THEN
        RAISE EXCEPTION '食材不存在: %', p_ingredient_id;
    END IF;
    
    -- 步骤2：从所有菜谱中移除该食材
    FOR v_recipe IN SELECT id, ingredients FROM recipes LOOP
        DECLARE
            v_ingredients JSONB := v_recipe.ingredients;
            v_new_ingredients JSONB := '[]'::JSONB;
            v_ing JSONB;
        BEGIN
            FOR v_ing IN SELECT jsonb_array_elements(v_ingredients) LOOP
                IF (v_ing->>'ingredient_id')::UUID <> p_ingredient_id THEN
                    v_new_ingredients := v_new_ingredients || v_ing;
                END IF;
            END LOOP;
            
            IF v_new_ingredients <> v_ingredients THEN
                UPDATE recipes SET ingredients = v_new_ingredients WHERE id = v_recipe.id;
                v_recipes_updated := v_recipes_updated + 1;
            END IF;
        END;
    END LOOP;
    
    -- 步骤3：从采购任务中移除
    FOR v_task IN SELECT id, pending_items, completed_items, removed_ingredient_ids FROM purchase_tasks LOOP
        DECLARE
            v_new_pending JSONB := '[]'::JSONB;
            v_new_completed JSONB := '[]'::JSONB;
            v_pending_items JSONB := COALESCE(v_task.pending_items, '[]'::JSONB);
            v_completed_items JSONB := COALESCE(v_task.completed_items, '[]'::JSONB);
            v_item JSONB;
            v_removed_ids JSONB := COALESCE(v_task.removed_ingredient_ids, '[]'::JSONB);
        BEGIN
            -- 过滤 pending_items
            FOR v_item IN SELECT jsonb_array_elements(v_pending_items) LOOP
                IF (v_item->>'ingredient_id')::UUID <> p_ingredient_id THEN
                    v_new_pending := v_new_pending || v_item;
                ELSE
                    v_items_removed := v_items_removed + 1;
                END IF;
            END LOOP;
            
            -- 过滤 completed_items
            FOR v_item IN SELECT jsonb_array_elements(v_completed_items) LOOP
                IF (v_item->>'ingredient_id')::UUID <> p_ingredient_id THEN
                    v_new_completed := v_new_completed || v_item;
                END IF;
            END LOOP;
            
            -- 添加到黑名单
            IF NOT (v_removed_ids ? p_ingredient_id::TEXT) THEN
                v_removed_ids := v_removed_ids || to_jsonb(p_ingredient_id::TEXT);
            END IF;
            
            UPDATE purchase_tasks
            SET pending_items = v_new_pending,
                completed_items = v_new_completed,
                removed_ingredient_ids = v_removed_ids
            WHERE id = v_task.id;
        END;
    END LOOP;
    
    -- 步骤1：删除食材
    DELETE FROM ingredients WHERE id = p_ingredient_id;
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'ingredient_id', p_ingredient_id,
        'recipes_updated', v_recipes_updated,
        'items_removed', v_items_removed
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE;
END;
$$ LANGUAGE plpgsql;
