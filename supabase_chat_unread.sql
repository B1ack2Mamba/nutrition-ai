-- Chat notifications / unread markers
--
-- Зачем: чтобы клиент и специалист видели «есть новые сообщения» вне страницы чата.
--
-- ⚠️ Выполни в Supabase SQL Editor.

-- 1) Добавляем поля в chat_threads (безопасно: IF NOT EXISTS)
alter table public.chat_threads add column if not exists last_message_at timestamptz;
alter table public.chat_threads add column if not exists last_message_sender_id uuid;
alter table public.chat_threads add column if not exists client_last_read_at timestamptz;
alter table public.chat_threads add column if not exists nutritionist_last_read_at timestamptz;

-- 2) Инициализируем last_read для уже существующих тредов, чтобы они не считались «непрочитанными»
update public.chat_threads
set
  client_last_read_at = coalesce(client_last_read_at, created_at),
  nutritionist_last_read_at = coalesce(nutritionist_last_read_at, created_at)
where client_last_read_at is null or nutritionist_last_read_at is null;

-- 3) На каждое новое сообщение трогаем chat_threads: updated_at + last_message_*
--    Если у тебя по какой-то причине НЕТ updated_at в chat_threads, просто убери строку updated_at = now().
create or replace function public.tg_chat_threads_touch_from_message()
returns trigger
language plpgsql
as $$
begin
  update public.chat_threads
  set
    updated_at = now(),
    last_message_at = coalesce(new.created_at, now()),
    last_message_sender_id = new.sender_id
  where id = new.thread_id;

  return new;
end;
$$;

drop trigger if exists chat_threads_touch_from_message on public.chat_messages;
create trigger chat_threads_touch_from_message
after insert on public.chat_messages
for each row execute function public.tg_chat_threads_touch_from_message();
