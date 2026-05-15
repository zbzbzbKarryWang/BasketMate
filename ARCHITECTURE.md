# BasketMate 架构说明

## 系统拓扑

```
┌─────────────────────────────────────────────────────────────┐
│                        用户浏览器                            │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    Next.js 前端 (3000)                      │
│                    Docker 容器化                              │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTP API (RESTful)
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                  FastAPI 后端 (8000)                         │
│                  Docker 容器化                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Routers                                            │   │
│  │  - ingredients.py  (食材 CRUD)                      │   │
│  │  - recipes.py     (菜谱 CRUD)                       │   │
│  │  - plans.py       (计划 CRUD)                       │   │
│  │  - prices.py      (价格 CRUD)                       │   │
│  │  - shops.py       (店铺 CRUD)                       │   │
│  │  - shopping.py    (采购清单计算)                     │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Supabase Client                                    │   │
│  │  (通过环境变量连接 Supabase PostgreSQL)              │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                  Supabase                                    │
│  - PostgreSQL 数据库 (数据存储)                               │
│  - Authentication (预留，未来启用)                            │
└─────────────────────────────────────────────────────────────┘
```

## 服务说明

| 服务 | 端口 | 技术栈 | 说明 |
|------|------|--------|------|
| Frontend | 3000 | Next.js | 用户界面，调用后端 API |
| Backend | 8000 | FastAPI | 业务逻辑层，统一处理数据库操作 |
| Supabase | - | PostgreSQL | 数据持久化 |

## API 端点清单

### 食材 (Ingredients)
- `GET /api/ingredients` - 获取所有食材
- `GET /api/ingredients/{id}` - 获取单个食材
- `POST /api/ingredients` - 创建食材
- `PUT /api/ingredients/{id}` - 更新食材
- `DELETE /api/ingredients/{id}` - 删除食材
- `POST /api/ingredients/resolve` - 根据名称解析食材ID

### 菜谱 (Recipes)
- `GET /api/recipes` - 获取所有菜谱
- `GET /api/recipes/{id}` - 获取单个菜谱
- `POST /api/recipes` - 创建菜谱
- `PUT /api/recipes/{id}` - 更新菜谱
- `DELETE /api/recipes/{id}` - 删除菜谱

### 计划 (Plans)
- `GET /api/plans` - 获取所有计划
- `GET /api/plans/{id}` - 获取单个计划
- `POST /api/plans` - 创建计划
- `PUT /api/plans/{id}` - 更新计划
- `DELETE /api/plans/{id}` - 删除计划

### 价格 (Prices)
- `GET /api/prices` - 获取所有价格
- `GET /api/prices/{id}` - 获取单个价格
- `POST /api/prices` - 创建价格
- `PUT /api/prices/{id}` - 更新价格
- `DELETE /api/prices/{id}` - 删除价格

### 店铺 (Shops)
- `GET /api/shops` - 获取所有店铺
- `GET /api/shops/{id}` - 获取单个店铺
- `POST /api/shops` - 创建店铺
- `PUT /api/shops/{id}` - 更新店铺
- `DELETE /api/shops/{id}` - 删除店铺

### 采购 (Shopping)
- `GET /api/shopping/task` - 获取活跃采购任务
- `POST /api/shopping/task/refresh` - 重新计算采购任务
- `POST /api/shopping/task/add` - 添加食材到采购任务
- `POST /api/shopping/task/complete` - 完成采购
- `POST /api/shopping/task/clear` - 清空采购任务

### 系统
- `GET /api/health` - 健康检查
- `GET /` - 根路径

## 环境变量

### Backend (.env)
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
```

### Frontend (.env)
```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## 部署方式

### Docker Compose (推荐)
```bash
# 构建并启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

### 独立运行
```bash
# 后端
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload

# 前端
npm run dev
```
