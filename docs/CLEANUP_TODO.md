# 清理任务清单

## 概述
本文档列出代码审计中发现的需要清理和优化的项目，按优先级排序。

---

## 优先级 🔴 高（建议尽快处理）

### 1. 完善数据库 schema
**问题**: `schema.sql` 中缺少实际使用的表和字段
**位置**: `supabase/schema.sql`
**建议操作**:
- 添加 `purchase_tasks` 表定义
- 添加 `blacklist` 表定义
- 添加 `ingredients.alias` 字段
- 添加 `import_records.deleted_patterns` 字段
**风险**: 低（仅文档完善）

### 2. 删除废弃的 shopping_list 表
**问题**: `shopping_list` 表已完全废弃，但仍在 schema 中
**位置**: `supabase/schema.sql`
**建议操作**:
- 从 schema.sql 中移除该表定义
- 创建迁移文件删除该表（确认无数据后）
**风险**: 中（需确认生产环境中无数据）

### 3. 清理前端旧 Supabase 文件
**问题**: 前端可能还有旧的 Supabase 直连代码
**位置**: 
- `frontend/lib/supabase-mappers.ts`
- `frontend/lib/supabaseClient.ts`
**建议操作**:
- 检查这两个文件是否仍在使用
- 如未使用，直接删除
- 如仍在使用，确认是否需要迁移到 API
**风险**: 低（删除前需确认）

---

## 优先级 🟡 中（建议近期处理）

### 4. 统一导入路径
**问题**: 部分文件使用 `from . import`，部分使用 `from .. import`
**位置**: `backend/app/routers/*.py`
**建议操作**:
- 统一使用相对导入路径
**风险**: 极低（代码组织优化）

### 5. 移除测试文件或移到 test/ 目录
**问题**: 后端根目录下有测试文件
**位置**:
- `backend/test_api.py`
- `backend/test_ocr_llm.py`
- `backend/test_parse.py`
**建议操作**:
- 确认这些文件是否需要保留
- 如需保留，移到 `backend/test/` 目录
- 如不需要，直接删除
**风险**: 低（测试文件）

### 6. 清理重复的 update_pending_items_for_plan 函数
**问题**: `plans.py` 和 `shopping.py` 中都有相同的函数
**位置**:
- `backend/app/routers/plans.py`
- `backend/app/routers/shopping.py`
**建议操作**:
- 将函数移到 `services/shopping_service.py`
- 两个路由都从 service 导入
**风险**: 低（代码重构）

### 7. 移除 frontend/lib/supabase-mappers.ts
**问题**: 此文件可能包含旧的 Supabase 映射逻辑
**位置**: `frontend/lib/supabase-mappers.ts`
**建议操作**:
- 全局搜索确认是否有地方引用
- 如无引用，直接删除
**风险**: 低（删除前需确认）

### 8. 移除 frontend/lib/supabaseClient.ts
**问题**: 已迁移到 API，不再需要直连 Supabase
**位置**: `frontend/lib/supabaseClient.ts`
**建议操作**:
- 全局搜索确认是否有地方引用
- 如无引用，直接删除
**风险**: 低（删除前需确认）

### 9. 检查并清理未使用的 UI 组件
**问题**: 部分 shadcn/ui 组件可能未被使用
**位置**: `frontend/components/ui/*.tsx`
**建议操作**:
- 使用工具（如 `ts-prune`）检查未使用组件
- 删除确认未使用的组件
**风险**: 低（删除前需确认）

---

## 优先级 🟢 低（可延后处理）

### 10. 添加类型安全
**问题**: 部分代码使用 `any` 类型
**位置**: 前端多个文件
**建议操作**:
- 逐步替换 `any` 为具体类型
**风险**: 极低（代码质量提升）

### 11. 添加更多单元测试
**问题**: 核心业务逻辑缺少测试
**位置**: 后端 services
**建议操作**:
- 为 `shopping_service.py` 添加测试
- 为 `ocr_service.py` 添加测试
**风险**: 极低（测试覆盖提升）

### 12. 代码格式化
**问题**: 代码风格可能不一致
**位置**: 整个项目
**建议操作**:
- 配置 Black (Python)
- 配置 Prettier (TypeScript)
- 运行一次全项目格式化
**风险**: 极低（代码风格统一）

### 13. 完善错误处理
**问题**: 部分错误处理可以更细致
**位置**: 后端 routers
**建议操作**:
- 添加更多特定的异常类型
- 提供更友好的错误消息
**风险**: 低（用户体验提升）

---

## 数据库清理（需谨慎）

### 14. 清理旧的 purchase_tasks 数据
**问题**: 可能有大量历史数据
**位置**: Supabase 数据库
**建议操作**:
- 添加自动归档或删除已完成任务的逻辑
- 或定期手动清理
**风险**: 中（需备份数据）

---

## 清理执行建议

### 阶段 1: 安全删除（无风险）
1. ✅ 检查并删除确认未使用的前端文件
2. ✅ 移动或删除后端测试文件
3. ✅ 统一导入路径

### 阶段 2: 代码重构（低风险）
4. ✅ 提取重复函数到 service
5. ✅ 代码格式化
6. ✅ 添加类型安全

### 阶段 3: 数据库变更（需谨慎）
7. ⚠️ 完善 schema.sql
8. ⚠️ 删除 shopping_list 表（确认后）
9. ⚠️ 清理旧数据（确认后）

---

## 验证清单

每次清理后，请验证：
- [ ] 后端服务正常启动
- [ ] 前端页面正常加载
- [ ] 所有 API 端点正常响应
- [ ] 核心功能正常工作（创建计划、生成采购清单等）
- [ ] 无控制台错误
