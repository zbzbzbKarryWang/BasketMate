-- ============================================================
-- 函数: delete_price_with_refresh
-- 功能: 删除价格，联动更新采购清单
-- 原子性要求:
--   - 步骤1：从 prices 表删除该价格记录
--   - 步骤2：查询该食材剩余的最低价店铺（若无则设为"待定"）
--   - 步骤3：更新 purchase_tasks 的 pending_items 中该食材的 shop_name 和 price
--   - 如果步骤3失败，步骤1必须回滚
-- ============================================================

CREATE OR REPLACE FUNCTION delete_price_with_refresh(
    p_price_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_deleted_price RECORD;
    v_ingredient_id UUID;
    v_new_min_price FLOAT;
    v_new_min_shop TEXT;
    v_pending_items JSONB;
    v_task RECORD;
    v_updated_count INT := 0;
BEGIN
    -- 获取被删除价格的信息
    SELECT * INTO v_deleted_price FROM prices WHERE id = p_price_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION '价格记录不存在: %', p_price_id;
    END IF;
    
    v_ingredient_id := v_deleted_price.ingredient_id;
    
    -- 步骤1：删除价格
    DELETE FROM prices WHERE id = p_price_id;
    
    -- 步骤2：查询该食材剩余的最低价
    SELECT MIN(price), (SELECT name FROM shops WHERE id = prices.shop_id) as shop_name
    INTO v_new_min_price, v_new_min_shop
    FROM prices
    WHERE ingredient_id = v_ingredient_id;
    
    -- 步骤3：更新采购清单
    SELECT * INTO v_task FROM purchase_tasks WHERE status = TRUE LIMIT 1;
    
    IF FOUND THEN
        v_pending_items := COALESCE(v_task.pending_items, '[]'::JSONB);
        
        -- 遍历待购项，找到该食材并更新
        FOR i IN 0..jsonb_array_length(v_pending_items) - 1 LOOP
            IF (v_pending_items->i->>'ingredient_id') = v_ingredient_id::TEXT THEN
                v_pending_items := jsonb_set(v_pending_items, ARRAY[i, 'shop_name'], 
                    to_jsonb(COALESCE(v_new_min_shop, '待定')));
                v_pending_items := jsonb_set(v_pending_items, ARRAY[i, 'price'], 
                    to_jsonb(COALESCE(v_new_min_price, 0)));
                v_updated_count := v_updated_count + 1;
            END IF;
        END LOOP;
        
        UPDATE purchase_tasks SET pending_items = v_pending_items WHERE id = v_task.id;
    END IF;
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'price_id', p_price_id,
        'ingredient_id', v_ingredient_id,
        'new_min_price', v_new_min_price,
        'new_min_shop', v_new_min_shop,
        'updated_count', v_updated_count
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE;
END;
$$ LANGUAGE plpgsql;
