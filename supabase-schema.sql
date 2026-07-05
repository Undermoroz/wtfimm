-- ═══════════════════════════════════════════════════════════════════════
--  WTFIMM?! — Supabase Schema (idempotent — безопасно запускать повторно)
--  Supabase Dashboard → SQL Editor → New query → Run
-- ═══════════════════════════════════════════════════════════════════════

-- ─── Таблицы ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS expenses (
  id          TEXT          PRIMARY KEY,
  user_id     UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month_id    TEXT          NOT NULL,
  cat_id      TEXT          NOT NULL,
  amount      BIGINT        NOT NULL,
  usd         NUMERIC(12,2),
  note        TEXT          NOT NULL DEFAULT '',
  date        DATE          NOT NULL,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS income (
  id          TEXT          PRIMARY KEY,
  user_id     UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month_id    TEXT          NOT NULL,
  amount      BIGINT        NOT NULL,
  usd         NUMERIC(12,2),
  note        TEXT          NOT NULL DEFAULT '',
  date        DATE          NOT NULL,
  rate        NUMERIC(10,2) NOT NULL DEFAULT 12900,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Долги — отдельная сущность, НЕ привязаны к месяцу.
-- repayments — история погашений: [{id, amount, date}], сумма = paid.
CREATE TABLE IF NOT EXISTS debts (
  id          TEXT          PRIMARY KEY,
  user_id     UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dir         TEXT          NOT NULL CHECK (dir IN ('owed_me', 'i_owe')),
  person      TEXT          NOT NULL DEFAULT '',
  amount      BIGINT        NOT NULL,
  usd         NUMERIC(12,2),
  rate        NUMERIC(10,2) NOT NULL DEFAULT 0,
  paid        BIGINT        NOT NULL DEFAULT 0,
  repayments  JSONB         NOT NULL DEFAULT '[]'::jsonb,
  note        TEXT          NOT NULL DEFAULT '',
  date        DATE          NOT NULL,
  due         DATE,
  closed_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Таблица debts уже существует в проде без repayments — добавляем колонку.
-- (CREATE TABLE IF NOT EXISTS не добавляет колонки в существующую таблицу.)
ALTER TABLE debts ADD COLUMN IF NOT EXISTS repayments JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS user_data (
  user_id     UUID          PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  categories  JSONB         NOT NULL DEFAULT '[]',
  settings    JSONB         NOT NULL DEFAULT '{"lang":"ru","theme":"dark"}',
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ─── Индексы ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS expenses_user_month ON expenses (user_id, month_id);
CREATE INDEX IF NOT EXISTS income_user_month   ON income   (user_id, month_id);
CREATE INDEX IF NOT EXISTS debts_user          ON debts    (user_id);

-- ─── Row Level Security ──────────────────────────────────────────────────

ALTER TABLE expenses  ENABLE ROW LEVEL SECURITY;
ALTER TABLE income    ENABLE ROW LEVEL SECURITY;
ALTER TABLE debts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_data ENABLE ROW LEVEL SECURITY;

-- Пересоздаём политики (DROP IF EXISTS убирает ошибку при повторном запуске)
DROP POLICY IF EXISTS "expenses: own rows only"  ON expenses;
DROP POLICY IF EXISTS "income: own rows only"    ON income;
DROP POLICY IF EXISTS "debts: own rows only"     ON debts;
DROP POLICY IF EXISTS "user_data: own row only"  ON user_data;

CREATE POLICY "expenses: own rows only"
  ON expenses FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "income: own rows only"
  ON income FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "debts: own rows only"
  ON debts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_data: own row only"
  ON user_data FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── Триггер: создаёт user_data при регистрации ──────────────────────────

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO user_data (user_id, categories, settings)
  VALUES (
    NEW.id,
    '[]'::jsonb,
    '{"lang":"ru","theme":"dark"}'::jsonb
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── Функция: удаление аккаунта пользователем ───────────────────────────

CREATE OR REPLACE FUNCTION delete_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  DELETE FROM public.expenses  WHERE user_id = uid;
  DELETE FROM public.income    WHERE user_id = uid;
  DELETE FROM public.debts     WHERE user_id = uid;
  DELETE FROM public.user_data WHERE user_id = uid;
  DELETE FROM auth.users       WHERE id = uid;
END;
$$;

REVOKE ALL   ON FUNCTION delete_user() FROM public;
GRANT EXECUTE ON FUNCTION delete_user() TO authenticated;

-- ─── Проверка ────────────────────────────────────────────────────────────

SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename IN ('expenses', 'income', 'debts', 'user_data')
ORDER BY tablename;
