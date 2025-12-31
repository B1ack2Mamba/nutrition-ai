-- 07_food_diary_ai_and_notes.sql
-- Adds:
-- 1) Food diary AI analysis + nutritionist note fields on client_journal_entries
-- 2) Nutritionist note on client_lab_reports (and creates the table/policies if missing)

create extension if not exists pgcrypto;

do $do$
begin

  -- =====================
  -- 1) client_journal_entries
  -- =====================
  if to_regclass('public.client_journal_entries') is not null then
    execute 'alter table public.client_journal_entries add column if not exists food_ai_summary text';
    execute 'alter table public.client_journal_entries add column if not exists food_nutritionist_note text';
  end if;

  -- If training plan policies were not applied, add minimal nutritionist update policy (idempotent).
  if to_regclass('public.client_journal_entries') is not null then
    execute 'alter table public.client_journal_entries enable row level security';

    if to_regclass('public.client_nutritionist_links') is not null then
      if not exists (
        select 1 from pg_policies
        where schemaname='public' and tablename='client_journal_entries' and policyname='journal_update_linked_nutritionist'
      ) then
        execute $$
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
        $$;
      end if;
    elsif to_regclass('public.client_nutritionists') is not null then
      if not exists (
        select 1 from pg_policies
        where schemaname='public' and tablename='client_journal_entries' and policyname='journal_update_linked_nutritionist'
      ) then
        execute $$
          create policy journal_update_linked_nutritionist
          on public.client_journal_entries
          for update
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
  end if;


  -- =====================
  -- 2) client_lab_reports
  -- =====================
  if to_regclass('public.client_lab_reports') is null then
    execute $$
      create table public.client_lab_reports (
        id uuid primary key default gen_random_uuid(),
        client_id uuid not null references auth.users(id) on delete cascade,
        nutritionist_id uuid null references auth.users(id) on delete set null,
        title text null,
        taken_at date null,
        file_path text not null,
        file_url text null,
        ai_summary text null,
        nutritionist_note text null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    $$;
  else
    execute 'alter table public.client_lab_reports add column if not exists nutritionist_note text';
    execute 'alter table public.client_lab_reports add column if not exists updated_at timestamptz';
  end if;

  execute 'alter table public.client_lab_reports enable row level security';

  -- client: select/insert/update/delete own
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='client_lab_reports' and policyname='lab_select_own'
  ) then
    execute 'create policy lab_select_own on public.client_lab_reports for select using (client_id = auth.uid())';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='client_lab_reports' and policyname='lab_insert_own'
  ) then
    execute 'create policy lab_insert_own on public.client_lab_reports for insert with check (client_id = auth.uid())';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='client_lab_reports' and policyname='lab_update_own'
  ) then
    execute 'create policy lab_update_own on public.client_lab_reports for update using (client_id = auth.uid()) with check (client_id = auth.uid())';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='client_lab_reports' and policyname='lab_delete_own'
  ) then
    execute 'create policy lab_delete_own on public.client_lab_reports for delete using (client_id = auth.uid())';
  end if;

  -- nutritionist access depends on link table
  if to_regclass('public.client_nutritionist_links') is not null then

    if not exists (
      select 1 from pg_policies
      where schemaname='public' and tablename='client_lab_reports' and policyname='lab_select_linked_nutritionist'
    ) then
      execute $$
        create policy lab_select_linked_nutritionist
        on public.client_lab_reports
        for select
        using (
          exists (
            select 1 from public.client_nutritionist_links l
            where l.client_id = client_lab_reports.client_id
              and l.nutritionist_id = auth.uid()
              and (l.status is null or l.status in ('approved','active'))
          )
        )
      $$;
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname='public' and tablename='client_lab_reports' and policyname='lab_insert_linked_nutritionist'
    ) then
      execute $$
        create policy lab_insert_linked_nutritionist
        on public.client_lab_reports
        for insert
        with check (
          nutritionist_id = auth.uid()
          and exists (
            select 1 from public.client_nutritionist_links l
            where l.client_id = client_lab_reports.client_id
              and l.nutritionist_id = auth.uid()
              and (l.status is null or l.status in ('approved','active'))
          )
        )
      $$;
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname='public' and tablename='client_lab_reports' and policyname='lab_update_linked_nutritionist'
    ) then
      execute $$
        create policy lab_update_linked_nutritionist
        on public.client_lab_reports
        for update
        using (
          exists (
            select 1 from public.client_nutritionist_links l
            where l.client_id = client_lab_reports.client_id
              and l.nutritionist_id = auth.uid()
              and (l.status is null or l.status in ('approved','active'))
          )
        )
      $$;
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname='public' and tablename='client_lab_reports' and policyname='lab_delete_linked_nutritionist'
    ) then
      execute $$
        create policy lab_delete_linked_nutritionist
        on public.client_lab_reports
        for delete
        using (
          exists (
            select 1 from public.client_nutritionist_links l
            where l.client_id = client_lab_reports.client_id
              and l.nutritionist_id = auth.uid()
              and (l.status is null or l.status in ('approved','active'))
          )
        )
      $$;
    end if;

  elsif to_regclass('public.client_nutritionists') is not null then

    if not exists (
      select 1 from pg_policies
      where schemaname='public' and tablename='client_lab_reports' and policyname='lab_select_linked_nutritionist'
    ) then
      execute $$
        create policy lab_select_linked_nutritionist
        on public.client_lab_reports
        for select
        using (
          exists (
            select 1 from public.client_nutritionists l
            where l.client_id = client_lab_reports.client_id
              and l.nutritionist_id = auth.uid()
          )
        )
      $$;
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname='public' and tablename='client_lab_reports' and policyname='lab_insert_linked_nutritionist'
    ) then
      execute $$
        create policy lab_insert_linked_nutritionist
        on public.client_lab_reports
        for insert
        with check (
          nutritionist_id = auth.uid()
          and exists (
            select 1 from public.client_nutritionists l
            where l.client_id = client_lab_reports.client_id
              and l.nutritionist_id = auth.uid()
          )
        )
      $$;
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname='public' and tablename='client_lab_reports' and policyname='lab_update_linked_nutritionist'
    ) then
      execute $$
        create policy lab_update_linked_nutritionist
        on public.client_lab_reports
        for update
        using (
          exists (
            select 1 from public.client_nutritionists l
            where l.client_id = client_lab_reports.client_id
              and l.nutritionist_id = auth.uid()
          )
        )
      $$;
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname='public' and tablename='client_lab_reports' and policyname='lab_delete_linked_nutritionist'
    ) then
      execute $$
        create policy lab_delete_linked_nutritionist
        on public.client_lab_reports
        for delete
        using (
          exists (
            select 1 from public.client_nutritionists l
            where l.client_id = client_lab_reports.client_id
              and l.nutritionist_id = auth.uid()
          )
        )
      $$;
    end if;

  end if;

end $do$;
