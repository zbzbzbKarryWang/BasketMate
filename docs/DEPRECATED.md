# 开发指南：已废弃字段和功能

## 重要：永久废弃的字段

### ingredients 表 - unit 字段
- **废弃时间**: 2026-06-04
- **原因**: 不再使用单位字段
- **处理**: 已从数据库中删除该列
- **禁止**: 任何代码都不应该再引用或使用 `unit` 字段！

## 已清理的文件

### 数据库
- `supabase/migrations/013_drop_unit_column.sql` - 删除 unit 字段的迁移
- `supabase/schema.sql` - 表定义已更新

### 后端
- `backend/app/models.py` - Pydantic 模型已移除 unit
- `backend/app/routers/import_records.py` - API 路由已移除 unit
- `backend/app/services/shopping_service.py` - 服务逻辑已移除 unit
- `supabase/migrations/011_confirm_import_transaction.sql` - 存储过程已移除 unit

### 前端
- `frontend/lib/types.ts` - 类型定义已移除 unit
- `frontend/lib/supabase-mappers.ts` - 数据映射已移除 unit
- `frontend/contexts/DataContext.tsx` - 数据上下文已移除 unit
- `frontend/components/recipes-page.tsx` - 菜谱页面已移除 unit
- `frontend/components/price-page.tsx` - 价格页面已移除 unit

## 开发检查清单

在编写新代码时，请检查：
1. 是否使用了 `unit` 字段？
2. 是否在创建食材时指定了 `unit`？
3. 是否在查询中引用了 `unit` 列？

如果答案是"是"，请立即移除！

## 相关文件位置

- 数据库迁移: `supabase/migrations/`
- 后端代码: `backend/app/`
- 前端代码: `frontend/`
