-- ============================================================
-- 函数: update_plan_with_refresh
-- 功能: 更新计划并增量更新采购清单
-- 原子性要求:
--   - 步骤1：更新 plans 表中该计划
--   - 步骤2：重新计算该计划的缺货食材（与旧需求对比）
--   - 步骤3：更新 purchase_tasks 的 pending_items（移除旧需求贡献，添加新需求贡献）
--   - 如果步骤3失败，步骤1必须回滚
-- ============================================================

CREATE OR REPLACE FUNCTION update_plan_with_refresh(
    p_plan_id UUID,
    p_date DATE DEFAULT NULL,
    p_breakfast_recipe_id UUID DEFAULT NULL,
    p_meal_ids UUID[] DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_old_plan RECORD;
    v_ingredient_ids UUID[] := '{}';
    v_recipe RECORD;
    v_ingredient JSONB;
    v_pending_items JSONB;
    v_task RECORD;
    v_existing_idx INT;
    v_sources JSONB;
    v_stock FLOAT;
    v_new_need FLOAT;
    v_key TEXT;
    v_val FLOAT;
BEGIN
    -- 获取旧计划信息
    SELECT * INTO v_old_plan FROM plans WHERE id = p_plan_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION '计划不存在: %', p_plan_id;
    END IF;
    
    -- 步骤1：更新计划
    UPDATE plans
    SET 
        date = COALESCE(p_date, date),
        breakfast_recipe_id = COALESCE(p_breakfast_recipe_id, breakfast_recipe_id),
        meal_ids = COALESCE(p_meal_ids, meal_ids)
    WHERE id = p_plan_id;
    
    -- 收集新计划所需的食材
    DECLARE
        v_new_breakfast UUID := COALESCE(p_breakfast_recipe_id, v_old_plan.breakfast_recipe_id);
        v_new_meals UUID[] := COALESCE(p_meal_ids, v_old_plan.meal_ids);
    BEGIN
        -- 获取新早餐菜谱食材
        IF v_new_breakfast IS NOT NULL THEN
            SELECT * INTO v_recipe FROM recipes WHERE id = v_new_breakfast;
            IF FOUND THEN
                FOR v_ingredient IN SELECT jsonb_array_elements(COALESCE(v_recipe.ingredients, '[]'::JSONB)) LOOP
                    IF (v_ingredient->>'ingredient_id') IS NOT NULL THEN
                        v_ingredient_ids := array_append(v_ingredient_ids, (v_ingredient->>'ingredient_id')::UUID);
                    END IF;
                END LOOP;
            END IF;
        END IF;
        
        -- 获取新正餐菜谱食材
        FOR v_recipe IN SELECT * FROM recipes WHERE id = ANY(v_new_meals) LOOP
            FOR v_ingredient IN SELECT jsonb_array_elements(COALESCE(v_recipe.ingredients, '[]'::JSONB)) LOOP
                IF (v_ingredient->>'ingredient_id') IS NOT NULL THEN
                    v_ingredient_ids := array_append(v_ingredient_ids, (v_ingredient->>'ingredient_id')::UUID);
                END IF;
            END LOOP;
        END LOOP;
    END;
    
    -- 步骤2 & 3：更新采购清单
    SELECT * INTO v_task FROM purchase_tasks WHERE status = TRUE LIMIT 1;
    
    IF FOUND THEN
        v_pending_items := COALESCE(v_task.pending_items, '[]'::JSONB);
        
        -- 获取库存信息
        DECLARE
            v_stock_map JSONB := '{}'::JSONB;
            v_inventory RECORD;
            v_price_map JSONB := '{}'::JSONB;
            v_price RECORD;
        BEGIN
            FOR v_inventory IN SELECT id, quantity FROM ingredients LOOP
                v_stock_map := jsonb_set(v_stock_map, ARRAY[v_inventory.id::TEXT], to_jsonb(COALESCE(v_inventory.quantity, 0)));
            END LOOP;
            
            FOR v_price IN 
                SELECT ingredient_id, MIN(price) as min_price,
                       (SELECT name FROM shops WHERE id = prices.shop_id) as shop_name
                FROM prices WHERE ingredient_id = ANY(v_ingredient_ids)
                GROUP BY ingredient_id
            LOOP
                v_price_map := jsonb_set(v_price_map, ARRAY[v_price.ingredient_id::TEXT],
                    to_jsonb(jsonb_build_object('price', v_price.min_price, 'shop', COALESCE(v_price.shop_name, '待定'))));
            END LOOP;
            
            -- 处理每个食材
            FOR v_ingredient IN 
                SELECT DISTINCT ON (i.id) i.id, i.name
                FROM ingredients i
                WHERE i.id = ANY(v_ingredient_ids)
            LOOP
                -- 计算该计划的新总需求
                v_new_need := 0;
                FOR v_recipe IN 
                    SELECT * FROM recipes 
                    WHERE id = COALESCE(p_breakfast_recipe_id, v_old_plan.breakfast_recipe_id)
                       OR id = ANY(COALESCE(p_meal_ids, v_old_plan.meal_ids))
                LOOP
                    FOR v_ingredient IN 
                        SELECT jsonb_array_elements(COALESCE(v_recipe.ingredients, '[]'::JSONB))
                    LOOP
                        IF (v_ingredient->>'ingredient_id')::UUID = v_ingredient.id THEN
                            v_new_need := v_new_need + COALESCE((v_ingredient->>'quantity')::FLOAT, 0);
                        END IF;
                    END LOOP;
                END LOOP;
                
                v_stock := COALESCE((v_stock_map->v_ingredient.id::TEXT)::FLOAT, 0);
                
                -- 查找现有项
                v_existing_idx := -1;
                FOR i IN 0..jsonb_array_length(v_pending_items) - 1 LOOP
                    IF (v_pending_items->i->>'ingredient_id') = v_ingredient.id::TEXT THEN
                        v_existing_idx := i;
                        v_sources := COALESCE(v_pending_items->i->'sources', '{}'::JSONB);
                        EXIT;
                    END IF;
                END LOOP;
                
                IF v_existing_idx >= 0 THEN
                    -- 更新现有项的来源
                    v_sources := jsonb_set(v_sources, ARRAY[p_plan_id::TEXT], to_jsonb(v_new_need));
                    
                    -- 计算新的总需求
                    DECLARE
                        v_total_need FLOAT := 0;
                    BEGIN
                        FOR v_key, v_val IN SELECT * FROM jsonb_each_text(v_sources) LOOP
                            v_total_need := v_total_need + v_val;
                        END LOOP;
                        
                        IF v_stock >= v_total_need THEN
                            -- 库存充足，移除该项
                            v_pending_items := v_pending_items - v_existing_idx;
                        ELSE
                            -- 更新缺货量和来源
                            v_pending_items := jsonb_set(v_pending_items, ARRAY[v_existing_idx, 'sources'], v_sources);
                            v_pending_items := jsonb_set(v_pending_items, ARRAY[v_existing_idx, 'need_quantity'],
                                to_jsonb(v_total_need - v_stock));
                        END IF;
                    END;
                ELSIF v_new_need > v_stock THEN
                    -- 新增项
                    v_pending_items := v_pending_items || jsonb_build_array(
                        jsonb_build_object(
                            'ingredient_id', v_ingredient.id::TEXT,
                            'ingredient_name', v_ingredient.name,
                            'need_quantity', v_new_need - v_stock,
                            'unit', '',
                            'shop_name', COALESCE((v_price_map->v_ingredient.id::TEXT->>'shop'), '待定'),
                            'price', COALESCE((v_price_map->v_ingredient.id::TEXT->>'price')::FLOAT, 0),
                            'checked', FALSE,
                            'sources', jsonb_build_object(p_plan_id::TEXT, v_new_need)
                        )
                    );
                END IF;
            END LOOP;
            
            UPDATE purchase_tasks SET pending_items = v_pending_items WHERE id = v_task.id;
        END;
    END IF;
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'plan_id', p_plan_id
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE;
END;
$$ LANGUAGE plpgsql;
