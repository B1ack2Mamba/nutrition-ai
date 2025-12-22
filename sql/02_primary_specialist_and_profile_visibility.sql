-- Adds the "primary specialist" column and relaxes profile visibility so
-- clients can see nutritionists and nutritionists can see their clients.
--
-- Safe to run multiple times.

create extension if not exists pgcrypto;

-- 1) Client primary specialist
do $$
begin
  if to_regclass('public.client_profiles') is not null then
    execute 'alter table public.client_profiles add column if not exists selected_nutritionist_id uuid references auth.users(id)';
    execute 'create index if not exists client_profiles_selected_nutritionist_id_idx on public.client_profiles (selected_nutritionist_id)';
  end if;
end $$;

-- 2) Allow authenticated clients to see nutritionist profiles in public.profiles
do $$
begin
  if to_regclass('public.profiles') is not null then
    execute 'alter table public.profiles enable row level security';

    if not exists (
      select 1
      from pg_policies
      where schemaname = ''public''
        and tablename  = ''profiles''
        and policyname = ''profiles_select_nutritionists''
    ) then
      execute 'create policy "profiles_select_nutritionists" on public.profiles for select using ((id = auth.uid()) OR (auth.uid() is not null AND coalesce(is_nutritionist,false) = true))';
    end if;
  end if;
end $$;

-- 3) Allow nutritionists to read profiles of their linked clients
do $$
begin
  if to_regclass('public.client_profiles') is not null and to_regclass('public.client_nutritionists') is not null then
    execute 'alter table public.client_profiles enable row level security';

    if not exists (
      select 1
      from pg_policies
      where schemaname = ''public''
        and tablename  = ''client_profiles''
        and policyname = ''client_profiles_select_linked_nutritionist''
    ) then
      execute '
        create policy "client_profiles_select_linked_nutritionist"
        on public.client_profiles
        for select
        using (
          user_id = auth.uid()
          or exists (
            select 1
            from public.client_nutritionists cn
            where cn.client_id = client_profiles.user_id
              and cn.nutritionist_id = auth.uid()
          )
        )
      ';
    end if;
  end if;
end $$;

-- 4) Realtime: add chat tables to the publication (ignore if already added)
do $$
begin
  if to_regclass('public.chat_messages') is not null then
    begin
      execute 'alter publication supabase_realtime add table public.chat_messages';
    exception when duplicate_object then
      null;
    end;
  end if;

  if to_regclass('public.chat_threads') is not null then
    begin
      execute 'alter publication supabase_realtime add table public.chat_threads';
    exception when duplicate_object then
      null;
    end;
  end if;
end $$;

-- If PostgREST complains about schema cache, run this once:
--   notify pgrst, 'reload schema';
