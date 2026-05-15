# 文件路径变更映射 (MIGRATION_MAP)

## 项目结构

```
BasketMate/
├── frontend/                 # 前端代码
│   ├── app/
│   ├── components/
│   ├── contexts/
│   ├── hooks/
│   ├── lib/
│   ├── public/
│   ├── styles/
│   └── package.json
├── backend/                  # 后端代码
│   ├── app/
│   │   ├── routers/
│   │   ├── services/
│   │   └── ...
│   └── requirements.txt
├── docker-compose.yml
├── Dockerfile.frontend
├── ARCHITECTURE.md
└── MIGRATION_MAP.md
```

## 后端项目
| 文件路径 | 说明 |
|----------|------|
| `backend/` | 后端项目根目录 |
| `backend/README.md` | 后端项目说明 |
| `backend/requirements.txt` | Python 依赖 |
| `backend/Dockerfile` | 后端容器配置 |
| `backend/app/__init__.py` | 应用包初始化 |
| `backend/app/main.py` | FastAPI 应用入口 |
| `backend/app/config.py` | 配置管理 |
| `backend/app/database.py` | Supabase 数据库连接（使用 supabase Python 客户端） |
| `backend/app/models.py` | Pydantic 数据模型 |
| `backend/app/dependencies.py` | 依赖项（含预留认证） |
| `backend/app/routers/__init__.py` | 路由包初始化 |
| `backend/app/routers/ingredients.py` | 食材 CRUD 路由 |
| `backend/app/routers/recipes.py` | 菜谱 CRUD 路由 |
| `backend/app/routers/plans.py` | 计划 CRUD 路由（含自动刷新采购清单） |
| `backend/app/routers/prices.py` | 价格 CRUD 路由 |
| `backend/app/routers/shops.py` | 店铺 CRUD 路由 |
| `backend/app/routers/shopping.py` | 采购清单计算路由 |
| `backend/app/services/__init__.py` | 服务层包初始化 |
| `backend/app/services/shopping_service.py` | 采购清单核心算法（业务逻辑分层） |

## 前端项目
| 文件路径 | 说明 |
|----------|------|
| `frontend/app/` | Next.js App Router |
| `frontend/components/` | React 组件 |
| `frontend/contexts/` | React Context |
| `frontend/lib/` | 工具函数和 API 客户端 |
| `frontend/lib/api-client.ts` | API 调用封装 |
| `frontend/lib/purchase-utils.ts` | 采购工具函数 |
| `frontend/lib/generate-shopping-list.ts` | 采购清单生成 |
| `frontend/lib/ingredient-stock.ts` | 库存检查 |
| `frontend/contexts/DataContext.tsx` | 数据管理 Context |

## 待修改文件（前端数据层）

> 以下文件需要在前端代码重构阶段修改，用 fetch 调用后端 API 替换 Supabase 直连

### frontend/contexts/DataContext.tsx
需要将所有 Supabase 客户端调用改为 fetch 调用后端 API：
- `supabase.from('ingredients')...` → `fetch('/api/ingredients/...')`
- `supabase.from('recipes')...` → `fetch('/api/recipes/...')`
- `supabase.from('plans')...` → `fetch('/api/plans/...')`
- `supabase.from('prices')...` → `fetch('/api/prices/...')`
- `supabase.from('shops')...` → `fetch('/api/shops/...')`

### API 端点映射

| 原 Supabase 操作 | 新 API 端点 |
|------------------|--------------|
| `ingredients` 表 CRUD | `GET/POST /api/ingredients` |
| 单个食材 | `GET/PUT/DELETE /api/ingredients/{id}` |
| 食材ID解析 | `POST /api/ingredients/resolve?name=xxx` |
| `recipes` 表 CRUD | `GET/POST /api/recipes` |
| 单个菜谱 | `GET/PUT/DELETE /api/recipes/{id}` |
| `plans` 表 CRUD | `GET/POST /api/plans` |
| 单个计划 | `GET/PUT/DELETE /api/plans/{id}` |
| `prices` 表 CRUD | `GET/POST /api/prices` |
| 单个价格 | `GET/PUT/DELETE /api/prices/{id}` |
| `shops` 表 CRUD | `GET/POST /api/shops` |
| 单个店铺 | `GET/PUT/DELETE /api/shops/{id}` |
| 获取采购任务 | `GET /api/shopping/task` |
| 刷新采购任务 | `POST /api/shopping/task/refresh` |
| 添加到采购任务 | `POST /api/shopping/task/add?ingredient_id=xxx` |
| 完成采购 | `POST /api/shopping/task/complete` |
| 清空采购任务 | `POST /api/shopping/task/clear` |

### frontend/lib/ 目录辅助函数
| 文件 | 修改内容 |
|------|----------|
| `frontend/lib/generate-shopping-list.ts` | 改为调用 `POST /api/shopping/task/refresh` |
| `frontend/lib/purchase-utils.ts` | 改为调用 `/api/shopping/*` 端点 |
| `frontend/lib/ingredient-stock.ts` | 保留为前端辅助（纯函数） |

## 环境变量更新

### 前端需新增环境变量 (frontend/.env.local)
| 变量名 | 说明 | 示例 |
|--------|------|------|
| `NEXT_PUBLIC_API_URL` | 后端 API 地址 | `http://localhost:8000` |

### 后端环境变量
| 变量名 | 说明 | 示例 |
|--------|------|------|
| `SUPABASE_URL` | Supabase 项目 URL | `https://xxx.supabase.co` |
| `SUPABASE_KEY` | Supabase Anon Key | `eyJxxx...` |

## 部署文件映射

| 本地路径 | 容器内路径 | 说明 |
|----------|------------|------|
| `backend/` | `/app` | Python 后端 |
| `frontend/` | `/app` | Next.js 前端 |
| `.env` | 容器内传入 | 环境变量 |

## 后端架构说明

### 业务逻辑分层
- **路由层 (routers/)**: 只做参数校验和结果返回
- **服务层 (services/)**: 包含核心业务算法
- **数据层 (database.py)**: 统一数据库访问

### 认证预留
- `dependencies.py` 中的 `get_current_user()` 返回默认用户对象
- 未来可实现 JWT/Session 认证后替换
