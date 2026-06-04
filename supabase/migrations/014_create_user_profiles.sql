-- 用户画像表
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
