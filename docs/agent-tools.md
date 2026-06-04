# BasketMate AI Agent 工具清单

> **重要说明**：在推荐菜谱或生成计划前，必须先调用 `get_user_profile` 获取用户忌口和喜好，自动过滤和排序结果。

---

## 1. 用户画像管理

### get_user_profile

- **功能**：获取当前用户的饮食偏好画像。
- **参数**：无
- **返回**：
  ```json
  {
    "favorite_recipes": ["uuid1", "uuid2"],    // 收藏菜谱ID数组
    "favorite_ingredients": ["番茄", "鸡蛋"],  // 喜爱食材名称数组
    "disliked_ingredients": ["香菇", "苦瓜"]  // 忌口食材名称数组
  }
  ```
- **副作用**：无（只读操作）
- **调用时机**：任何涉及推荐、过滤的场景前必须先调用。
- **注意事项**：用户画像默认针对 `user_id='default'`，暂不支持多用户。
- **示例**：
  ```
  调用: get_user_profile()
  返回: {"favorite_recipes":[], "favorite_ingredients":["番茄"], "disliked_ingredients":["香菇"]}
  ```

---

### update_user_profile

- **功能**：覆盖更新用户画像（会替换整个数组）。
- **参数**：
  - `favorite_recipes` (string[], 可选)：收藏菜谱ID数组
  - `favorite_ingredients` (string[], 可选)：喜爱食材名称数组
  - `disliked_ingredients` (string[], 可选)：忌口食材名称数组
- **返回**：更新后的完整用户画像对象。
- **副作用**：修改 `user_profiles` 表。
- **调用时机**：需要一次性设置多个偏好时使用。
- **注意事项**：传入的参数会覆盖原值，未传入的保持不变。
- **示例**：
  ```
  调用: update_user_profile(favorite_ingredients=["番茄", "土豆"], disliked_ingredients=["香菇"])
  返回: {"favorite_ingredients":["番茄","土豆"], "disliked_ingredients":["香菇"], ...}
  ```

---

### add_favorite_recipe

- **功能**：将菜谱添加到收藏列表。
- **参数**：
  - `recipe_id` (string, 必填)：菜谱UUID
- **返回**：更新后的用户画像对象。
- **副作用**：修改 `user_profiles.favorite_recipes` 数组。
- **调用时机**：用户表达"最喜欢"、"最爱"某菜谱时。
- **注意事项**：需要先通过 `search_ingredients` 或 `get_all_recipes` 获取菜谱ID。
- **示例**：
  ```
  用户: "番茄炒蛋是我最爱"
  Agent: 1. search_recipes("番茄炒蛋") 获取 recipe_id
        2. add_favorite_recipe(recipe_id="xxx-xxx")
  返回: {"favorite_recipes":["xxx-xxx"], ...}
  回复: "好的，已将番茄炒蛋收藏为您的最爱菜谱。"
  ```

---

### remove_favorite_recipe

- **功能**：从收藏列表移除菜谱。
- **参数**：
  - `recipe_id` (string, 必填)：菜谱UUID
- **返回**：更新后的用户画像对象。
- **副作用**：修改 `user_profiles.favorite_recipes` 数组。
- **调用时机**：用户说"不喜欢XX了"或"取消收藏XX"时。
- **示例**：
  ```
  调用: remove_favorite_recipe(recipe_id="xxx-xxx")
  ```

---

### add_favorite_ingredient

- **功能**：将食材添加到喜爱列表。
- **参数**：
  - `ingredient_name` (string, 必填)：食材名称
- **返回**：更新后的用户画像对象。
- **副作用**：修改 `user_profiles.favorite_ingredients` 数组。
- **调用时机**：用户说"我喜欢吃XX"时。
- **示例**：
  ```
  用户: "我喜欢吃番茄"
  Agent: add_favorite_ingredient(ingredient_name="番茄")
  回复: "好的，已将番茄添加到您的喜爱食材列表。"
  ```

---

### remove_favorite_ingredient

- **功能**：从喜爱列表移除食材。
- **参数**：
  - `ingredient_name` (string, 必填)：食材名称
- **返回**：更新后的用户画像对象。
- **副作用**：修改 `user_profiles.favorite_ingredients` 数组。
- **示例**：
  ```
  用户: "我不喜欢番茄了"
  Agent: remove_favorite_ingredient(ingredient_name="番茄")
  ```

---

### add_disliked_ingredient

- **功能**：将食材添加到忌口列表（推荐时自动过滤）。
- **参数**：
  - `ingredient_name` (string, 必填)：食材名称
- **返回**：更新后的用户画像对象。
- **副作用**：修改 `user_profiles.disliked_ingredients` 数组。
- **调用时机**：用户说"我不吃XX"、"XX过敏"、"讨厌XX"时。
- **示例**：
  ```
  用户: "我不吃香菇"
  Agent: add_disliked_ingredient(ingredient_name="香菇")
  回复: "记住了，以后我会避开香菇。"
  ```

---

### remove_disliked_ingredient

- **功能**：从忌口列表移除食材。
- **参数**：
  - `ingredient_name` (string, 必填)：食材名称
- **返回**：更新后的用户画像对象。
- **副作用**：修改 `user_profiles.disliked_ingredients` 数组。
- **示例**：
  ```
  用户: "我可以吃香菇了"
  Agent: remove_disliked_ingredient(ingredient_name="香菇")
  回复: "好的，已将香菇从忌口列表中移除。"
  ```

---

## 2. 食材库存管理

### get_all_ingredients

- **功能**：获取当前所有食材库存列表。
- **参数**：无
- **返回**：
  ```json
  [
    {"id": "uuid", "name": "鸡蛋", "quantity": 10, "added_at": "2024-01-01T00:00:00Z"},
    {"id": "uuid", "name": "番茄", "quantity": 3, "added_at": "2024-01-02T00:00:00Z"}
  ]
  ```
- **副作用**：无（只读操作）
- **调用时机**：
  - ✅ 用户明确要求"查看所有库存"时
  - ❌ 智能推荐场景优先使用 `recommend_recipes_by_ingredients`
- **注意事项**：库存量大时 Token 消耗大，建议配合 `check_inventory_alerts` 使用。

---

### get_ingredient_by_id

- **功能**：获取单个食材的详细信息。
- **参数**：
  - `ingredient_id` (string, 必填)：食材UUID
- **返回**：食材对象，包含 id, name, quantity, added_at。
- **副作用**：无
- **调用时机**：已知食材ID，需要查看详情时。
- **示例**：
  ```
  调用: get_ingredient_by_id(ingredient_id="xxx-xxx")
  返回: {"id": "xxx-xxx", "name": "鸡蛋", "quantity": 10, "added_at": "..."}
  ```

---

### search_ingredients

- **功能**：根据名称模糊搜索食材。
- **参数**：
  - `q` (string, 必填)：搜索关键词
- **返回**：匹配的食材列表（仅包含 id 和 name）。
- **副作用**：无
- **调用时机**：
  - 用户问"有没有XX"
  - 需要查找食材ID时（如创建计划前）
- **示例**：
  ```
  调用: search_ingredients(q="鸡蛋")
  返回: [{"id": "xxx", "name": "鸡蛋"}, {"id": "yyy", "name": "鸡蛋（超大）"}]
  ```

---

### resolve_ingredient

- **功能**：根据食材名称查找或创建食材ID（原子操作）。
- **参数**：
  - `name` (string, 必填)：食材名称
- **返回**：`{"id": "uuid"}`
- **副作用**：
  - 若食材不存在，会在 `ingredients` 表创建新记录（quantity=0）
- **调用时机**：所有需要食材ID的写操作前置步骤。
- **注意事项**：返回的是已存在的或新创建的食材ID。
- **示例**：
  ```
  调用: resolve_ingredient(name="生菜")
  返回: {"id": "新建食材的uuid"}
  ```

---

### create_or_update_ingredient

- **功能**：创建新食材或更新已有食材的数量。
- **参数**：
  - `name` (string, 必填)：食材名称
  - `quantity` (float, 可选)：数量，默认0
- **返回**：创建/更新后的食材对象。
- **副作用**：
  - 创建：`ingredients` 表新增记录
  - 更新：`ingredients` 表 quantity 字段累加
- **调用时机**：用户说"添加XX"或"买了XX"时。
- **注意事项**：若食材已存在，会累加数量而非覆盖。
- **示例**：
  ```
  用户: "买了5个鸡蛋"
  Agent: create_or_update_ingredient(name="鸡蛋", quantity=5)
  返回: {"id": "xxx", "name": "鸡蛋", "quantity": 15, ...}
  ```

---

### update_ingredient

- **功能**：更新食材信息。
- **参数**：
  - `ingredient_id` (string, 必填)：食材UUID
  - `name` (string, 可选)：新名称
  - `quantity` (float, 可选)：新数量（会覆盖原值）
- **返回**：更新后的食材对象。
- **副作用**：
  - 修改 `ingredients` 表
  - 可能联动更新 `purchase_tasks` 表（库存变化影响缺货计算）
- **调用时机**：用户说"把XX数量改成X"时。
- **示例**：
  ```
  用户: "鸡蛋吃了2个，还剩8个"
  Agent: update_ingredient(ingredient_id="xxx", quantity=8)
  ```

---

### delete_ingredient

- **功能**：删除食材及其所有引用。
- **参数**：
  - `ingredient_id` (string, 必填)：食材UUID
- **返回**：成功消息。
- **副作用**：
  - 删除 `ingredients` 表记录
  - 清理 `recipes` 表中该食材的引用
  - 清理 `purchase_tasks` 中相关待购项
- **调用时机**：用户明确要求删除某食材时。
- **注意事项**：此操作会级联清理所有引用，执行前需确认用户意图。

---

### batch_update_ingredients

- **功能**：批量更新多个食材的数量。
- **参数**：
  - `updates` (array, 必填)：更新项数组
    - 每项：`{"id": "uuid", "quantity": float}`
- **返回**：更新结果消息，包含更新数量。
- **副作用**：
  - 批量修改 `ingredients` 表
  - 可能联动更新 `purchase_tasks` 表
- **调用时机**：用户说"更新这些食材的数量"并提供列表时。
- **示例**：
  ```
  用户: "把土豆改成3，番茄改成5"
  Agent: batch_update_ingredients(updates=[{"id": "土豆id", "quantity": 3}, {"id": "番茄id", "quantity": 5}])
  ```

---

### check_inventory_alerts

- **功能**：检查存放超过指定天数的食材（可能快过期）。
- **参数**：
  - `days` (int, 可选)：天数阈值，默认7天
- **返回**：过期风险食材列表。
- **副作用**：无
- **调用时机**：
  - 用户问"有没有快坏了的菜"
  - 智能推荐时优先使用快过期食材
- **示例**：
  ```
  用户: "有没有快坏了的菜？"
  Agent: check_inventory_alerts(days=7)
  返回: [{"name": "生菜", "quantity": 2, "added_at": "2024-01-01", "days_ago": 10}]
  回复: "以下食材可能快坏了，建议尽快使用：
        - 生菜（2份，存放了10天）"
  ```

---

## 3. 菜谱管理

### get_all_recipes

- **功能**：获取所有菜谱（已自动按用户偏好过滤和排序）。
- **参数**：
  - `limit` (int, 可选)：返回数量限制
  - `offset` (int, 可选)：分页偏移
- **返回**：菜谱列表，每项包含 id, name, category, ingredients。
- **副作用**：无
- **调用时机**：
  - ✅ 用户明确要求"查看所有菜谱"
  - ❌ 智能推荐场景优先使用 `recommend_recipes_by_ingredients`
- **自动行为**：
  1. 排除包含忌口食材的菜谱
  2. 收藏的菜谱排最前
  3. 按喜爱食材匹配数降序排序
- **示例**：
  ```
  调用: get_all_recipes(limit=10)
  返回: [
    {"id": "xxx", "name": "番茄炒蛋", "category": "家常菜", "ingredients": [...]},
    {"id": "yyy", "name": "土豆烧肉", "category": "荤菜", "ingredients": [...]}
  ]
  ```

---

### get_recipe_by_id

- **功能**：获取单个菜谱的完整详情。
- **参数**：
  - `recipe_id` (string, 必填)：菜谱UUID
- **返回**：菜谱对象，包含所有字段。
- **副作用**：无
- **调用时机**：
  - 用户询问某菜谱的详细做法
  - 创建计划前需要菜谱信息
- **示例**：
  ```
  调用: get_recipe_by_id(recipe_id="xxx-xxx")
  返回: {"id": "xxx", "name": "番茄炒蛋", "category": "家常菜", "ingredients": [...], "notes": "..."}
  ```

---

### recommend_recipes_by_ingredients

- **功能**：根据现有食材智能推荐可做的菜谱。
- **参数**：
  - `ingredient_names` (string[], 可选)：食材名称数组，为空则基于全部库存
- **返回**：推荐菜谱列表，按匹配度排序。
- **副作用**：无
- **调用时机**：
  - 用户问"XX和XX能做什么菜"
  - 智能推荐时根据库存推荐
- **自动行为**：
  1. 过滤掉包含忌口食材的菜谱
  2. 优先推荐收藏菜谱
  3. 按食材匹配度排序
- **示例**：
  ```
  用户: "冰箱里有土豆和鸡蛋，能做什么？"
  Agent: recommend_recipes_by_ingredients(ingredient_names=["土豆", "鸡蛋"])
  返回: [
    {"name": "土豆丝炒蛋", "match_score": 2, "missing": []},
    {"name": "酸辣土豆丝", "match_score": 1, "missing": ["辣椒", "醋"]}
  ]
  回复: "根据您的食材，推荐以下菜谱：
        1. 土豆丝炒蛋（完全匹配！）
        2. 酸辣土豆丝（缺辣椒、醋）"
  ```

---

### search_recipe_online

- **功能**：联网搜索菜谱做法或新菜谱信息。
- **参数**：
  - `query` (string, 必填)：搜索关键词
- **返回**：菜谱搜索结果列表（标题、简要描述、来源URL）。
- **副作用**：无
- **调用时机**：
  - 用户问"XX怎么做"
  - 用户要求学习新菜谱
  - 用户问"推荐个XX菜"
- **注意事项**：此工具依赖外部搜索API，返回结果仅供参考。
- **示例**：
  ```
  用户: "酸辣土豆丝怎么做？"
  Agent: search_recipe_online(query="酸辣土豆丝做法")
  返回: [
    {"title": "家常酸辣土豆丝", "description": "简单易学的做法...", "url": "https://..."},
    {"title": "正宗川味酸辣土豆丝", "description": "..."}
  ]
  回复: "为您找到以下酸辣土豆丝的做法：..."
  ```

---

## 4. 采购计划管理

### get_all_plans

- **功能**：获取所有烹饪计划列表。
- **参数**：无
- **返回**：计划列表，包含 id, date, breakfast_recipe_id, meal_ids。
- **副作用**：无
- **调用时机**：
  - ✅ 用户明确要求"查看所有计划"
  - ❌ 询问特定日期范围优先使用 `search_plans_by_date`

---

### search_plans_by_date

- **功能**：按日期范围查询烹饪计划。
- **参数**：
  - `start_date` (string, 必填)：开始日期，格式 YYYY-MM-DD
  - `end_date` (string, 必填)：结束日期，格式 YYYY-MM-DD
- **返回**：该日期范围内的计划列表。
- **副作用**：无
- **调用时机**：
  - 用户问"下周我吃什么"
  - 用户问"这周X天有什么计划"
- **示例**：
  ```
  用户: "下周我吃什么？"
  Agent: search_plans_by_date(start_date="2024-01-15", end_date="2024-01-21")
  返回: [
    {"date": "2024-01-15", "breakfast": "粥", "meals": ["番茄炒蛋", "红烧肉"]},
    {"date": "2024-01-16", "breakfast": "豆浆油条", "meals": []}
  ]
  ```

---

### get_plan_by_id

- **功能**：获取单个计划的详细信息。
- **参数**：
  - `plan_id` (string, 必填)：计划UUID
- **返回**：计划对象，包含所有字段。
- **副作用**：无

---

### create_plan

- **功能**：创建新的烹饪计划（关联菜谱后自动刷新采购清单）。
- **参数**：
  - `date` (string, 必填)：日期，格式 YYYY-MM-DD
  - `breakfast_recipe_id` (string, 可选)：早餐菜谱UUID
  - `meal_ids` (string[], 可选)：午餐/晚餐菜谱UUID数组
- **返回**：创建的计划对象。
- **副作用**：
  - 在 `plans` 表创建记录
  - **联动**：`purchase_tasks` 表增量更新（根据菜谱计算缺货食材）
- **调用时机**：用户说"明天吃XX早餐，午餐吃XX"时。
- **注意事项**：需要先通过菜谱相关工具获取菜谱ID。
- **示例**：
  ```
  用户: "明天早餐吃粥，午餐吃番茄炒蛋"
  Agent: 1. search_ingredients("番茄炒蛋") 获取 recipe_id
        2. create_plan(date="2024-01-15", breakfast_recipe_id="粥的id", meal_ids=["番茄炒蛋id"])
  返回: {"id": "xxx", "date": "2024-01-15", "breakfast": "...", ...}
  ```

---

### update_plan

- **功能**：修改已有计划的内容。
- **参数**：
  - `plan_id` (string, 必填)：计划UUID
  - `date` (string, 可选)：新日期
  - `breakfast_recipe_id` (string, 可选)：新早餐菜谱ID
  - `meal_ids` (string[], 可选)：新午餐/晚餐菜谱ID数组
- **返回**：更新后的计划对象。
- **副作用**：
  - 修改 `plans` 表
  - **联动**：`purchase_tasks` 表增量更新
- **调用时机**：用户说"明天的午餐改成XX"时。

---

### delete_plan

- **功能**：删除烹饪计划。
- **参数**：
  - `plan_id` (string, 必填)：计划UUID
- **返回**：成功消息。
- **副作用**：
  - 删除 `plans` 表记录
  - **联动**：`purchase_tasks` 表增量更新（移除该计划的食材需求）
- **注意事项**：删除后，相关食材需求会从采购清单中移除。

---

### generate_meal_plan

- **功能**：根据策略自动生成多日菜谱推荐（不创建计划，仅推荐）。
- **参数**：
  - `strategy` (string, 必填)：推荐策略
    - `inventory_first`：优先清库存（推荐使用快过期食材的菜谱）
    - `no_repeat`：不重复策略（同一天内不重复，一周内同类不重复）
  - `days` (int, 必填)：推荐天数
- **返回**：推荐计划列表（每日包含早餐和午餐/晚餐建议）。
- **副作用**：无（仅推荐，不创建）
- **调用时机**：
  - 用户说"帮我规划未来三天吃什么"
  - 用户说"推荐下周菜谱"
  - 用户说"优先清冰箱"
- **自动行为**：
  1. 获取用户画像，过滤忌口
  2. 根据策略选择合适的菜谱
  3. 按偏好排序返回推荐
- **示例**：
  ```
  用户: "帮我规划未来三天，优先清冰箱"
  Agent: generate_meal_plan(strategy="inventory_first", days=3)
  返回: [
    {"date": "明天", "breakfast": "鸡蛋炒饭", "meals": ["番茄炒蛋", "土豆烧肉"]},
    {"date": "后天", "breakfast": "豆浆", "meals": ["青椒肉丝", "凉拌黄瓜"]}
  ]
  回复: "根据您的库存和偏好，为您推荐未来三天的菜谱：
        明天：早餐鸡蛋炒饭（正好用掉快过期的鸡蛋），午餐番茄炒蛋..."
  ```

---

## 5. 采购清单管理

### get_purchase_task

- **功能**：获取当前活跃的采购任务。
- **参数**：无
- **返回**：采购任务对象。
  ```json
  {
    "id": "task-uuid",
    "status": true,
    "pending_items": [{"ingredient_id": "...", "need_quantity": 2, ...}],
    "custom_items": [...],
    "completed_items": [...],
    "removed_ingredient_ids": [...]
  }
  ```
- **副作用**：无
- **调用时机**：
  - 用户问"需要买什么"
  - 用户问"采购清单有什么"

---

### refresh_purchase_task

- **功能**：重新计算并刷新采购清单。
- **参数**：
  - `locally_removed_ids` (string[], 可选)：本地移除的食材ID列表
  - `from_date` (string, 可选)：从指定日期开始计算
- **返回**：刷新后的待购项列表。
- **副作用**：
  - 重新计算所有计划的缺货食材
  - 更新 `purchase_tasks` 和 `shopping_list` 表
- **调用时机**：
  - 手动触发刷新
  - 系统自动定期刷新

---

### complete_purchase

- **功能**：完成采购，将勾选的食材加入库存。
- **参数**：
  - `checked_items` (array, 必填)：已购买的项
    - 每项：`{"ingredient_id": "uuid", "ingredient_name": "名称", "need_quantity": float, "is_custom": bool, "custom_id": "uuid"}`
- **返回**：更新后的采购任务对象。
- **副作用**：
  - 修改 `ingredients` 表（增加库存数量）
  - 修改 `purchase_tasks` 表（移动到已完成）
  - **联动**：`user_profiles` 表 - 自动将采购的菜谱ID加入 `favorite_recipes`，食材名称加入 `favorite_ingredients`（去重）
- **注意事项**：
  - ✅ 此操作会实现用户偏好**自动学习**
  - ✅ 完成采购代表用户执行了某计划，该计划中的菜谱和食材会被自动记录为喜好
- **示例**：
  ```
  用户: "买完菜了，勾选了鸡蛋和番茄"
  Agent: complete_purchase(checked_items=[
    {"ingredient_id": "鸡蛋id", "need_quantity": 10},
    {"ingredient_id": "番茄id", "need_quantity": 5}
  ])
  回复: "已更新库存：
        - 鸡蛋 +10
        - 番茄 +5
        
        同时已学习您的偏好：
        - 收藏菜谱：番茄炒蛋
        - 喜爱食材：鸡蛋、番茄"
  ```

---

### delete_purchase_item

- **功能**：删除单个采购项并加入黑名单。
- **参数**：
  - `ingredient_id` (string, 必填)：食材UUID
- **返回**：更新后的采购任务对象。
- **副作用**：
  - 从 `purchase_tasks.pending_items` 移除
  - 添加到 `purchase_tasks.removed_ingredient_ids`（黑名单）
- **调用时机**：用户说"XX不要买了"时。

---

### clear_purchase_task

- **功能**：清空所有待购项并标记任务完成。
- **参数**：无
- **返回**：更新后的采购任务对象。
- **副作用**：
  - 清空 `pending_items`
  - 清空 `custom_items`
  - 所有项加入黑名单
  - `status` 设为 false（已完成）
- **调用时机**：用户说"取消这次采购"时。

---

### add_to_purchase_task

- **功能**：手动添加食材到采购清单。
- **参数**：
  - `ingredient_id` (string, 必填)：食材UUID
- **返回**：更新后的采购任务对象。
- **副作用**：在 `purchase_tasks.custom_items` 添加自定义项。
- **调用时机**：用户说"把XX加到采购清单"时。

---

## 6. 价格/比价管理

### get_all_prices

- **功能**：获取所有食材的价格记录。
- **参数**：无
- **返回**：价格列表，包含 ingredient_id, shop_id, price, shop_name。
- **副作用**：无
- **调用时机**：用户问"XX在不同地方多少钱"

---

### get_price_by_id

- **功能**：获取单个价格记录。
- **参数**：
  - `price_id` (string, 必填)：价格UUID
- **返回**：价格对象。
- **副作用**：无

---

### create_or_update_price

- **功能**：创建或更新食材在某个店铺的价格。
- **参数**：
  - `ingredient_id` (string, 必填)：食材UUID
  - `shop_id` (string, 必填)：店铺UUID
  - `price` (float, 必填)：价格
- **返回**：创建/更新后的价格对象。
- **副作用**：
  - 插入/更新 `prices` 表
  - **联动**：`purchase_tasks` 表（最低价变化会影响推荐的购买店铺）
- **调用时机**：用户说"XX在OO超市卖X元"时。
- **注意事项**：同一食材+店铺组合，价格会被覆盖。

---

### update_price

- **功能**：修改价格记录。
- **参数**：
  - `price_id` (string, 必填)：价格UUID
  - `price` (float, 可选)：新价格
- **返回**：更新后的价格对象。
- **副作用**：
  - 修改 `prices` 表
  - **联动**：`purchase_tasks` 表（最低价变化影响店铺推荐）

---

### delete_price

- **功能**：删除价格记录。
- **参数**：
  - `price_id` (string, 必填)：价格UUID
- **返回**：成功消息。
- **副作用**：
  - 删除 `prices` 表记录
  - **联动**：`purchase_tasks` 表（重新计算该食材最低价）

---

## 7. 店铺管理

### get_all_shops

- **功能**：获取所有店铺列表。
- **参数**：无
- **返回**：店铺列表，包含 id, name。
- **副作用**：无

---

### get_shop_by_id

- **功能**：获取单个店铺详情。
- **参数**：
  - `shop_id` (string, 必填)：店铺UUID
- **返回**：店铺对象。
- **副作用**：无

---

### create_shop

- **功能**：创建新店铺。
- **参数**：
  - `name` (string, 必填)：店铺名称
- **返回**：创建的店铺对象。
- **副作用**：在 `shops` 表创建记录。
- **调用时机**：用户说"添加一个新店铺XX"时。

---

### update_shop

- **功能**：更新店铺信息。
- **参数**：
  - `shop_id` (string, 必填)：店铺UUID
  - `name` (string, 可选)：新名称
- **返回**：更新后的店铺对象。
- **副作用**：修改 `shops` 表。

---

### delete_shop

- **功能**：删除店铺及其相关价格。
- **参数**：
  - `shop_id` (string, 必填)：店铺UUID
- **返回**：成功消息。
- **副作用**：
  - 删除 `shops` 表记录
  - **联动**：删除该店铺的所有 `prices` 记录
  - **联动**：`purchase_tasks` 表（依赖该店铺价格的项归入"待定"）

---

## 8. 小票 OCR/导入

### upload_receipt

- **功能**：上传小票图片进行OCR识别。
- **参数**：
  - `images` (string[], 必填)：图片base64编码数组
  - `import_type` (string[], 必填)：导入类型
    - `"inventory"`：导入库存
    - `"price"`：导入价格
  - `shop_name` (string, 可选)：店铺名称（导入价格时必填）
- **返回**：`{"record_id": "uuid", "message": "已开始识别"}`
- **副作用**：在 `import_records` 表创建记录。
- **调用时机**：用户说"上传这张小票"并附图片时。
- **注意事项**：识别是异步的，返回后需轮询 `get_import_record` 获取结果。

---

### get_import_records

- **功能**：获取所有导入记录列表。
- **参数**：无
- **返回**：导入记录列表。
- **副作用**：无

---

### get_import_record

- **功能**：获取单个导入记录的详情和识别结果。
- **参数**：
  - `record_id` (string, 必填)：记录UUID
- **返回**：导入记录对象，包含识别出的商品列表。
- **副作用**：
  - 更新 `viewed` 字段为 true
- **调用时机**：轮询识别结果时。

---

### confirm_import

- **功能**：确认执行导入（事务性操作）。
- **参数**：
  - `record_id` (string, 必填)：记录UUID
  - `items` (array, 必填)：确认导入的商品列表
    - 每项：`{"name": "名称", "price": float, "quantity": int, "target_ingredient": "uuid"}`
  - `deleted_patterns` (string[], 可选)：已删除的识别模式
- **返回**：导入结果统计。
  ```json
  {
    "blacklist_count": 2,
    "new_ingredient_count": 3,
    "inventory_count": 5,
    "price_insert_count": 4,
    "price_update_count": 1
  }
  ```
- **副作用**：
  - 创建新食材
  - 更新库存数量
  - 插入/更新价格记录
  - 添加到黑名单
- **调用时机**：用户审核完OCR结果并确认时。

---

## 9. 日志管理

### get_recent_logs

- **功能**：获取最近的后端日志。
- **参数**：
  - `minutes` (int, 可选)：时间范围，默认10分钟
- **返回**：日志文本。
- **副作用**：无
- **调用时机**：排查问题时。

---

### get_frontend_logs

- **功能**：获取最近的前端日志。
- **参数**：
  - `minutes` (int, 可选)：时间范围，默认10分钟
- **返回**：日志文本。
- **副作用**：无
- **调用时机**：排查前端问题时。

---

## 工具使用优先级指南

### 推荐优先使用的工具

| 场景 | 推荐工具 | 原因 |
|-----|---------|------|
| 智能推荐菜谱 | `recommend_recipes_by_ingredients` | 自动过滤、分词、按匹配度排序 |
| 规划多日计划 | `generate_meal_plan` | 支持策略选择，自动避免重复 |
| 检查快过期食材 | `check_inventory_alerts` | 减少浪费，优先清库存 |
| 查找食材ID | `search_ingredients` + `resolve_ingredient` | 模糊搜索+自动创建 |

### 避免全量查询的场景

| 场景 | 不推荐 | 推荐 |
|-----|-------|------|
| 推荐菜谱 | `get_all_recipes` | `recommend_recipes_by_ingredients` |
| 查询某日计划 | `get_all_plans` | `search_plans_by_date` |
| 查看库存 | `get_all_ingredients` | `check_inventory_alerts` |

---

## 对话应用示例

### 偏好设置

| 用户输入 | Agent 调用 | 回复 |
|---------|----------|------|
| "我不吃香菇" | `add_disliked_ingredient("香菇")` | "记住了，以后我会避开香菇。" |
| "我喜欢吃番茄" | `add_favorite_ingredient("番茄")` | "好的，已将番茄添加到您的喜爱食材列表。" |
| "番茄炒蛋是我最爱" | 1. `search_ingredients("番茄炒蛋")` 获取ID<br>2. `add_favorite_recipe(recipe_id)` | "好的，已将番茄炒蛋收藏为您的最爱菜谱。" |
| "我可以吃香菇了" | `remove_disliked_ingredient("香菇")` | "好的，已将香菇从忌口列表中移除。" |

### 推荐场景

| 用户输入 | Agent 行为 |
|---------|----------|
| "推荐几个菜谱" | 1. `get_user_profile` 获取偏好<br>2. `recommend_recipes_by_ingredients()` 基于全部库存<br>3. 返回过滤和排序后的结果 |
| "冰箱里有土豆和鸡蛋，能做什么" | 1. `recommend_recipes_by_ingredients(["土豆", "鸡蛋"])`<br>2. 返回匹配度最高的菜谱 |
| "帮我规划未来三天" | 1. `generate_meal_plan(strategy="no_repeat", days=3)`<br>2. 返回每日推荐 |
| "有没有快坏了的菜" | 1. `check_inventory_alerts(days=7)`<br>2. 返回过期风险列表并提供使用建议 |
