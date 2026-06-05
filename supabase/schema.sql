-- Run in Supabase SQL Editor (once). Requires extension for gen_random_uuid.

create extension if not exists "pgcrypto";

-- 食材 / 库存
create table if not exists public.ingredients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  quantity double precision not null default 0,
  added_at timestamptz not null default now(),
  alias text
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
  ingredients jsonb not null default '[]'::jsonb,
  notes text
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

-- 采购任务
create table if not exists public.purchase_tasks (
  id uuid primary key default gen_random_uuid(),
  status boolean not null default true,
  pending_items jsonb not null default '[]'::jsonb,
  custom_items jsonb not null default '[]'::jsonb,
  completed_items jsonb not null default '[]'::jsonb,
  removed_ingredient_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  completed_at timestamptz
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
  viewed boolean not null default false,
  deleted_patterns text[] not null default '{}'
);

-- 黑名单
create table if not exists public.blacklist (
  id uuid primary key default gen_random_uuid(),
  pattern text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_plans_date on public.plans (date);
create index if not exists idx_prices_ingredient on public.prices (ingredient_id);
create index if not exists idx_import_records_created_at on public.import_records (created_at desc);

-- 开发用：允许匿名读写（生产请改为认证用户 + 细粒度策略）
alter table public.ingredients enable row level security;
alter table public.shops enable row level security;
alter table public.prices enable row level security;
alter table public.recipes enable row level security;
alter table public.plans enable row level security;
alter table public.purchase_tasks enable row level security;
alter table public.import_records enable row level security;
alter table public.blacklist enable row level security;

create policy "ingredients_all" on public.ingredients for all using (true) with check (true);
create policy "shops_all" on public.shops for all using (true) with check (true);
create policy "prices_all" on public.prices for all using (true) with check (true);
create policy "recipes_all" on public.recipes for all using (true) with check (true);
create policy "plans_all" on public.plans for all using (true) with check (true);
create policy "purchase_tasks_all" on public.purchase_tasks for all using (true) with check (true);
create policy "import_records_all" on public.import_records for all using (true) with check (true);
create policy "blacklist_all" on public.blacklist for all using (true) with check (true);

-- 用户画像
create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique default 'default',
  favorite_recipes jsonb not null default '[]'::jsonb,
  favorite_ingredients jsonb not null default '[]'::jsonb,
  disliked_ingredients jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 插入默认记录
insert into public.user_profiles (user_id, favorite_recipes, favorite_ingredients, disliked_ingredients)
values ('default', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb)
on conflict (user_id) do nothing;

-- 创建 updated_at 自动更新触发器
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language 'plpgsql';

create trigger update_user_profiles_updated_at
  before update on public.user_profiles
  for each row
  execute function update_updated_at_column();

-- RLS 策略
alter table public.user_profiles enable row level security;

create policy "user_profiles_all" on public.user_profiles for all using (true) with check (true);
