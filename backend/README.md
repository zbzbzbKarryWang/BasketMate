# BasketMate Backend

FastAPI backend for BasketMate application.

## 项目结构

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI 应用入口
│   ├── config.py            # 配置管理
│   ├── database.py         # 数据库连接
│   ├── models.py           # Pydantic 数据模型
│   ├── dependencies.py     # 依赖项（预留认证）
│   └── routers/
│       ├── __init__.py
│       ├── ingredients.py   # 食材 CRUD
│       ├── recipes.py       # 菜谱 CRUD
│       ├── plans.py        # 计划 CRUD
│       ├── prices.py       # 价格 CRUD
│       ├── shops.py        # 店铺 CRUD
│       └── shopping.py     # 采购清单计算
├── requirements.txt        # Python 依赖
└── Dockerfile             # 后端容器配置
```

## 环境变量

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
```

## 运行

```bash
# 开发模式
uvicorn app.main:app --reload --port 8000

# Docker
docker build -t basketmate-backend .
docker run -p 8000:8000 -e SUPABASE_URL -e SUPABASE_KEY basketmate-backend
```
