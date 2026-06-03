-- ============================================================
-- 函数: confirm_import_transaction
-- 功能: 确认导入（原子性事务操作）
-- 事务要求:
--   - 步骤1：批量插入黑名单
--   - 步骤2：批量创建新食材
--   - 步骤3：批量更新食材库存
--   - 步骤4：批量更新食材别名
--   - 步骤5：批量插入价格记录
--   - 步骤6：批量更新价格记录
--   - 步骤7：更新导入记录状态为 imported
--   - 如果任何步骤失败，整个事务回滚，状态设为 failed
-- ============================================================

CREATE OR REPLACE FUNCTION confirm_import_transaction(
    p_record_id UUID,
    p_deleted_patterns JSONB,        -- 格式: ["pattern1", "pattern2", ...]
    p_items JSONB,                   -- 格式: [{name, price, quantity, target_ingredient}]
    p_import_type JSONB,             -- 格式: ["inventory", "price_compare"]
    p_shop_id UUID DEFAULT NULL      -- 店铺ID（比价时需要）
)
RETURNS JSONB AS $$
DECLARE
    v_status TEXT;
    v_pattern TEXT;
    v_item JSONB;
    v_name TEXT;
    v_price FLOAT;
    v_quantity INT;
    v_target_ingredient UUID;
    v_ingredient_id UUID;
    v_existing_ingredient RECORD;
    v_existing_price RECORD;
    v_current_alias TEXT;
    v_new_alias TEXT;
    v_current_qty FLOAT;
    v_new_qty FLOAT;
    v_new_ingredient_id UUID;
    v_check_name TEXT;
    v_blacklist_count INT := 0;
    v_new_ingredient_count INT := 0;
    v_inventory_count INT := 0;
    v_alias_count INT := 0;
    v_price_insert_count INT := 0;
    v_price_update_count INT := 0;
    v_now TIMESTAMP := NOW();
    v_new_ingredients JSONB := '[]'::JSONB;
    v_created_ingredient_ids UUID[] := '{}';
    v_is_new_ingredient BOOLEAN;
BEGIN
    -- 检查导入记录是否存在且未导入
    SELECT status INTO v_status FROM import_records WHERE id = p_record_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION '导入记录不存在: %', p_record_id;
    END IF;
    
    IF v_status = 'imported' THEN
        RAISE EXCEPTION '导入记录已导入: %', p_record_id;
    END IF;
    
    -- ========== 步骤1：批量插入黑名单 ==========
    IF p_deleted_patterns IS NOT NULL AND jsonb_array_length(p_deleted_patterns) > 0 THEN
        FOR v_pattern IN SELECT jsonb_array_elements_text(p_deleted_patterns) LOOP
            v_pattern := TRIM(v_pattern);
            IF v_pattern <> '' THEN
                -- 检查是否已存在
                IF NOT EXISTS (SELECT 1 FROM blacklist WHERE pattern = v_pattern) THEN
                    INSERT INTO blacklist (pattern, created_at)
                    VALUES (v_pattern, v_now);
                    v_blacklist_count := v_blacklist_count + 1;
                END IF;
            END IF;
        END LOOP;
    END IF;
    
    -- ========== 步骤2-6：处理商品 ==========
    IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
        -- 先收集需要创建的新食材
        FOR v_item IN SELECT jsonb_array_elements(p_items) LOOP
            v_name := TRIM(v_item->>'name');
            v_target_ingredient := (v_item->>'target_ingredient')::UUID;
            
            IF v_name IS NOT NULL AND v_name <> '' AND v_target_ingredient IS NULL THEN
                -- 检查是否存在同名食材
                SELECT id INTO v_ingredient_id FROM ingredients WHERE name = v_name LIMIT 1;
                
                IF v_ingredient_id IS NULL THEN
                    -- 需要创建新食材，先收集
                    v_new_ingredients := v_new_ingredients || jsonb_build_object(
                        'name', v_name,
                        'price', (v_item->>'price')::FLOAT,
                        'quantity', (v_item->>'quantity')::INT
                    );
                END IF;
            END IF;
        END LOOP;
        
        -- 批量创建新食材
        IF jsonb_array_length(v_new_ingredients) > 0 THEN
            FOR v_item IN SELECT jsonb_array_elements(v_new_ingredients) LOOP
                v_name := v_item->>'name';
                v_quantity := COALESCE((v_item->>'quantity')::INT, 1);
                
                -- 如果是库存导入，直接设置初始库存
                IF p_import_type ? 'inventory' THEN
                    INSERT INTO ingredients (name, quantity, added_at)
                    VALUES (v_name, v_quantity, v_now)
                    RETURNING id INTO v_new_ingredient_id;
                ELSE
                    INSERT INTO ingredients (name, quantity, added_at)
                    VALUES (v_name, 0, v_now)
                    RETURNING id INTO v_new_ingredient_id;
                END IF;
                
                v_created_ingredient_ids := array_append(v_created_ingredient_ids, v_new_ingredient_id);
                v_new_ingredient_count := v_new_ingredient_count + 1;
                
                -- 为新食材添加价格（如果有店铺）
                IF p_shop_id IS NOT NULL AND p_import_type ? 'price_compare' THEN
                    v_price := COALESCE((v_item->>'price')::FLOAT, 0);
                    IF v_price > 0 THEN
                        INSERT INTO prices (ingredient_id, shop_id, price)
                        VALUES (v_new_ingredient_id, p_shop_id, v_price);
                    ELSE
                        -- 价格为0时设为NULL
                        INSERT INTO prices (ingredient_id, shop_id, price)
                        VALUES (v_new_ingredient_id, p_shop_id, NULL);
                    END IF;
                    v_price_insert_count := v_price_insert_count + 1;
                END IF;
            END LOOP;
        END IF;
        
        -- 处理每个商品（更新库存、别名、价格）
        FOR v_item IN SELECT jsonb_array_elements(p_items) LOOP
            v_name := TRIM(v_item->>'name');
            v_price := COALESCE((v_item->>'price')::FLOAT, 0);
            v_quantity := COALESCE((v_item->>'quantity')::INT, 1);
            v_target_ingredient := (v_item->>'target_ingredient')::UUID;
            
            IF v_name IS NULL OR v_name = '' THEN
                CONTINUE;
            END IF;
            
            v_ingredient_id := NULL;
            v_is_new_ingredient := FALSE;
            
            -- 确定食材ID
            IF v_target_ingredient IS NOT NULL THEN
                -- 用户指定了归并食材
                v_ingredient_id := v_target_ingredient;
                
                -- 检查是否需要更新别名
                SELECT name, alias INTO v_existing_ingredient
                FROM ingredients WHERE id = v_ingredient_id;
                
                IF FOUND THEN
                    v_current_alias := COALESCE(v_existing_ingredient.alias, '');
                    IF v_name <> v_existing_ingredient.name AND position(v_name in v_current_alias) = 0 THEN
                        -- 追加别名
                        IF v_current_alias = '' THEN
                            v_new_alias := v_name;
                        ELSE
                            v_new_alias := v_current_alias || '、' || v_name;
                        END IF;
                        
                        UPDATE ingredients SET alias = v_new_alias WHERE id = v_ingredient_id;
                        v_alias_count := v_alias_count + 1;
                    END IF;
                END IF;
            ELSE
                -- 查找是否已存在同名食材
                SELECT id INTO v_ingredient_id FROM ingredients WHERE name = v_name LIMIT 1;
                
                -- 如果没找到，检查是否是新创建的食材
                IF v_ingredient_id IS NULL THEN
                    FOR i IN 1..array_length(v_created_ingredient_ids, 1) LOOP
                        SELECT name INTO v_check_name FROM ingredients WHERE id = v_created_ingredient_ids[i];
                        IF v_check_name = v_name THEN
                            v_ingredient_id := v_created_ingredient_ids[i];
                            v_is_new_ingredient := TRUE;
                            EXIT;
                        END IF;
                    END LOOP;
                END IF;
            END IF;
            
            -- 更新库存（只对已存在的食材，新食材已在创建时设置库存）
            IF v_ingredient_id IS NOT NULL AND p_import_type ? 'inventory' AND v_is_new_ingredient = FALSE THEN
                SELECT quantity INTO v_current_qty FROM ingredients WHERE id = v_ingredient_id;
                v_new_qty := COALESCE(v_current_qty, 0) + v_quantity;
                
                UPDATE ingredients 
                SET quantity = v_new_qty, added_at = v_now
                WHERE id = v_ingredient_id;
                v_inventory_count := v_inventory_count + 1;
            END IF;
            
            -- 更新价格（只对已存在的食材，新食材已在创建时添加价格）
            IF v_ingredient_id IS NOT NULL AND p_shop_id IS NOT NULL AND p_import_type ? 'price_compare' AND v_is_new_ingredient = FALSE THEN
                -- 查找是否已有价格记录
                SELECT id, price INTO v_existing_price
                FROM prices WHERE ingredient_id = v_ingredient_id AND shop_id = p_shop_id;
                
                IF FOUND THEN
                    -- 已有价格记录，只有新价格不为0时才更新
                    IF v_price > 0 THEN
                        UPDATE prices SET price = v_price WHERE id = v_existing_price.id;
                        v_price_update_count := v_price_update_count + 1;
                    END IF;
                ELSE
                    -- 无价格记录，插入新价格
                    IF v_price > 0 THEN
                        INSERT INTO prices (ingredient_id, shop_id, price)
                        VALUES (v_ingredient_id, p_shop_id, v_price);
                    ELSE
                        INSERT INTO prices (ingredient_id, shop_id, price)
                        VALUES (v_ingredient_id, p_shop_id, NULL);
                    END IF;
                    v_price_insert_count := v_price_insert_count + 1;
                END IF;
            END IF;
        END LOOP;
    END IF;
    
    -- ========== 步骤7：更新导入记录状态 ==========
    UPDATE import_records 
    SET status = 'imported'
    WHERE id = p_record_id;
    
    -- 返回结果
    RETURN jsonb_build_object(
        'success', TRUE,
        'record_id', p_record_id,
        'blacklist_count', v_blacklist_count,
        'new_ingredient_count', v_new_ingredient_count,
        'inventory_count', v_inventory_count,
        'alias_count', v_alias_count,
        'price_insert_count', v_price_insert_count,
        'price_update_count', v_price_update_count
    );
    
EXCEPTION
    WHEN OTHERS THEN
        -- 事务自动回滚，更新状态为失败
        UPDATE import_records 
        SET status = 'failed'
        WHERE id = p_record_id;
        
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', SQLERRM
        );
END;
$$ LANGUAGE plpgsql;