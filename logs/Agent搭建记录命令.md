# BasketMate Agent 搭建操作日志

**时间**：2026-06-04  
**阶段**：纯 ReAct 模式 Agent 基础设施搭建  
**目标**：为“厨房搭子”AI 管家准备完整的工具集、用户画像系统和行为规范，为后续 LangChain 集成打下基础。

---

## 1. 用户画像系统

### 数据库变更
- 在 Supabase 创建表 `user_profiles`：
  - `id` UUID 主键，`user_id` TEXT 唯一，默认 'default'
  - `favorite_recipes` JSONB 默认 '[]' （菜谱ID数组）
  - `favorite_ingredients` JSONB 默认 '[]' （食材名称数组）
  - `disliked_ingredients` JSONB 默认 '[]' （忌口食材名称数组）
  - `created_at`, `updated_at` 时间戳
- 插入默认记录：`user_id='default'`，所有数组字段为空数组。

### 后端 API
在 `api/user_preferences.py` 中实现：
- `GET /api/user/profile` – 获取当前用户画像
- `PUT /api/user/profile` – 覆盖更新画像字段
- `POST /api/user/profile/favorite-recipes/add` – 添加收藏菜谱
- `POST /api/user/profile/favorite-recipes/remove` – 移除收藏菜谱
- `POST /api/user/profile/favorite-ingredients/add` – 添加喜爱食材
- `POST /api/user/profile/favorite-ingredients/remove` – 移除喜爱食材
- `POST /api/user/profile/disliked-ingredients/add` – 添加忌口食材
- `POST /api/user/profile/disliked-ingredients/remove` – 移除忌口食材

所有 API 均操作固定 `user_id='default'`，后续登录接入后替换即可。

### 偏好自动学习
- 设计思路：当 `complete_purchase` 完成后，自动将计划中的菜谱 ID 加入 `favorite_recipes`，食材名加入 `favorite_ingredients`（去重）。具体实现待 Trae 完成。

---

## 2. Agent 工具清单完善

### 补充缺失工具
在已有清单的基础上，新增以下 Agent 必须工具：
- `generate_meal_plan(strategy, days)` – 双版本多日菜谱推荐
- `recommend_recipes_by_ingredients(ingredient_names)` – 根据食材反查菜谱
- `search_recipe_online(query)` – 联网搜索菜谱/做法
- `check_inventory_alerts(days=7)` – 库存过期提醒
- `resolve_ingredient(name)` – 根据名称查找或创建食材 ID
- `search_plans_by_date(start_date, end_date)` – 按日期范围查询计划

### 统一工具说明模板
每个工具必须包含以下字段，确保 Agent 能准确理解和使用：
- **功能**：一句话描述
- **参数**：名称、类型、是否必填、格式要求、含义
- **返回**：数据结构及关键字段
- **副作用**：调用后会改变的数据（写操作必填，含联动影响）
- **调用时机**：什么场景用，什么场景不用
- **注意事项**：常见错误，前置依赖等
- **示例**：完整调用示例

### 关键联动说明
- `complete_purchase` 完成采购后，自动更新用户画像（见上文）。
- 所有写操作（create/update/delete）必须声明副作用（如刷新采购清单、级联删除等）。
- `get_all_recipes`、`get_all_plans` 等全量查询仅限用户明确要求时使用，避免 Token 浪费。

---

## 3. 系统影响分析补全
在 `operation-impact-analysis.md` 中新增：
- `complete_purchase` 间接影响 `user_profiles`（自动添加偏好）
- 确认已完成的事务性 RPC 函数与后端路由修改列表
- 保留菜谱变更联动、计划过期处理等低优先级任务标记

---

## 4. Agent 行为规范（System Prompt）
创建 `agent-system-prompt.md`，定义：
- **角色**：厨房搭子，负责库存、菜谱、计划、采购管理
- **行为准则**：安全第一（写操作必须确认）、偏好优先、结果汇报、诚实兜底
- **输出格式**：
  - `Thought: <思考过程>`
  - `Action: <工具名>(参数=值)`
  - `Final Answer: <自然语言回复>`
- **确认机制**：调用 `ask_confirmation(message)` 暂停循环，等待用户回复“确认”或“取消”
- **错误处理**：用友好语言解释失败原因

---

## 5. Agent 核心实现方案（已明确，待 Trae 执行）
- 纯 ReAct 模式，不使用 Function Calling 混合
- 后端用 LangChain (`create_react_agent`) 搭建，流式 SSE 返回
- `ask_confirmation` 作为特殊工具拦截，暂停循环，前端显示确认框
- 所有工具用 `@tool` 装饰器定义，复用现有 Supabase 操作

---

## 6. 已指示 Trae 完成的工作
- 后端工具实现：`recommend_recipes_by_ingredients` 和 `generate_meal_plan`
  - 内部自动调用 `get_user_profile` 获取偏好进行过滤和排序
  - `generate_meal_plan` 只生成建议不直接创建计划，需用户确认后调用 `create_plan`
- 将这两个工具注册到 Agent 工具集，并更新 `agent-system-prompt.md` 的工具说明

---

## 复用说明
以上所有操作均通过向 Trae 发送提示词完成。数据库表结构、API 路由代码、文档内容可直接参考项目中对应文件。若需从头搭建，依次执行：
1. 执行数据库变更（创建 `user_profiles` 表）
2. 实现偏好 API 路由
3. 补充 `agent-tools.md` 工具清单（按模板填写所有工具）
4. 补全 `operation-impact-analysis.md` 联动影响
5. 编写 `agent-system-prompt.md` 系统指令
6. 实现缺失工具函数（`recommend_recipes_by_ingredients`、`generate_meal_plan` 等）
7. 部署 LangChain Agent（待进行）

当前进度：第 1-5 步已完成，第 6 步已交给 Trae 实现，第 7 步后续进行。