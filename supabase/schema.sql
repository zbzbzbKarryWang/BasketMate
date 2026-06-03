-- Run in Supabase SQL Editor (once). Requires extension for gen_random_uuid.

create extension if not exists "pgcrypto";

-- 食材 / 库存
-- IMPORTANT: unit 字段已永久废弃，以后任何代码都不应该再使用！
create table if not exists public.ingredients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  quantity double precision not null default 0,
  added_at timestamptz not null default now()
);

-- 店铺
create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

-- 比价
create table if not exists public.prices (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  shop_id uuid not null references public.shops (id) on delete cascade,
  price double precision not null,
  unique (ingredient_id, shop_id)
);

-- 菜谱：ingredients 为 jsonb，元素形如 {"ingredient_id":"<uuid>","quantity":2}
create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  ingredients jsonb not null default '[]'::jsonb
);

-- 计划
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  breakfast_item text,
  meal_ids uuid[] not null default '{}',
  breakfast_wheel_extras jsonb not null default '[]'::jsonb,
  breakfast_wheel_hidden_ids text[] not null default '{}'
);

-- 采购清单（含临时项：ingredient_id 可空）
create table if not exists public.shopping_list (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid references public.ingredients (id) on delete set null,
  shop_name text not null default '待定',
  need_quantity double precision not null default 1,
  checked boolean not null default false,
  ingredient_name text,
  is_ephemeral boolean not null default false
);

-- 导入记录
create table if not exists public.import_records (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  shop_name text,
  import_type jsonb not null default '[]'::jsonb,
  status text not null default 'pending',
  items jsonb not null default '[]'::jsonb,
  image_count integer not null default 0,
  viewed boolean not null default false
);

create index if not exists idx_plans_date on public.plans (date);
create index if not exists idx_prices_ingredient on public.prices (ingredient_id);
create index if not exists idx_shopping_ingredient on public.shopping_list (ingredient_id);
create index if not exists idx_import_records_created_at on public.import_records (created_at desc);

-- 开发用：允许匿名读写（生产请改为认证用户 + 细粒度策略）
alter table public.ingredients enable row level security;
alter table public.shops enable row level security;
alter table public.prices enable row level security;
alter table public.recipes enable row level security;
alter table public.plans enable row level security;
alter table public.shopping_list enable row level security;
alter table public.import_records enable row level security;

create policy "ingredients_all" on public.ingredients for all using (true) with check (true);
create policy "shops_all" on public.shops for all using (true) with check (true);
create policy "prices_all" on public.prices for all using (true) with check (true);
create policy "recipes_all" on public.recipes for all using (true) with check (true);
create policy "plans_all" on public.plans for all using (true) with check (true);
create policy "shopping_list_all" on public.shopping_list for all using (true) with check (true);
create policy "import_records_all" on public.import_records for all using (true) with check (true);
