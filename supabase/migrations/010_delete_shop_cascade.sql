-- ============================================================
-- 函数: delete_shop_cascade
-- 功能: 删除店铺，级联处理价格和采购清单
-- 原子性要求:
--   - 步骤1：从 shops 表删除该店铺
--   - 步骤2：从 prices 表删除所有引用该店铺的记录
--   - 步骤3：对受影响的食材，重新查找最低价店铺，更新 purchase_tasks 的 pending_items
--   - 如果步骤2失败，步骤1必须回滚；如果步骤3失败，步骤1和2必须回滚
-- ============================================================

CREATE OR REPLACE FUNCTION delete_shop_cascade(
    p_shop_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_affected_ingredients UUID[] := '{}';
    v_price RECORD;
    v_pending_items JSONB;
    v_task RECORD;
    v_updated_count INT := 0;
BEGIN
    -- 检查店铺是否存在
    IF NOT EXISTS (SELECT 1 FROM shops WHERE id = p_shop_id) THEN
        RAISE EXCEPTION '店铺不存在: %', p_shop_id;
    END IF;
    
    -- 收集受影响的食材
    FOR v_price IN SELECT DISTINCT ingredient_id FROM prices WHERE shop_id = p_shop_id LOOP
        v_affected_ingredients := array_append(v_affected_ingredients, v_price.ingredient_id);
    END LOOP;
    
    -- 步骤2：删除价格记录
    DELETE FROM prices WHERE shop_id = p_shop_id;
    
    -- 步骤1：删除店铺
    DELETE FROM shops WHERE id = p_shop_id;
    
    -- 步骤3：更新采购清单
    SELECT * INTO v_task FROM purchase_tasks WHERE status = TRUE LIMIT 1;
    
    IF FOUND AND array_length(v_affected_ingredients, 1) > 0 THEN
        v_pending_items := COALESCE(v_task.pending_items, '[]'::JSONB);
        
        -- 遍历待购项，更新受影响的食材
        FOR i IN 0..jsonb_array_length(v_pending_items) - 1 LOOP
            DECLARE
                v_ing_id TEXT := v_pending_items->i->>'ingredient_id';
            BEGIN
                IF v_ing_id = ANY(v_affected_ingredients) THEN
                    -- 查找该食材的新最低价
                    DECLARE
                        v_new_min JSONB;
                    BEGIN
                        SELECT 
                            MIN(price) as min_price,
                            (SELECT name FROM shops WHERE id = prices.shop_id) as shop_name
                        INTO v_new_min
                        FROM prices
                        WHERE ingredient_id = v_ing_id::UUID;
                        
                        v_pending_items := jsonb_set(v_pending_items, ARRAY[i, 'shop_name'], 
                            to_jsonb(COALESCE(v_new_min->>'shop_name', '待定')));
                        v_pending_items := jsonb_set(v_pending_items, ARRAY[i, 'price'], 
                            to_jsonb(COALESCE((v_new_min->>'min_price')::FLOAT, 0)));
                        v_updated_count := v_updated_count + 1;
                    END;
                END IF;
            END;
        END LOOP;
        
        UPDATE purchase_tasks SET pending_items = v_pending_items WHERE id = v_task.id;
    END IF;
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'shop_id', p_shop_id,
        'affected_ingredients', v_affected_ingredients,
        'updated_count', v_updated_count
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE;
END;
$$ LANGUAGE plpgsql;
