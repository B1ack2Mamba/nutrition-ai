-- 03_journal_food_diary_and_intake_form.sql
-- Adds:
-- 1) client_journal_entries.food_diary (jsonb) + unique(user_id, entry_date)
-- 2) client_profiles.intake_form (jsonb) for the big embedded questionnaire
-- Also tries to create minimal RLS policies for clients and for linked nutritionists.

-- Needed for gen_random_uuid() in case the journal table needs to be created.
create extension if not exists pgcrypto;

do $do$
begin
  -- ===== Journal: ensure table exists (or just alter) =====
  if to_regclass('public.client_journal_entries') is null then
    execute $$
      create table public.client_journal_entries (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references auth.users(id) on delete cascade,
        entry_date date not null,
        weight_kg numeric null,
        energy_level int null,
        mood int null,
        notes text null,
        food_diary jsonb null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    $$;
  else
    execute 'alter table public.client_journal_entries add column if not exists food_diary jsonb';
    execute 'alter table public.client_journal_entries add column if not exists updated_at timestamptz';
  end if;

  -- unique: one entry per day per user
  begin
    execute 'create unique index if not exists client_journal_entries_user_date_uq on public.client_journal_entries (user_id, entry_date)';
  exception when others then
    -- ignore
    null;
  end;

  -- ===== Profile: intake_form jsonb =====
  if to_regclass('public.client_profiles') is not null then
    execute 'alter table public.client_profiles add column if not exists intake_form jsonb';
  end if;

  -- ===== RLS: journal =====
  execute 'alter table public.client_journal_entries enable row level security';

  -- client policies
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='client_journal_entries' and policyname='journal_select_own'
  ) then
    execute 'create policy journal_select_own on public.client_journal_entries for select using (user_id = auth.uid())';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='client_journal_entries' and policyname='journal_insert_own'
  ) then
    execute 'create policy journal_insert_own on public.client_journal_entries for insert with check (user_id = auth.uid())';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='client_journal_entries' and policyname='journal_update_own'
  ) then
    execute 'create policy journal_update_own on public.client_journal_entries for update using (user_id = auth.uid()) with check (user_id = auth.uid())';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='client_journal_entries' and policyname='journal_delete_own'
  ) then
    execute 'create policy journal_delete_own on public.client_journal_entries for delete using (user_id = auth.uid())';
  end if;

  -- nutritionist read access (if a link table exists)
  if to_regclass('public.client_nutritionist_links') is not null then
    if not exists (
      select 1 from pg_policies
      where schemaname='public' and tablename='client_journal_entries' and policyname='journal_select_linked_nutritionist'
    ) then
      execute $$
        create policy journal_select_linked_nutritionist
        on public.client_journal_entries
        for select
        using (
          exists (
            select 1 from public.client_nutritionist_links l
            where l.client_id = client_journal_entries.user_id
              and l.nutritionist_id = auth.uid()
              and (l.status is null or l.status in ('approved','active'))
          )
        )
      $$;
    end if;
  elsif to_regclass('public.client_nutritionists') is not null then
    if not exists (
      select 1 from pg_policies
      where schemaname='public' and tablename='client_journal_entries' and policyname='journal_select_linked_nutritionist'
    ) then
      execute $$
        create policy journal_select_linked_nutritionist
        on public.client_journal_entries
        for select
        using (
          exists (
            select 1 from public.client_nutritionists l
            where l.client_id = client_journal_entries.user_id
              and l.nutritionist_id = auth.uid()
          )
        )
      $$;
    end if;
  end if;

end $do$;
