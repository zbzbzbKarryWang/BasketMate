# 项目结构文档

## 概述
BasketMate 是一个智能买菜计划与库存管理系统，采用前后端分离架构。

---

## 目录结构

```
BasketMate/
├── backend/                 # FastAPI 后端服务
│   ├── app/
│   │   ├── routers/         # API 路由
│   │   ├── services/        # 业务逻辑服务
│   │   ├── ai/              # AI 相关模块
│   │   ├── main.py          # FastAPI 应用入口
│   │   ├── models.py        # Pydantic 数据模型
│   │   ├── database.py      # 数据库连接
│   │   ├── config.py        # 配置管理
│   │   ├── dependencies.py  # 依赖注入
│   │   ├── decorators.py    # 装饰器
│   │   └── logger.py        # 日志系统
│   └── requirements.txt     # Python 依赖
│
├── frontend/                # Next.js 前端应用
│   ├── app/                 # App Router 页面
│   │   ├── page.tsx         # 首页
│   │   ├── layout.tsx       # 布局
│   │   ├── ai-chat/         # AI 聊天页面
│   │   ├── imports/         # 导入记录页面
│   │   └── api/proxy/       # API 代理
│   ├── components/          # React 组件
│   ├── lib/                 # 工具库
│   └── contexts/            # React Context
│
├── supabase/                # 数据库迁移
│   └── migrations/
│
├── docs/                    # 文档（本目录）
│   ├── ARCHITECTURE.md     # 系统架构说明
│   ├── PROJECT_STRUCTURE.md # 项目结构文档
│   ├── DEVELOPMENT_LOG.md   # 开发日志
│   ├── DEPRECATED.md       # 废弃字段清单
│   ├── DATABASE_SCHEMA.md   # 数据库结构
│   ├── CLEANUP_TODO.md     # 清理待办
│   ├── agent-tools.md       # AI Agent 工具清单
│   └── agent-system-prompt.md # Agent 系统提示词
├── logs/                    # 日志文件
├── conversion/               # 对话记录转换文件
├── docker-compose.yml        # Docker 编排配置
├── .gitignore               # Git 忽略配置
└── 快速测试指南.md            # 快速测试指南
```

---

## 后端架构

### 核心模块

#### 1. 路由层 (`app/routers/`)

| 文件 | 功能 | 状态 |
|------|------|------|
| `ingredients.py` | 食材 CRUD、搜索、批量更新 | 🟢 使用中 |
| `recipes.py` | 菜谱 CRUD、列表获取 | 🟢 使用中 |
| `plans.py` | 用餐计划管理、采购任务刷新 | 🟢 使用中 |
| `prices.py` | 比价数据管理 | 🟢 使用中 |
| `shops.py` | 店铺管理 | 🟢 使用中 |
| `shopping.py` | 采购任务管理、完成采购 | 🟢 使用中 |
| `import_records.py` | OCR 小票导入、导入确认 | 🟢 使用中 |
| `blacklist.py` | 黑名单管理 | 🟢 使用中 |
| `user_profile.py` | 用户画像、收藏管理 | 🟢 使用中 |
| `ai_chat.py` | AI 聊天接口 | 🟢 使用中 |
| `ai_tools.py` | AI 工具定义（非路由） | 🟢 使用中 |
| `logs.py` | 日志查看 | 🟢 使用中 |

#### 2. 服务层 (`app/services/`)

| 文件 | 功能 | 状态 |
|------|------|------|
| `shopping_service.py` | 采购清单计算逻辑、增量更新 | 🟢 使用中 |
| `ocr_service.py` | OCR 小票识别、食材匹配 | 🟢 使用中 |
| `user_profile_service.py` | 用户画像相关服务 | 🟢 使用中 |

#### 3. AI 模块 (`app/ai/`)

| 文件 | 功能 | 状态 |
|------|------|------|
| `agent.py` | AI 代理核心逻辑 | 🟢 使用中 |

#### 4. 核心文件

- `main.py`: FastAPI 应用入口，包含路由注册、中间件、异常处理
- `models.py`: Pydantic 数据模型定义（请求/响应格式）
- `database.py`: Supabase 客户端连接管理
- `dependencies.py`: 依赖注入（用户认证等）
- `decorators.py`: 装饰器（日志记录等）
- `logger.py`: 日志系统

---

## 前端架构

### 页面路由 (`frontend/app/`)

| 路径 | 功能 | 状态 |
|------|------|------|
| `/` | 首页（多标签切换） | 🟢 使用中 |
| `/ai-chat` | AI 聊天界面 | 🟢 使用中 |
| `/imports` | 导入记录列表 | 🟢 使用中 |
| `/imports/[id]` | 导入记录详情 | 🟢 使用中 |
| `/logs` | 日志查看 | 🟢 使用中 |

### 核心组件 (`frontend/components/`)

| 组件 | 功能 | 状态 |
|------|------|------|
| `home-page.tsx` | 首页内容 | 🟢 使用中 |
| `plan-page.tsx` | 用餐计划页面 | 🟢 使用中 |
| `shopping-page.tsx` | 采购清单页面 | 🟢 使用中 |
| `inventory-page.tsx` | 库存管理页面 | 🟢 使用中 |
| `recipes-page.tsx` | 菜谱管理页面 | 🟢 使用中 |
| `price-page.tsx` | 比价页面 | 🟢 使用中 |
| `bottom-nav.tsx` | 底部导航栏 | 🟢 使用中 |
| `confirm-modal.tsx` | 确认对话框 | 🟢 使用中 |
| `recipe-drawer.tsx` | 菜谱详情抽屉 | 🟢 使用中 |
| `recipe-form-dialog.tsx` | 菜谱编辑表单 | 🟢 使用中 |
| `theme-provider.tsx` | 主题提供者 | 🟢 使用中 |
| `providers.tsx` | 全局提供者 | 🟢 使用中 |
| `SpinWheel.tsx` | 早餐转盘 | 🟢 使用中 |
| `breakfast-wheel.tsx` | 早餐选择转盘 | 🟢 使用中 |
| `breakfast-picker-panel.tsx` | 早餐选择面板 | 🟢 使用中 |
| `image-editor.tsx` | 图片编辑器 | 🟢 使用中 |

### 工具库 (`frontend/lib/`)

| 文件 | 功能 | 状态 |
|------|------|------|
| `api-client.ts` | API 客户端封装 | 🟢 使用中 |
| `store.ts` | Zustand 状态管理 | 🟢 使用中 |
| `types.ts` | TypeScript 类型定义 | 🟢 使用中 |
| `generate-shopping-list.ts` | 生成采购清单（调用后端） | 🟢 使用中 |
| `purchase-utils.ts` | 采购相关工具 | 🟢 使用中 |
| `ingredient-stock.ts` | 库存检查工具 | 🟢 使用中 |
| `logger.ts` | 日志工具 | 🟢 使用中 |
| `utils.ts` | 通用工具 | 🟢 使用中 |
| `toast.ts` | 提示工具 | 🟢 使用中 |
| `seed-defaults.ts` | 默认数据 | 🟢 使用中 |
| `mock-data.ts` | 模拟数据 | 🟢 使用中 |
| `breakfast-emojis.ts` | 早餐 emoji 数据 | 🟢 使用中 |
| `breakfast-wheel-utils.ts` | 早餐转盘工具 | 🟢 使用中 |
| `recipe-categories.ts` | 菜谱分类 | 🟢 使用中 |
| `supabase-mappers.ts` | Supabase 数据映射 | 🟡 待确认 |
| `supabaseClient.ts` | Supabase 客户端 | 🟡 待确认 |

### Context (`frontend/contexts/`)

| 文件 | 功能 | 状态 |
|------|------|------|
| `DataContext.tsx` | 数据管理 Context | 🟢 使用中 |

### Hooks (`frontend/hooks/`)

| 文件 | 功能 | 状态 |
|------|------|------|
| `use-mobile.ts` | 移动端检测 | 🟢 使用中 |
| `use-toast.ts` | Toast 提示 hook | 🟡 待确认 |

---

## API 接口清单

### 健康检查
- `GET /api/health` - 后端健康检查

### 食材管理
- `GET /api/ingredients` - 获取食材列表
- `GET /api/ingredients/search` - 搜索食材
- `GET /api/ingredients/{id}` - 获取食材详情
- `POST /api/ingredients` - 创建食材
- `PUT /api/ingredients/{id}` - 更新食材
- `DELETE /api/ingredients/{id}` - 删除食材
- `POST /api/ingredients/resolve` - 解析/创建食材
- `POST /api/ingredients/batch-update-quantity` - 批量更新库存

### 菜谱管理
- `GET /api/recipes` - 获取菜谱列表
- `GET /api/recipes/{id}` - 获取菜谱详情

### 用餐计划
- `GET /api/plans` - 获取计划列表
- `GET /api/plans/{id}` - 获取计划详情
- `POST /api/plans` - 创建计划
- `PUT /api/plans/{id}` - 更新计划
- `DELETE /api/plans/{id}` - 删除计划

### 比价管理
- `GET /api/prices` - 获取价格列表
- `GET /api/prices/{id}` - 获取价格详情
- `POST /api/prices` - 创建价格
- `PUT /api/prices/{id}` - 更新价格
- `DELETE /api/prices/{id}` - 删除价格
- `POST /api/prices/upsert` - Upsert 价格

### 店铺管理
- `GET /api/shops` - 获取店铺列表
- `GET /api/shops/{id}` - 获取店铺详情
- `POST /api/shops` - 创建店铺
- `PUT /api/shops/{id}` - 更新店铺
- `DELETE /api/shops/{id}` - 删除店铺

### 采购管理
- `GET /api/shopping/task` - 获取当前采购任务
- `POST /api/shopping/task/refresh` - 刷新采购清单
- `POST /api/shopping/task/complete` - 完成采购
- `POST /api/shopping/task/delete-item` - 删除采购项
- `POST /api/shopping/task/clear` - 清空采购任务
- `POST /api/shopping/task/add` - 添加到采购任务

### 导入记录
- `POST /api/import/upload` - 上传小票图片
- `GET /api/import/records` - 获取导入记录列表
- `GET /api/import/records/{id}` - 获取导入记录详情
- `PUT /api/import/records/{id}` - 更新导入记录
- `POST /api/import/records/{id}/apply` - 执行导入
- `POST /api/import/confirm` - 确认导入（事务）

### 黑名单
- `GET /api/blacklist` - 获取黑名单列表
- `POST /api/blacklist` - 添加黑名单
- `DELETE /api/blacklist/{id}` - 删除黑名单项

### 用户画像
- `GET /api/user/profile` - 获取用户画像
- `PUT /api/user/profile` - 更新用户画像
- `POST /api/user/profile/favorite-recipes/add` - 收藏菜谱
- `POST /api/user/profile/favorite-recipes/remove` - 取消收藏菜谱
- `POST /api/user/profile/favorite-ingredients/add` - 收藏食材
- `POST /api/user/profile/favorite-ingredients/remove` - 取消收藏食材
- `POST /api/user/profile/disliked-ingredients/add` - 添加忌口食材
- `POST /api/user/profile/disliked-ingredients/remove` - 移除忌口食材

### AI 聊天
- 相关接口在 `ai_chat.py` 中

---

## 数据流向

```
前端 (Next.js)
    ↓
API 代理 (app/api/proxy)
    ↓
后端 (FastAPI)
    ↓
路由层 (routers)
    ↓
服务层 (services) / 数据库操作
    ↓
Supabase (PostgreSQL)
```

---

## 环境配置

### 配置文件位置

| 文件 | 用途 | Git 追踪 |
|------|------|----------|
| `backend/.env` | 后端所有配置（密钥等敏感信息） | ❌ 忽略 |
| `backend/.env.example` | 后端配置模板 | ✅ 追踪 |
| `frontend/.env` | 前端 Docker 环境配置 | ✅ 追踪 |
| `frontend/.env.local` | 前端本地开发配置 | ❌ 忽略 |
| `frontend/.env.example` | 前端配置模板 | ✅ 追踪 |

### 配置分类

**后端专用（`backend/.env`）**：
- `SUPABASE_URL`, `SUPABASE_KEY` - 数据库连接
- `BAIDU_OCR_API_KEY`, `BAIDU_OCR_SECRET_KEY` - OCR 识别
- `LLM_API_URL`, `LLM_API_KEY` - AI 对话
- `BOCHAAI_API_KEY` - 联网搜索
- `USE_REAL_OCR`, `USE_LLM_CORRECTION`, `USE_FUZZY_MATCH` - 功能开关

**前端专用（`frontend/.env.local`）**：
- `BACKEND_URL` - 后端 API 地址

### 开发流程

**本地开发**：
1. 复制 `backend/.env.example` → `backend/.env`，填入实际值
2. 前端 `.env.local` 已配置好，无需修改

**Docker 部署**：
1. `docker-compose up` 会自动读取各服务的 `.env` 文件
2. 后端使用 `backend/.env`
3. 前端使用 `frontend/.env`

---

## 关键技术栈

### 后端
- **框架**: FastAPI
- **数据库**: Supabase (PostgreSQL)
- **AI**: OpenAI API (OCR、聊天)
- **日志**: 自定义日志系统

### 前端
- **框架**: Next.js 14 (App Router)
- **UI**: shadcn/ui + Tailwind CSS
- **状态管理**: Zustand
- **类型**: TypeScript
