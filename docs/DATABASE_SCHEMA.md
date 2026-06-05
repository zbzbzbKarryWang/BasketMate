# 数据库 Schema 文档

## 概述
本文档列出所有数据库表、字段及其使用状态。

---

## 表清单

### 1. ingredients (食材/库存) 🟢
**状态**: 正在使用

| 字段 | 类型 | 可空 | 默认 | 说明 | 使用状态 |
|------|------|------|------|------|----------|
| id | uuid | 否 | gen_random_uuid() | 主键 | 🟢 |
| name | text | 否 | - | 食材名称（唯一） | 🟢 |
| quantity | double precision | 否 | 0 | 库存数量 | 🟢 |
| added_at | timestamptz | 否 | now() | 添加时间 | 🟢 |
| alias | text | 是 | - | 别名（未在 schema 中，但代码中使用） | 🟢 |
| ~~unit~~ | text | 是 | - | **已废弃** | 🔴 |

**相关代码**:
- 后端: `routers/ingredients.py`, `models.py`
- 前端: `lib/types.ts`, `components/inventory-page.tsx`


### 2. shops (店铺) 🟢
**状态**: 正在使用

| 字段 | 类型 | 可空 | 默认 | 说明 | 使用状态 |
|------|------|------|------|------|----------|
| id | uuid | 否 | gen_random_uuid() | 主键 | 🟢 |
| name | text | 否 | - | 店铺名称（唯一） | 🟢 |

**相关代码**:
- 后端: `routers/shops.py`
- 前端: `lib/types.ts`, `components/price-page.tsx`


### 3. prices (比价) 🟢
**状态**: 正在使用

| 字段 | 类型 | 可空 | 默认 | 说明 | 使用状态 |
|------|------|------|------|------|----------|
| id | uuid | 否 | gen_random_uuid() | 主键 | 🟢 |
| ingredient_id | uuid | 否 | - | 关联食材 | 🟢 |
| shop_id | uuid | 否 | - | 关联店铺 | 🟢 |
| price | double precision | 否 | - | 价格 | 🟢 |

**约束**:
- 外键: `ingredient_id` → `ingredients.id` (级联删除)
- 外键: `shop_id` → `shops.id` (级联删除)
- 唯一约束: `(ingredient_id, shop_id)`

**相关代码**:
- 后端: `routers/prices.py`, `services/shopping_service.py`
- 前端: `lib/types.ts`, `components/price-page.tsx`


### 4. recipes (菜谱) 🟢
**状态**: 正在使用

| 字段 | 类型 | 可空 | 默认 | 说明 | 使用状态 |
|------|------|------|------|------|----------|
| id | uuid | 否 | gen_random_uuid() | 主键 | 🟢 |
| name | text | 否 | - | 菜谱名称 | 🟢 |
| category | text | 否 | - | 分类 | 🟢 |
| ingredients | jsonb | 否 | [] | 食材列表 | 🟢 |
| notes | text | 是 | - | 备注（未在 schema 中，但代码中使用） | 🟢 |

**ingredients JSON 格式**:
```json
[
  {
    "ingredient_id": "uuid",
    "quantity": 2.0,
    "name": "可选"
  }
]
```

**相关代码**:
- 后端: `routers/recipes.py`, `models.py`
- 前端: `lib/types.ts`, `components/recipes-page.tsx`


### 5. plans (用餐计划) 🟢
**状态**: 正在使用

| 字段 | 类型 | 可空 | 默认 | 说明 | 使用状态 |
|------|------|------|------|------|----------|
| id | uuid | 否 | gen_random_uuid() | 主键 | 🟢 |
| date | date | 否 | - | 计划日期 | 🟢 |
| breakfast_item | text | 是 | - | 早餐选择 | 🟢 |
| meal_ids | uuid[] | 否 | [] | 正餐菜谱 ID 列表 | 🟢 |
| breakfast_wheel_extras | jsonb | 否 | [] | 早餐转盘额外选项 | 🟢 |
| breakfast_wheel_hidden_ids | text[] | 否 | [] | 早餐转盘隐藏 ID | 🟢 |

**索引**:
- `idx_plans_date`: 日期索引

**相关代码**:
- 后端: `routers/plans.py`, `services/shopping_service.py`
- 前端: `lib/types.ts`, `components/plan-page.tsx`


### 6. shopping_list (采购清单) 🔴
**状态**: **已废弃**

| 字段 | 类型 | 可空 | 默认 | 说明 | 原因 |
|------|------|------|------|------|------|
| id | uuid | 否 | gen_random_uuid() | 主键 | 已被 purchase_tasks 表替代 |
| ingredient_id | uuid | 是 | - | 关联食材 | - |
| shop_name | text | 否 | 待定 | 店铺名称 | - |
| need_quantity | double precision | 否 | 1 | 需要数量 | - |
| checked | boolean | 否 | false | 是否已勾选 | - |
| ingredient_name | text | 是 | - | 食材名称 | - |
| is_ephemeral | boolean | 否 | false | 是否临时项 | - |

**废弃原因**: 已迁移到 `purchase_tasks` 表，支持更丰富的功能。

**相关代码**: 不再使用


### 7. purchase_tasks (采购任务) 🟢
**状态**: 正在使用

**注意**: 此表未在 `schema.sql` 中定义，但在代码中大量使用。

| 字段 | 类型 | 可空 | 默认 | 说明 | 使用状态 |
|------|------|------|------|------|----------|
| id | uuid | 否 | gen_random_uuid() | 主键 | 🟢 |
| status | boolean | 否 | true | 是否活跃（true=活跃，false=已完成） | 🟢 |
| pending_items | jsonb | 否 | [] | 待购项列表 | 🟢 |
| custom_items | jsonb | 否 | [] | 自定义项列表 | 🟢 |
| completed_items | jsonb | 否 | [] | 已完成项列表 | 🟢 |
| removed_ingredient_ids | uuid[] | 否 | [] | 已移除食材 ID（黑名单） | 🟢 |
| created_at | timestamptz | 否 | now() | 创建时间 | 🟢 |
| completed_at | timestamptz | 是 | - | 完成时间 | 🟢 |

**pending_items JSON 格式**:
```json
[
  {
    "ingredient_id": "uuid",
    "ingredient_name": "名称",
    "need_quantity": 2.0,
    "shop_name": "店铺",
    "price": 10.5,
    "checked": false,
    "sources": {
      "plan_id": 2.0
    }
  }
]
```

**相关代码**:
- 后端: `routers/shopping.py`, `routers/plans.py`, `services/shopping_service.py`
- 前端: `lib/types.ts`, `components/shopping-page.tsx`


### 8. import_records (导入记录) 🟢
**状态**: 正在使用

| 字段 | 类型 | 可空 | 默认 | 说明 | 使用状态 |
|------|------|------|------|------|----------|
| id | uuid | 否 | gen_random_uuid() | 主键 | 🟢 |
| created_at | timestamptz | 否 | now() | 创建时间 | 🟢 |
| shop_name | text | 是 | - | 店铺名称 | 🟢 |
| import_type | jsonb | 否 | [] | 导入类型（["inventory", "price"]） | 🟢 |
| status | text | 否 | pending | 状态（pending/identifying/imported/failed） | 🟢 |
| items | jsonb | 否 | [] | 识别出的商品项 | 🟢 |
| image_count | integer | 否 | 0 | 图片数量 | 🟢 |
| viewed | boolean | 否 | false | 是否已查看 | 🟢 |
| deleted_patterns | text[] | 否 | [] | 删除的模式（未在 schema 中，但代码中使用） | 🟢 |

**索引**:
- `idx_import_records_created_at`: 创建时间索引（倒序）

**相关代码**:
- 后端: `routers/import_records.py`, `services/ocr_service.py`
- 前端: `app/imports/page.tsx`, `app/imports/[id]/page.tsx`


### 9. blacklist (黑名单) 🟢
**状态**: 正在使用

**注意**: 此表未在 `schema.sql` 中定义，但在代码中使用。

| 字段 | 类型 | 可空 | 默认 | 说明 | 使用状态 |
|------|------|------|------|------|----------|
| id | uuid | 否 | gen_random_uuid() | 主键 | 🟢 |
| pattern | text | 否 | - | 黑名单模式 | 🟢 |
| created_at | timestamptz | 否 | now() | 创建时间 | 🟢 |

**相关代码**:
- 后端: `routers/blacklist.py`, `services/ocr_service.py`
- 前端: 无直接使用


### 10. user_profiles (用户画像) 🟢
**状态**: 正在使用

| 字段 | 类型 | 可空 | 默认 | 说明 | 使用状态 |
|------|------|------|------|------|----------|
| id | uuid | 否 | gen_random_uuid() | 主键 | 🟢 |
| user_id | text | 否 | default | 用户 ID（唯一） | 🟢 |
| favorite_recipes | jsonb | 否 | [] | 收藏的菜谱 ID 列表 | 🟢 |
| favorite_ingredients | jsonb | 否 | [] | 喜爱的食材名称列表 | 🟢 |
| disliked_ingredients | jsonb | 否 | [] | 忌口的食材名称列表 | 🟢 |
| created_at | timestamptz | 否 | now() | 创建时间 | 🟢 |
| updated_at | timestamptz | 否 | now() | 更新时间 | 🟢 |

**触发器**:
- `update_user_profiles_updated_at`: 更新时自动更新 `updated_at`

**RLS 策略**:
- 允许所有操作（开发模式）

**相关代码**:
- 后端: `routers/user_profile.py`, `services/user_profile_service.py`
- 前端: 无直接使用


---

## 使用状态图例

| 图标 | 含义 |
|------|------|
| 🟢 | 正在使用 |
| 🟡 | 待确认使用情况 |
| 🔴 | 已废弃/未使用 |


---

## 发现的问题

1. **schema.sql 不完整**: 缺少 `purchase_tasks`、`blacklist` 表的定义
2. **字段不一致**: `ingredients.alias`、`import_records.deleted_patterns` 在代码中使用但未在 schema 中定义
3. **废弃表**: `shopping_list` 表已废弃但仍在 schema 中
4. **废弃字段**: `ingredients.unit` 字段已废弃但仍在 schema 中
