-- Добавление заметок/обратной связи для:
-- 1) Дневника питания (client_journal_entries)
-- 2) Анализов (client_lab_reports)
--
-- Запусти это в Supabase SQL Editor.

-- ===== 1) Дневник питания =====
ALTER TABLE public.client_journal_entries
  ADD COLUMN IF NOT EXISTS nutritionist_diary_note text;

ALTER TABLE public.client_journal_entries
  ADD COLUMN IF NOT EXISTS client_diary_reply text;

-- ===== 2) Анализы (лабораторные отчёты) =====
ALTER TABLE public.client_lab_reports
  ADD COLUMN IF NOT EXISTS client_note text;

ALTER TABLE public.client_lab_reports
  ADD COLUMN IF NOT EXISTS nutritionist_note text;

-- ===== (Опционально) Политики RLS =====
-- ВНИМАНИЕ: адаптируй под свою схему/таблицу связей и уже существующие policies.
-- Ниже — базовый пример, если RLS включён и нужно разрешить обновлять только свои записи.

-- -- Клиент может обновлять только client_note в своих анализах
-- CREATE POLICY IF NOT EXISTS "client can update own lab note"
-- ON public.client_lab_reports
-- FOR UPDATE
-- USING (auth.uid() = client_id)
-- WITH CHECK (auth.uid() = client_id);

-- -- Клиент может обновлять только client_diary_reply в своём дневнике
-- CREATE POLICY IF NOT EXISTS "client can update own diary reply"
-- ON public.client_journal_entries
-- FOR UPDATE
-- USING (auth.uid() = user_id)
-- WITH CHECK (auth.uid() = user_id);

-- -- Нутрициолог может обновлять nutritionist_* поля, если есть активная связь.
-- -- Тут пример через таблицу client_nutritionist_links (проверь названия и статусы).
-- CREATE POLICY IF NOT EXISTS "nutritionist can update linked clients"
-- ON public.client_journal_entries
-- FOR UPDATE
-- USING (
--   EXISTS (
--     SELECT 1 FROM public.client_nutritionist_links l
--     WHERE l.client_id = public.client_journal_entries.user_id
--       AND l.nutritionist_id = auth.uid()
--       AND l.status IN ('approved','active')
--   )
-- )
-- WITH CHECK (
--   EXISTS (
--     SELECT 1 FROM public.client_nutritionist_links l
--     WHERE l.client_id = public.client_journal_entries.user_id
--       AND l.nutritionist_id = auth.uid()
--       AND l.status IN ('approved','active')
--   )
-- );
