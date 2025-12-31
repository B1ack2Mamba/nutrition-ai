-- 05_notifications.sql
-- Добавляет уведомления (хранение подписок Web Push + лента уведомлений + настройки).

-- Требуется pgcrypto для gen_random_uuid()
create extension if not exists pgcrypto;

-- 1) Устройства/подписки (Web Push / FCM в будущем)
create table if not exists public.notification_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('webpush','fcm')),
  endpoint text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists notification_devices_user_kind_endpoint_uq
  on public.notification_devices (user_id, kind, endpoint);

-- 2) Настройки уведомлений (что слать)
create table if not exists public.notification_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enable_training boolean not null default true,
  enable_diary boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3) Лента уведомлений (чтобы пуш мог быть “пустым”, но контент был в приложении)
create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic text not null check (topic in ('training','diary')),
  title text not null,
  body text not null,
  url text null,
  read_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists user_notifications_user_created_idx
  on public.user_notifications (user_id, created_at desc);

-- RLS
alter table public.notification_devices enable row level security;
alter table public.notification_prefs enable row level security;
alter table public.user_notifications enable row level security;

-- Политики для владельца
drop policy if exists notification_devices_owner_select on public.notification_devices;
create policy notification_devices_owner_select
  on public.notification_devices for select
  using (auth.uid() = user_id);

drop policy if exists notification_devices_owner_insert on public.notification_devices;
create policy notification_devices_owner_insert
  on public.notification_devices for insert
  with check (auth.uid() = user_id);

drop policy if exists notification_devices_owner_update on public.notification_devices;
create policy notification_devices_owner_update
  on public.notification_devices for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists notification_devices_owner_delete on public.notification_devices;
create policy notification_devices_owner_delete
  on public.notification_devices for delete
  using (auth.uid() = user_id);

drop policy if exists notification_prefs_owner_select on public.notification_prefs;
create policy notification_prefs_owner_select
  on public.notification_prefs for select
  using (auth.uid() = user_id);

drop policy if exists notification_prefs_owner_upsert on public.notification_prefs;
create policy notification_prefs_owner_upsert
  on public.notification_prefs for insert
  with check (auth.uid() = user_id);

drop policy if exists notification_prefs_owner_update on public.notification_prefs;
create policy notification_prefs_owner_update
  on public.notification_prefs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists user_notifications_owner_select on public.user_notifications;
create policy user_notifications_owner_select
  on public.user_notifications for select
  using (auth.uid() = user_id);

drop policy if exists user_notifications_owner_update on public.user_notifications;
create policy user_notifications_owner_update
  on public.user_notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- (insert/delete для user_notifications делаем только через сервер (service role), чтобы пользователи не подделывали уведомления)
