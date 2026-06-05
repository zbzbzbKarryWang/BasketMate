# 开发日志

## 当前基线信息
**审计日期**: 2026-06-05  
**项目版本**: 1.0.0  

---

## 项目状态概览

### 代码统计
- **后端 Python 文件**: 20+ 个
- **前端 TypeScript/TSX 文件**: 50+ 个
- **数据库表**: 10 个（2 个废弃）
- **API 路由**: 50+ 个端点

### 关键模块状态

| 模块 | 状态 | 说明 |
|------|------|------|
| 食材管理 | 🟢 正常 | 完整的 CRUD + 批量更新 |
| 菜谱管理 | 🟢 正常 | 基本功能，支持备注 |
| 用餐计划 | 🟢 正常 | 支持早餐转盘、增量更新 |
| 采购清单 | 🟢 正常 | 使用 purchase_tasks 表 |
| 比价系统 | 🟢 正常 | 多店铺价格对比 |
| OCR 导入 | 🟢 正常 | 小票识别、黑名单、事务 |
| AI 聊天 | 🟢 正常 | 集成 OpenAI |
| 用户画像 | 🟢 正常 | 收藏、喜爱、忌口 |

---

## 历史变更记录（从迁移文件推断）

### 2026-06-05: 环境配置重构 + 根目录文件清理
- **变更类型**: 架构调整 + 文件清理
- **描述**: 按"谁使用谁管理"原则重构配置文件，清理根目录无用文件
- **操作**:
  - 将后端配置从根目录 `.env` 移动到 `backend/.env`
  - 创建 `backend/.env.example` 作为模板
  - 创建 `frontend/.env` 用于 Docker 环境
  - 更新 `docker-compose.yml` 使用 `env_file` 方式加载配置
  - 更新 `.gitignore` 确保敏感文件不被提交
  - 删除根目录无用文件：
    - `Dockerfile.frontend`（已由 frontend/Dockerfile 替代）
    - `package.json`, `package-lock.json`（已由 frontend/package.json 替代）
    - `b_h0swSZN7pmK.zip`（无用备份文件）
    - `temp_*.txt/js/py`（临时测试脚本）
    - `MIGRATION_MAP.md`（过时的迁移文档）
  - 移动文档到 docs/：
    - `ARCHITECTURE.md` → `docs/ARCHITECTURE.md`
    - `DEPRECATED.md` → `docs/DEPRECATED.md`
- **相关文件**:
  - `backend/.env` (新增)
  - `backend/.env.example` (新增)
  - `frontend/.env` (新增)
  - `docker-compose.yml` (修改)
  - `.gitignore` (修改)
- **删除文件**:
  - `Dockerfile.frontend`
  - `package.json`, `package-lock.json`
  - `b_h0swSZN7pmK.zip`
  - `temp_*.txt/js/py`
  - `MIGRATION_MAP.md`
  - `.env`, `.env.example` (根目录)

### 迁移 001: update_ingredient_safe
- 添加安全更新食材的函数

### 迁移 002: batch_update_quantities_safe
- 添加批量更新库存的函数

### 迁移 003: delete_ingredient_cascade
- 添加级联删除食材的函数

### 迁移 004-006: plans 相关
- 创建、更新、删除计划时刷新采购清单

### 迁移 007: complete_purchase_task
- 完成采购任务的事务函数

### 迁移 008-009: prices 相关
- Upsert 和删除价格时刷新采购清单

### 迁移 010: delete_shop_cascade
- 级联删除店铺

### 迁移 011: confirm_import_transaction
- 导入确认的事务函数

### 迁移 012: create_blacklist_table
- 创建黑名单表

### 迁移 013: drop_unit_column
- **重要**: 删除 ingredients.unit 字段（已废弃）

### 迁移 014: create_user_profiles
- 创建用户画像表

---

## 未使用代码统计

### 后端
| 类型 | 数量 |
|------|------|
| 废弃表 | 1 (shopping_list) |
| 废弃字段 | 1 (ingredients.unit) |
| 测试文件 | 3 (test_api.py, test_ocr_llm.py, test_parse.py) |

### 前端
| 类型 | 数量 |
|------|------|
| 待确认文件 | 2 (supabase-mappers.ts, supabaseClient.ts) |
| 未使用导入 | 待进一步检查 |

---

## 已知架构决策

### 1. 前后端分离
- **状态**: ✅ 已完成
- **说明**: Next.js 前端 + FastAPI 后端，通过 API 代理通信

### 2. 数据库迁移
- **状态**: ✅ 已完成
- **说明**: 使用 Supabase migrations 管理 schema 变更

### 3. 采购清单重构
- **状态**: ✅ 已完成
- **说明**: 从 shopping_list 表迁移到 purchase_tasks 表，支持来源追踪

### 4. OCR 导入事务
- **状态**: ✅ 已完成
- **说明**: 使用 PostgreSQL 事务确保导入操作的原子性

---

## 优化建议清单

1. **完善 schema.sql** - 添加缺失的表和字段
2. **清理废弃代码** - 删除 shopping_list 表相关代码
3. **统一日志格式** - 确保所有路由都有结构化日志
4. **添加错误监控** - 集成 Sentry 或类似服务
5. **补充单元测试** - 为核心业务逻辑添加测试

---

## 下次审计前检查项

- [ ] 是否有新增的 API 端点？
- [ ] 是否有新增的数据库表/字段？
- [ ] 是否有废弃的代码需要清理？
- [ ] 文档是否同步更新？
