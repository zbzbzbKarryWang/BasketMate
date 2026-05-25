-- ============================================================
-- 函数: upsert_price_with_refresh
-- 功能: 创建或更新价格，仅当新价格成为最低价时联动更新采购清单
-- 原子性要求:
--   - 步骤1：查询该食材当前的最低价
--   - 步骤2：向 prices 表插入或更新一条价格记录
--   - 步骤3：如果新价格比之前的最低价更低，则更新采购清单
--   - 如果步骤3失败，步骤2必须回滚
-- ============================================================

CREATE OR REPLACE FUNCTION upsert_price_with_refresh(
    p_ingredient_id UUID,
    p_shop_id UUID,
    p_price FLOAT
)
RETURNS JSONB AS $$
DECLARE
    v_existing_price_id UUID;
    v_current_min_price FLOAT;
    v_current_min_shop TEXT;
    v_pending_items JSONB;
    v_task RECORD;
    v_updated_count INT := 0;
BEGIN
    -- 步骤1：查询该食材当前的最低价和对应店铺
    SELECT MIN(price), (SELECT name FROM shops WHERE id = prices.shop_id) as shop_name
    INTO v_current_min_price, v_current_min_shop
    FROM prices
    WHERE ingredient_id = p_ingredient_id;
    
    -- 步骤2：插入或更新价格记录
    SELECT id INTO v_existing_price_id
    FROM prices
    WHERE ingredient_id = p_ingredient_id AND shop_id = p_shop_id;
    
    IF v_existing_price_id IS NOT NULL THEN
        UPDATE prices SET price = p_price WHERE id = v_existing_price_id;
    ELSE
        INSERT INTO prices (ingredient_id, shop_id, price)
        VALUES (p_ingredient_id, p_shop_id, p_price);
    END IF;
    
    -- 步骤3：只有当新价格比之前的最低价更低时，才更新采购清单
    -- 两种情况需要更新：
    -- 1. 当前没有最低价（首次添加价格）
    -- 2. 新价格 < 当前最低价
    IF v_current_min_price IS NULL OR p_price < v_current_min_price THEN
        -- 获取新最低价对应的店铺名称
        SELECT name INTO v_current_min_shop
        FROM shops
        WHERE id = p_shop_id;
        
        SELECT * INTO v_task FROM purchase_tasks WHERE status = TRUE LIMIT 1;
        
        IF FOUND THEN
            v_pending_items := COALESCE(v_task.pending_items, '[]'::JSONB);
            
            -- 遍历待购项，找到该食材并更新
            FOR i IN 0..jsonb_array_length(v_pending_items) - 1 LOOP
                IF (v_pending_items->i->>'ingredient_id') = p_ingredient_id::TEXT THEN
                    v_pending_items := jsonb_set(v_pending_items, ARRAY[i, 'shop_name'], 
                        to_jsonb(COALESCE(v_current_min_shop, '待定')));
                    v_pending_items := jsonb_set(v_pending_items, ARRAY[i, 'price'], 
                        to_jsonb(p_price));
                    v_updated_count := v_updated_count + 1;
                END IF;
            END LOOP;
            
            UPDATE purchase_tasks SET pending_items = v_pending_items WHERE id = v_task.id;
        END IF;
    END IF;
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'ingredient_id', p_ingredient_id,
        'previous_min_price', v_current_min_price,
        'new_price', p_price,
        'triggered_refresh', v_current_min_price IS NULL OR p_price < v_current_min_price,
        'updated_count', v_updated_count
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE;
END;
$$ LANGUAGE plpgsql;