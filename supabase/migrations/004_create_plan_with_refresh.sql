-- ============================================================
-- 函数: create_plan_with_refresh
-- 功能: 创建计划并增量更新采购清单
-- 原子性要求:
--   - 步骤1：向 plans 表插入新计划
--   - 步骤2：计算该计划的缺货食材
--   - 步骤3：更新 purchase_tasks 的 pending_items（新增或累加需求）
--   - 如果步骤3失败，步骤1必须回滚
-- ============================================================

CREATE OR REPLACE FUNCTION create_plan_with_refresh(
    p_date DATE,
    p_breakfast_recipe_id UUID DEFAULT NULL,
    p_meal_ids UUID[] DEFAULT '{}'
)
RETURNS JSONB AS $$
DECLARE
    v_plan_id UUID;
    v_ingredient_ids UUID[] := '{}';
    v_recipe RECORD;
    v_ingredient JSONB;
    v_pending_items JSONB := '[]'::JSONB;
    v_task RECORD;
    v_existing_idx INT;
    v_sources JSONB;
    v_key TEXT;
    v_val FLOAT;
BEGIN
    -- 步骤1：插入新计划
    INSERT INTO plans (date, breakfast_recipe_id, meal_ids)
    VALUES (p_date, p_breakfast_recipe_id, p_meal_ids)
    RETURNING id INTO v_plan_id;
    
    -- 步骤2：收集该计划所需的食材
    -- 获取早餐菜谱食材
    IF p_breakfast_recipe_id IS NOT NULL THEN
        SELECT * INTO v_recipe FROM recipes WHERE id = p_breakfast_recipe_id;
        IF FOUND THEN
            FOR v_ingredient IN SELECT jsonb_array_elements(COALESCE(v_recipe.ingredients, '[]'::JSONB)) LOOP
                IF (v_ingredient->>'ingredient_id') IS NOT NULL THEN
                    v_ingredient_ids := array_append(v_ingredient_ids, (v_ingredient->>'ingredient_id')::UUID);
                END IF;
            END LOOP;
        END IF;
    END IF;
    
    -- 获取正餐菜谱食材
    FOR v_recipe IN SELECT * FROM recipes WHERE id = ANY(p_meal_ids) LOOP
        FOR v_ingredient IN SELECT jsonb_array_elements(COALESCE(v_recipe.ingredients, '[]'::JSONB)) LOOP
            IF (v_ingredient->>'ingredient_id') IS NOT NULL THEN
                v_ingredient_ids := array_append(v_ingredient_ids, (v_ingredient->>'ingredient_id')::UUID);
            END IF;
        END LOOP;
    END LOOP;
    
    -- 获取库存信息
    DECLARE
        v_inventory RECORD;
        v_stock_map JSONB := '{}'::JSONB;
    BEGIN
        FOR v_inventory IN SELECT id, quantity FROM ingredients LOOP
            v_stock_map := jsonb_set(v_stock_map, ARRAY[v_inventory.id::TEXT], to_jsonb(COALESCE(v_inventory.quantity, 0)));
        END LOOP;
        
        -- 获取最低价信息
        DECLARE
            v_price_map JSONB := '{}'::JSONB;
            v_price RECORD;
        BEGIN
            FOR v_price IN 
                SELECT ingredient_id, MIN(price) as min_price, 
                       (SELECT name FROM shops WHERE id = prices.shop_id) as shop_name
                FROM prices 
                WHERE ingredient_id = ANY(v_ingredient_ids)
                GROUP BY ingredient_id
            LOOP
                v_price_map := jsonb_set(v_price_map, ARRAY[v_price.ingredient_id::TEXT], 
                    to_jsonb(jsonb_build_object('price', v_price.min_price, 'shop', COALESCE(v_price.shop_name, '待定'))));
            END LOOP;
            
            -- 步骤3：更新采购清单
            SELECT * INTO v_task FROM purchase_tasks WHERE status = TRUE LIMIT 1;
            
            -- 如果没有活跃任务，创建新任务
            IF NOT FOUND THEN
                INSERT INTO purchase_tasks (status, pending_items, completed_items, custom_items, removed_ingredient_ids)
                VALUES (TRUE, '[]'::JSONB, '[]'::JSONB, '[]'::JSONB, '[]'::JSONB)
                RETURNING * INTO v_task;
            END IF;
            
            v_pending_items := COALESCE(v_task.pending_items, '[]'::JSONB);
            
            -- 遍历每个食材
            FOR v_ingredient IN 
                SELECT i.id, i.name, i.quantity, 
                       (v_recipe.ingredients->0->>'quantity')::FLOAT as need_qty
                FROM ingredients i
                JOIN recipes r ON r.id = COALESCE(p_breakfast_recipe_id, p_meal_ids[1])
                CROSS JOIN LATERAL (
                    SELECT jsonb_array_elements(COALESCE(r.ingredients, '[]'::JSONB)) 
                    WHERE (jsonb_array_elements->>'ingredient_id')::UUID = i.id
                    LIMIT 1
                ) as src
                WHERE i.id = ANY(v_ingredient_ids)
            LOOP
                DECLARE
                    v_need_qty FLOAT := 0;
                    v_ing_from_recipes JSONB;
                BEGIN
                    -- 计算该计划对每个食材的总需求（简化版，实际应遍历所有引用的菜谱）
                    FOR v_ing_from_recipes IN
                        SELECT jsonb_array_elements(COALESCE(v_recipe.ingredients, '[]'::JSONB))
                        FROM recipes r
                        WHERE r.id = ANY(p_meal_ids) OR r.id = p_breakfast_recipe_id
                    LOOP
                        IF (v_ing_from_recipes->>'ingredient_id')::UUID = v_ingredient.id THEN
                            v_need_qty := v_need_qty + COALESCE((v_ing_from_recipes->>'quantity')::FLOAT, 0);
                        END IF;
                    END LOOP;
                    
                    -- 计算缺货量
                    DECLARE
                        v_stock FLOAT := COALESCE((v_stock_map->v_ingredient.id::TEXT)::FLOAT, 0);
                        v_need_total FLOAT := v_need_qty;
                    BEGIN
                        IF v_stock < v_need_total THEN
                            -- 检查是否已存在
                            v_existing_idx := -1;
                            FOR i IN 0..jsonb_array_length(v_pending_items) - 1 LOOP
                                IF (v_pending_items->i->>'ingredient_id') = v_ingredient.id::TEXT THEN
                                    v_existing_idx := i;
                                    EXIT;
                                END IF;
                            END LOOP;
                            
                            IF v_existing_idx >= 0 THEN
                                -- 更新现有项
                                v_sources := COALESCE(v_pending_items->v_existing_idx->'sources', '{}'::JSONB);
                                v_sources := jsonb_set(v_sources, ARRAY[v_plan_id::TEXT], to_jsonb(v_need_total));
                                
                                -- 计算新的总需求
                                v_need_total := 0;
                                FOR v_key, v_val IN SELECT * FROM jsonb_each_text(v_sources) LOOP
                                    v_need_total := v_need_total + v_val;
                                END LOOP;
                                
                                v_pending_items := jsonb_set(v_pending_items, ARRAY[v_existing_idx, 'sources'], v_sources);
                                v_pending_items := jsonb_set(v_pending_items, ARRAY[v_existing_idx, 'need_quantity'], 
                                    to_jsonb(GREATEST(v_need_total - v_stock, 0)));
                            ELSE
                                -- 新增项
                                v_pending_items := v_pending_items || jsonb_build_array(
                                    jsonb_build_object(
                                        'ingredient_id', v_ingredient.id::TEXT,
                                        'ingredient_name', v_ingredient.name,
                                        'need_quantity', v_need_total - v_stock,
                                        'unit', '',
                                        'shop_name', COALESCE((v_price_map->v_ingredient.id::TEXT->>'shop'), '待定'),
                                        'price', COALESCE((v_price_map->v_ingredient.id::TEXT->>'price')::FLOAT, 0),
                                        'checked', FALSE,
                                        'sources', jsonb_build_object(v_plan_id::TEXT, v_need_total)
                                    )
                                );
                            END IF;
                        END IF;
                    END;
                END;
            END LOOP;
            
            -- 更新采购任务
            UPDATE purchase_tasks
            SET pending_items = v_pending_items
            WHERE id = v_task.id;
        END;
    END;
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'plan_id', v_plan_id
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE;
END;
$$ LANGUAGE plpgsql;
