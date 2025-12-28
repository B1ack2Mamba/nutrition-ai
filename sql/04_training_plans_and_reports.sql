-- 04_training_plans_and_reports.sql
-- Добавляет хранение плана тренировок (от специалиста) и отчёта клиента по тренировке в дневнике.
-- Архитектура: всё лежит в client_journal_entries (1 запись = 1 день), поля JSONB:
--  - training_plan jsonb
--  - training_report jsonb
--
-- Важно: для UPSERT через onConflict нужен unique index на (user_id, entry_date).

-- 1) Колонки
alter table public.client_journal_entries
  add column if not exists training_plan jsonb;

alter table public.client_journal_entries
  add column if not exists training_report jsonb;

-- 2) Unique index (нужен для ON CONFLICT user_id,entry_date)
create unique index if not exists client_journal_entries_user_date_uq
  on public.client_journal_entries (user_id, entry_date);

-- 3) RLS-политики: специалист может INSERT/UPDATE записи дневника своих клиентов
-- (как минимум чтобы записывать training_plan; клиент пишет training_report).

alter table public.client_journal_entries enable row level security;

do $do$
begin
  -- Вариант A: таблица связей называется client_nutritionist_links (используется в приложении)
  if to_regclass('public.client_nutritionist_links') is not null then
    execute 'drop policy if exists journal_insert_linked_nutritionist on public.client_journal_entries';
    execute $p$
      create policy journal_insert_linked_nutritionist
        on public.client_journal_entries
        for insert
        with check (
          exists (
            select 1 from public.client_nutritionist_links l
            where l.client_id = client_journal_entries.user_id
              and l.nutritionist_id = auth.uid()
              and (l.status is null or l.status in ('approved','active'))
          )
        )
    $p$;

    execute 'drop policy if exists journal_update_linked_nutritionist on public.client_journal_entries';
    execute $p$
      create policy journal_update_linked_nutritionist
        on public.client_journal_entries
        for update
        using (
          exists (
            select 1 from public.client_nutritionist_links l
            where l.client_id = client_journal_entries.user_id
              and l.nutritionist_id = auth.uid()
              and (l.status is null or l.status in ('approved','active'))
          )
        )
        with check (
          exists (
            select 1 from public.client_nutritionist_links l
            where l.client_id = client_journal_entries.user_id
              and l.nutritionist_id = auth.uid()
              and (l.status is null or l.status in ('approved','active'))
          )
        )
    $p$;
  end if;

  -- Вариант B: если у кого-то старая таблица client_nutritionists
  if to_regclass('public.client_nutritionists') is not null then
    execute 'drop policy if exists journal_insert_linked_nutritionist_legacy on public.client_journal_entries';
    execute $p$
      create policy journal_insert_linked_nutritionist_legacy
        on public.client_journal_entries
        for insert
        with check (
          exists (
            select 1 from public.client_nutritionists l
            where l.client_id = client_journal_entries.user_id
              and l.nutritionist_id = auth.uid()
              and (l.status is null or l.status in ('approved','active'))
          )
        )
    $p$;

    execute 'drop policy if exists journal_update_linked_nutritionist_legacy on public.client_journal_entries';
    execute $p$
      create policy journal_update_linked_nutritionist_legacy
        on public.client_journal_entries
        for update
        using (
          exists (
            select 1 from public.client_nutritionists l
            where l.client_id = client_journal_entries.user_id
              and l.nutritionist_id = auth.uid()
              and (l.status is null or l.status in ('approved','active'))
          )
        )
        with check (
          exists (
            select 1 from public.client_nutritionists l
            where l.client_id = client_journal_entries.user_id
              and l.nutritionist_id = auth.uid()
              and (l.status is null or l.status in ('approved','active'))
          )
        )
    $p$;
  end if;
end $do$;
