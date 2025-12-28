-- 03b_fix_unique_journal_entry_per_day.sql
-- Fix for: "there is no unique or exclusion constraint matching the ON CONFLICT specification"
--
-- Your app uses upsert(..., { onConflict: "user_id,entry_date" })
-- so Postgres MUST have a UNIQUE constraint or UNIQUE index on (user_id, entry_date).

-- 1) (Optional) find duplicates
select user_id, entry_date, count(*) as cnt
from public.client_journal_entries
group by user_id, entry_date
having count(*) > 1
order by cnt desc;

-- 2) (Optional) delete duplicates (keeps the newest row per (user_id, entry_date))
--    Run this ONLY if query #1 shows duplicates.
--
-- with ranked as (
--   select ctid,
--          row_number() over (
--            partition by user_id, entry_date
--            order by updated_at desc nulls last, created_at desc nulls last
--          ) as rn
--   from public.client_journal_entries
-- )
-- delete from public.client_journal_entries t
-- using ranked r
-- where t.ctid = r.ctid and r.rn > 1;

-- 3) Create UNIQUE index (recommended)
create unique index if not exists client_journal_entries_user_date_uq
on public.client_journal_entries (user_id, entry_date);

-- Alternative (constraint form):
-- alter table public.client_journal_entries
--   add constraint client_journal_entries_user_date_unique unique (user_id, entry_date);
