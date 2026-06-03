-- ============================================================
-- 创建 blacklist 表和 import_records 的 deleted_patterns 列
-- ============================================================

-- 黑名单表（用于 OCR 过滤）
CREATE TABLE IF NOT EXISTS public.blacklist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pattern TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blacklist_pattern ON public.blacklist (pattern);

-- 启用行级安全
ALTER TABLE public.blacklist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blacklist_all" ON public.blacklist FOR ALL USING (true) WITH CHECK (true);

-- 为 import_records 添加 deleted_patterns 列
ALTER TABLE public.import_records 
ADD COLUMN IF NOT EXISTS deleted_patterns JSONB DEFAULT '[]'::JSONB;