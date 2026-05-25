# 系统操作影响分析报告

## 一、数据库写操作函数清单

### 1. ingredients.py (食材管理)

| 函数名称 | 直接操作表 | 直接操作字段 | 间接影响表 | 当前实现情况 |
|---------|-----------|-------------|-----------|-------------|
| `create_ingredient` | ingredients | name, quantity, alias | 无 | 已处理 |
| `update_ingredient` | ingredients | 任意字段 | **purchase_tasks** (库存变化影响缺货计算) | **未处理** |
| `delete_ingredient` | ingredients, recipes, purchase_tasks | 删除记录, ingredients字段 | 无 | 已处理 |
| `resolve_ingredient_id` | ingredients | name, quantity=0 | 无 | 已处理 |
| `batch_update_quantities` | ingredients | quantity | **purchase_tasks** (库存变化影响缺货计算) | **未处理** |

### 2. plans.py (计划管理)

| 函数名称 | 直接操作表 | 直接操作字段 | 间接影响表 | 当前实现情况 |
|---------|-----------|-------------|-----------|-------------|
| `create_plan` | plans | date, breakfast_recipe_id, meal_ids | purchase_tasks (增量更新) | 已处理 |
| `update_plan` | plans | date, breakfast_recipe_id, meal_ids | purchase_tasks (增量更新) | 已处理 |
| `delete_plan` | plans | 删除记录 | purchase_tasks (增量更新) | 已处理 |

### 3. shopping.py (采购管理)

| 函数名称 | 直接操作表 | 直接操作字段 | 间接影响表 | 当前实现情况 |
|---------|-----------|-------------|-----------|-------------|
| `complete_purchase` | purchase_tasks, ingredients | pending_items, completed_items, quantity | 无 | 已处理(非事务) |
| `delete_item` | purchase_tasks | pending_items, removed_ingredient_ids | 无 | 已处理 |
| `clear_task` | purchase_tasks | pending_items, status, completed_at | 无 | 已处理 |
| `refresh_purchase_task` | purchase_tasks, shopping_list | pending_items, 删除/插入记录 | 无 | 已处理 |

### 4. prices.py (价格管理)

| 函数名称 | 直接操作表 | 直接操作字段 | 间接影响表 | 当前实现情况 |
|---------|-----------|-------------|-----------|-------------|
| `create_price` | prices | ingredient_id, shop_id, price | **purchase_tasks** (最低价变化影响店铺推荐) | **未处理** |
| `update_price` | prices | price | **purchase_tasks** (最低价变化影响店铺推荐) | **未处理** |
| `delete_price` | prices | 删除记录 | **purchase_tasks** (依赖该价格的项需重新分配) | **未处理** |
| `upsert_price` | prices | price | **purchase_tasks** (最低价变化影响店铺推荐) | **未处理** |

### 5. shops.py (店铺管理)

| 函数名称 | 直接操作表 | 直接操作字段 | 间接影响表 | 当前实现情况 |
|---------|-----------|-------------|-----------|-------------|
| `create_shop` | shops | name, address | prices (外键关联) | 已处理 |
| `update_shop` | shops | name, address | 无 | 已处理 |
| `delete_shop` | shops | 删除记录 | **prices** (级联删除), **purchase_tasks** (依赖该店铺的项需归入待定) | **未处理** |

---

## 二、需要事务性的操作组合

| 操作组合 | 涉及表 | 事务必要性 | 当前状态 |
|---------|-------|-----------|---------|
| 完成采购 | purchase_tasks, ingredients | **高** - 库存更新和任务更新必须同时成功 | 非事务 |
| 创建计划 + 增量更新 | plans, purchase_tasks | 中 | 非事务 |
| 删除食材 + 清理引用 | ingredients, recipes, purchase_tasks | **高** - 必须全部成功或全部回滚 | 非事务 |
| 清空任务 | purchase_tasks | 低 | 单表操作 |

---

## 三、遗漏场景详细分析

### 1. 价格变更 → 采购清单联动

**场景**：新增/修改/删除价格可能改变某食材的最低价

**影响**：采购清单中对应食材的 `shop_name` 和 `price` 字段需重新计算

**当前状态**：未处理

**建议方案**：
- 新增/修改价格时，检查是否成为该食材的最低价
- 如果是，调用增量更新函数更新采购清单中该食材的店铺和价格
- 删除价格时，重新计算该食材的最低价并更新采购清单

### 2. 店铺删除 → 采购清单联动

**场景**：删除店铺会导致该店铺的所有价格失效

**影响**：采购清单中依赖该店铺价格的项需重新分配或归入"待定"

**当前状态**：未处理

**建议方案**：
- 删除店铺前，找出所有使用该店铺价格的采购项
- 对这些采购项重新计算最低价，若无其他价格则设为"待定"

### 3. 计划过期自动处理

**场景**：计划日期 < 今天时，若采购清单中还有待购项

**影响**：应自动完成该任务（按清空逻辑）

**当前状态**：未处理

**建议方案**：
- 在 `get_active_task` 或定期任务中检查过期计划
- 自动将过期计划相关的待购项加入黑名单并完成任务

### 4. 菜谱变更 → 采购清单联动

**场景**：增删改菜谱，若该菜谱被某个计划引用

**影响**：应重新计算该计划的缺货情况并增量更新采购清单

**当前状态**：未处理

**建议方案**：
- 菜谱变更时，找出所有引用该菜谱的计划
- 对每个计划调用增量更新函数

### 5. 库存手动修改 → 采购清单联动

**场景**：手动修改库存数量

**影响**：可能使某些缺货食材变为充足，或反之

**当前状态**：未处理

**建议方案**：
- 修改库存后，检查是否影响采购清单中的待购项
- 对受影响的食材重新计算缺货量

---

## 四、事务性问题分析

### 当前问题

1. **complete_purchase** 函数：
   - 先更新库存，再更新采购任务
   - 如果库存更新成功但任务更新失败，会导致数据不一致

2. **delete_ingredient** 函数：
   - 依次更新 recipes 和 purchase_tasks
   - 中间任意一步失败会导致数据不一致

### 建议解决方案

采用 Supabase RPC（PostgreSQL 函数）实现事务性操作：

```sql
-- 示例：完成采购的事务函数
CREATE OR REPLACE FUNCTION complete_purchase(task_id text, checked_items jsonb)
RETURNS jsonb AS $$
DECLARE
    item jsonb;
    ing_id text;
    qty numeric;
BEGIN
    -- 开始事务（隐式）
    
    -- 更新库存
    FOR item IN SELECT jsonb_array_elements(checked_items) LOOP
        ing_id := (item ->> 'ingredient_id')::text;
        qty := (item ->> 'need_quantity')::numeric;
        
        IF ing_id IS NOT NULL THEN
            UPDATE ingredients 
            SET quantity = quantity + qty,
                added_at = CURRENT_TIMESTAMP
            WHERE id = ing_id;
        END IF;
    END LOOP;
    
    -- 更新采购任务
    UPDATE purchase_tasks
    SET pending_items = pending_items - checked_items,
        completed_items = completed_items || checked_items
    WHERE id = task_id;
    
    RETURN jsonb_build_object('success', true);
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE; -- 自动回滚
END;
$$ LANGUAGE plpgsql;
```

---

## 五、优先级排序

### 高优先级
1. ✅ 完成采购事务性（已部分实现，需改为RPC）
2. ✅ 删除食材事务性
3. ⬜ 价格变更联动采购清单
4. ⬜ 店铺删除联动采购清单

### 中优先级
5. ⬜ 菜谱变更联动采购清单
6. ⬜ 库存手动修改联动采购清单

### 低优先级
7. ⬜ 计划过期自动处理

---

## 六、已完成的修改

### SQL 函数文件（supabase/migrations/）

| 文件名 | 函数名 | 功能 | 状态 |
|-------|-------|------|------|
| 001_update_ingredient_safe.sql | `update_ingredient_safe` | 更新食材+联动采购清单 | ✅ |
| 002_batch_update_quantities_safe.sql | `batch_update_quantities_safe` | 批量更新库存+联动采购清单 | ✅ |
| 003_delete_ingredient_cascade.sql | `delete_ingredient_cascade` | 删除食材+级联清理引用 | ✅ |
| 004_create_plan_with_refresh.sql | `create_plan_with_refresh` | 创建计划+增量更新采购清单 | ✅ |
| 005_update_plan_with_refresh.sql | `update_plan_with_refresh` | 更新计划+增量更新采购清单 | ✅ |
| 006_delete_plan_with_refresh.sql | `delete_plan_with_refresh` | 删除计划+增量更新采购清单 | ✅ |
| 007_complete_purchase_task.sql | `complete_purchase_task` | 完成采购（事务性） | ✅ |
| 008_upsert_price_with_refresh.sql | `upsert_price_with_refresh` | Upsert价格+联动采购清单 | ✅ |
| 009_delete_price_with_refresh.sql | `delete_price_with_refresh` | 删除价格+联动采购清单 | ✅ |
| 010_delete_shop_cascade.sql | `delete_shop_cascade` | 删除店铺+级联清理 | ✅ |

### 后端路由修改

| 路由文件 | 修改的函数 | 调用RPC |
|---------|-----------|--------|
| ingredients.py | `update_ingredient` | `update_ingredient_safe` |
| ingredients.py | `delete_ingredient` | `delete_ingredient_cascade` |
| ingredients.py | `batch_update_quantities` | `batch_update_quantities_safe` |
| plans.py | `create_plan` | `create_plan_with_refresh` |
| plans.py | `update_plan` | `update_plan_with_refresh` |
| plans.py | `delete_plan` | `delete_plan_with_refresh` |
| shopping.py | `complete_purchase` | `complete_purchase_task` |
| prices.py | `update_price` | `upsert_price_with_refresh` |
| prices.py | `delete_price` | `delete_price_with_refresh` |
| prices.py | `upsert_price` | `upsert_price_with_refresh` |
| shops.py | `delete_shop` | `delete_shop_cascade` |

## 七、待处理任务

| 优先级 | 任务 | 状态 |
|-------|------|------|
| 低 | 实现菜谱变更联动更新 | ⬜ 待处理 |
| 低 | 实现计划过期自动处理 | ⬜ 待处理 |

---

## 七、验证方法

| 操作 | 验证步骤 |
|-----|---------|
| 完成采购 | 调用 `/api/shopping/task/complete`，检查库存增加且采购任务更新 |
| 删除食材 | 调用 `/api/ingredients/{id}` DELETE，检查菜谱和采购任务中的引用被清除 |
| 创建价格 | 创建新价格后，检查采购清单中对应食材的店铺是否更新 |
| 删除店铺 | 删除店铺后，检查采购清单中依赖该店铺的项是否归入"待定" |
| 修改菜谱 | 修改菜谱后，检查引用该菜谱的计划对应的采购项是否更新 |