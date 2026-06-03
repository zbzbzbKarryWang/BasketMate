-- ============================================================
-- 迁移: 删除 ingredients 表的 unit 字段
-- IMPORTANT: unit 字段已永久废弃，以后任何代码都不应该再使用！
-- ============================================================

ALTER TABLE ingredients DROP COLUMN IF EXISTS unit;
