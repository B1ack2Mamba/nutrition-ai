-- =========================================================
-- Nutrition AI: chat + связь клиент↔нутрициолог
-- Выполнить в Supabase → SQL Editor
-- =========================================================

-- UUID / crypto (на Supabase обычно уже включено)
create extension if not exists pgcrypto;

-- =========================================================
-- 1) Связь клиент ↔ нутрициолог (используется в страницах
--    /client/specialists и /nutritionist/clients)
-- =========================================================

create table if not exists public.client_nutritionists (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references auth.users(id) on delete cascade,
  nutritionist_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

-- Если таблица уже существовала, убедимся что ключевые колонки есть
alter table public.client_nutritionists add column if not exists id uuid;
alter table public.client_nutritionists add column if not exists client_id uuid;
alter table public.client_nutritionists add column if not exists nutritionist_id uuid;
alter table public.client_nutritionists add column if not exists status text;
alter table public.client_nutritionists add column if not exists created_at timestamptz;
alter table public.client_nutritionists add column if not exists updated_at timestamptz;

create unique index if not exists client_nutritionists_client_nutritionist_uq
  on public.client_nutritionists (client_id, nutritionist_id);

alter table public.client_nutritionists enable row level security;

-- Клиент/нутрициолог видят только свои связи
drop policy if exists "client_nutritionists_select_own" on public.client_nutritionists;
create policy "client_nutritionists_select_own" on public.client_nutritionists
  for select
  using (client_id = auth.uid() or nutritionist_id = auth.uid());

-- Добавлять связь может клиент (выбирает спеца) ИЛИ нутрициолог (добавляет клиента)
drop policy if exists "client_nutritionists_insert_own" on public.client_nutritionists;
create policy "client_nutritionists_insert_own" on public.client_nutritionists
  for insert
  with check (client_id = auth.uid() or nutritionist_id = auth.uid());

drop policy if exists "client_nutritionists_update_own" on public.client_nutritionists;
create policy "client_nutritionists_update_own" on public.client_nutritionists
  for update
  using (client_id = auth.uid() or nutritionist_id = auth.uid())
  with check (client_id = auth.uid() or nutritionist_id = auth.uid());

-- (опционально) Удаление связи — только участникам
drop policy if exists "client_nutritionists_delete_own" on public.client_nutritionists;
create policy "client_nutritionists_delete_own" on public.client_nutritionists
  for delete
  using (client_id = auth.uid() or nutritionist_id = auth.uid());


-- =========================================================
-- 2) Текстовый чат
-- =========================================================

create table if not exists public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references auth.users(id) on delete cascade,
  nutritionist_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- метаданные для превью/уведомлений
  last_message_at timestamptz,
  last_message_sender_id uuid references auth.users(id),
  last_message_preview text,

  -- отметки «прочитано»
  client_last_read_at timestamptz,
  nutritionist_last_read_at timestamptz
);

-- Если таблица уже существовала, добавим недостающие колонки (безопасно)
alter table public.chat_threads add column if not exists id uuid;
alter table public.chat_threads add column if not exists client_id uuid;
alter table public.chat_threads add column if not exists nutritionist_id uuid;
alter table public.chat_threads add column if not exists created_at timestamptz;
alter table public.chat_threads add column if not exists updated_at timestamptz;
alter table public.chat_threads add column if not exists last_message_at timestamptz;
alter table public.chat_threads add column if not exists last_message_sender_id uuid;
alter table public.chat_threads add column if not exists last_message_preview text;
alter table public.chat_threads add column if not exists client_last_read_at timestamptz;
alter table public.chat_threads add column if not exists nutritionist_last_read_at timestamptz;

create unique index if not exists chat_threads_client_nutritionist_uq
  on public.chat_threads (client_id, nutritionist_id);

create index if not exists chat_threads_client_id_idx on public.chat_threads (client_id);
create index if not exists chat_threads_nutritionist_id_idx on public.chat_threads (nutritionist_id);

alter table public.chat_threads enable row level security;

drop policy if exists "chat_threads_select_own" on public.chat_threads;
create policy "chat_threads_select_own" on public.chat_threads
  for select
  using (client_id = auth.uid() or nutritionist_id = auth.uid());

drop policy if exists "chat_threads_insert_own" on public.chat_threads;
create policy "chat_threads_insert_own" on public.chat_threads
  for insert
  with check (client_id = auth.uid() or nutritionist_id = auth.uid());

drop policy if exists "chat_threads_update_own" on public.chat_threads;
create policy "chat_threads_update_own" on public.chat_threads
  for update
  using (client_id = auth.uid() or nutritionist_id = auth.uid())
  with check (client_id = auth.uid() or nutritionist_id = auth.uid());


-- updated_at триггер (Только для chat_threads)
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at_chat_threads on public.chat_threads;
create trigger set_updated_at_chat_threads
before update on public.chat_threads
for each row execute function public.tg_set_updated_at();


create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

-- Если таблица уже существовала, добавим недостающие колонки
alter table public.chat_messages add column if not exists id uuid;
alter table public.chat_messages add column if not exists thread_id uuid;
alter table public.chat_messages add column if not exists sender_id uuid;
alter table public.chat_messages add column if not exists body text;
alter table public.chat_messages add column if not exists created_at timestamptz;

create index if not exists chat_messages_thread_id_created_at_idx
  on public.chat_messages (thread_id, created_at);

alter table public.chat_messages enable row level security;

-- Сообщения видят только участники треда
drop policy if exists "chat_messages_select_own" on public.chat_messages;
create policy "chat_messages_select_own" on public.chat_messages
  for select
  using (
    exists (
      select 1
      from public.chat_threads t
      where t.id = thread_id
        and (t.client_id = auth.uid() or t.nutritionist_id = auth.uid())
    )
  );

-- Вставлять можно только участнику треда и только от своего sender_id
drop policy if exists "chat_messages_insert_own" on public.chat_messages;
create policy "chat_messages_insert_own" on public.chat_messages
  for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1
      from public.chat_threads t
      where t.id = thread_id
        and (t.client_id = auth.uid() or t.nutritionist_id = auth.uid())
    )
  );

-- Обновление/удаление сообщений не даём (можно добавить позже при необходимости)


-- =========================================================
-- 3) Realtime
-- =========================================================

-- В Realtime достаточно chat_messages (чтобы получать новые сообщения)
-- Если нужно realtime по тредам (например, last_message_*), добавьте и chat_threads.

alter publication supabase_realtime add table public.chat_messages;
-- alter publication supabase_realtime add table public.chat_threads;

