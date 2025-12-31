-- 06_supplements.sql
-- Adds table for supplement (БАД) recommendations that the client can view.
-- The nutritionist writes/updates, the client reads.

create extension if not exists pgcrypto;

do $do$
begin
  -- ===== Table =====
  if to_regclass('public.client_supplement_plans') is null then
    execute $$
      create table public.client_supplement_plans (
        id uuid primary key default gen_random_uuid(),
        client_id uuid not null references auth.users(id) on delete cascade,
        nutritionist_id uuid not null references auth.users(id) on delete cascade,
        plan jsonb null,
        notes text null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    $$;
  else
    execute 'alter table public.client_supplement_plans add column if not exists plan jsonb';
    execute 'alter table public.client_supplement_plans add column if not exists notes text';
    execute 'alter table public.client_supplement_plans add column if not exists updated_at timestamptz';
  end if;

  -- ===== RLS =====
  execute 'alter table public.client_supplement_plans enable row level security';

  -- client read access
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='client_supplement_plans' and policyname='supp_select_own'
  ) then
    execute 'create policy supp_select_own on public.client_supplement_plans for select using (client_id = auth.uid())';
  end if;

  -- nutritionist access depends on link table
  if to_regclass('public.client_nutritionist_links') is not null then

    if not exists (
      select 1 from pg_policies
      where schemaname='public' and tablename='client_supplement_plans' and policyname='supp_select_linked_nutritionist'
    ) then
      execute $$
        create policy supp_select_linked_nutritionist
        on public.client_supplement_plans
        for select
        using (
          exists (
            select 1 from public.client_nutritionist_links l
            where l.client_id = client_supplement_plans.client_id
              and l.nutritionist_id = auth.uid()
              and (l.status is null or l.status in ('approved','active'))
          )
        )
      $$;
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname='public' and tablename='client_supplement_plans' and policyname='supp_insert_linked_nutritionist'
    ) then
      execute $$
        create policy supp_insert_linked_nutritionist
        on public.client_supplement_plans
        for insert
        with check (
          nutritionist_id = auth.uid()
          and exists (
            select 1 from public.client_nutritionist_links l
            where l.client_id = client_supplement_plans.client_id
              and l.nutritionist_id = auth.uid()
              and (l.status is null or l.status in ('approved','active'))
          )
        )
      $$;
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname='public' and tablename='client_supplement_plans' and policyname='supp_update_linked_nutritionist'
    ) then
      execute $$
        create policy supp_update_linked_nutritionist
        on public.client_supplement_plans
        for update
        using (
          nutritionist_id = auth.uid()
          and exists (
            select 1 from public.client_nutritionist_links l
            where l.client_id = client_supplement_plans.client_id
              and l.nutritionist_id = auth.uid()
              and (l.status is null or l.status in ('approved','active'))
          )
        )
        with check (nutritionist_id = auth.uid())
      $$;
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname='public' and tablename='client_supplement_plans' and policyname='supp_delete_linked_nutritionist'
    ) then
      execute $$
        create policy supp_delete_linked_nutritionist
        on public.client_supplement_plans
        for delete
        using (
          nutritionist_id = auth.uid()
          and exists (
            select 1 from public.client_nutritionist_links l
            where l.client_id = client_supplement_plans.client_id
              and l.nutritionist_id = auth.uid()
              and (l.status is null or l.status in ('approved','active'))
          )
        )
      $$;
    end if;

  elsif to_regclass('public.client_nutritionists') is not null then

    if not exists (
      select 1 from pg_policies
      where schemaname='public' and tablename='client_supplement_plans' and policyname='supp_select_linked_nutritionist'
    ) then
      execute $$
        create policy supp_select_linked_nutritionist
        on public.client_supplement_plans
        for select
        using (
          exists (
            select 1 from public.client_nutritionists l
            where l.client_id = client_supplement_plans.client_id
              and l.nutritionist_id = auth.uid()
          )
        )
      $$;
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname='public' and tablename='client_supplement_plans' and policyname='supp_insert_linked_nutritionist'
    ) then
      execute $$
        create policy supp_insert_linked_nutritionist
        on public.client_supplement_plans
        for insert
        with check (
          nutritionist_id = auth.uid()
          and exists (
            select 1 from public.client_nutritionists l
            where l.client_id = client_supplement_plans.client_id
              and l.nutritionist_id = auth.uid()
          )
        )
      $$;
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname='public' and tablename='client_supplement_plans' and policyname='supp_update_linked_nutritionist'
    ) then
      execute $$
        create policy supp_update_linked_nutritionist
        on public.client_supplement_plans
        for update
        using (
          nutritionist_id = auth.uid()
          and exists (
            select 1 from public.client_nutritionists l
            where l.client_id = client_supplement_plans.client_id
              and l.nutritionist_id = auth.uid()
          )
        )
        with check (nutritionist_id = auth.uid())
      $$;
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname='public' and tablename='client_supplement_plans' and policyname='supp_delete_linked_nutritionist'
    ) then
      execute $$
        create policy supp_delete_linked_nutritionist
        on public.client_supplement_plans
        for delete
        using (
          nutritionist_id = auth.uid()
          and exists (
            select 1 from public.client_nutritionists l
            where l.client_id = client_supplement_plans.client_id
              and l.nutritionist_id = auth.uid()
          )
        )
      $$;
    end if;

  end if;

end $do$;
