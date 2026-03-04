import { useState } from 'react';
import { Copy, Check, Database, ChevronDown, ChevronRight, Download, Shield, AlertTriangle, Info } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// FULL DATABASE SQL — SpendWise
// Every section is complete, ordered, and production-ready.
// Run sections 1–9 in order in Supabase SQL Editor.
// ─────────────────────────────────────────────────────────────────────────────

const SECTIONS = [
  // ── SECTION 1 ────────────────────────────────────────────────────────────
  {
    id: 'extensions',
    label: '1. Enable Extensions',
    color: 'bg-slate-600',
    info: 'Must be run first. Enables UUID generation and optional query analytics.',
    sql: `-- ================================================================
--  STEP 1 ▸ Enable Required PostgreSQL Extensions
--  Run this FIRST before any other step.
-- ================================================================

-- UUID generation (required for all primary keys)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- pgcrypto: used by Supabase for password hashing (bcrypt)
-- Supabase Auth already uses this internally — included for reference
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Optional: Query performance analytics in Supabase dashboard
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Verify extensions loaded
SELECT name, default_version, installed_version
FROM pg_available_extensions
WHERE name IN ('uuid-ossp', 'pgcrypto', 'pg_stat_statements');
`,
  },

  // ── SECTION 2 ────────────────────────────────────────────────────────────
  {
    id: 'password_note',
    label: '2. 🔐 How Passwords Are Stored (Read This)',
    color: 'bg-violet-600',
    info: 'No SQL needed — this explains the password security model used by Supabase Auth.',
    sql: `-- ================================================================
--  STEP 2 ▸ PASSWORD SECURITY — How SpendWise Handles Passwords
-- ================================================================
--
--  ✅ Passwords are NEVER stored in plain text — EVER.
--
--  Supabase Auth uses bcrypt hashing (via pgcrypto extension) to
--  store all user passwords. This is the same algorithm used by
--  GitHub, Stripe, and most major platforms.
--
--  📦 Where passwords are stored:
--     Table  : auth.users          ← managed by Supabase Auth
--     Column : auth.users.encrypted_password
--     Format : $2a$10$<salt><hash>   (bcrypt with cost factor 10)
--
--  🔒 You CANNOT reverse a bcrypt hash.
--     Even Supabase staff cannot read your users' passwords.
--
--  🔍 To VIEW password hashes (admin only, READ-ONLY):
-- ================================================================

-- See all users and their bcrypt password hashes
-- (Only visible to service_role, NOT to anon/authenticated keys)
SELECT
  id,
  email,
  encrypted_password,           -- bcrypt hash e.g. $2a$10$...
  email_confirmed_at,
  created_at,
  last_sign_in_at,
  raw_app_meta_data->>'provider' AS provider  -- 'email', 'google', etc.
FROM auth.users
ORDER BY created_at DESC;

-- ================================================================
--  Google/Facebook OAuth users have NO password (NULL)
--  because they authenticate via Google's servers, not via
--  Supabase's password system.
-- ================================================================

-- See which users have passwords vs OAuth-only
SELECT
  email,
  CASE
    WHEN encrypted_password IS NOT NULL THEN '🔐 bcrypt hash (has password)'
    ELSE '🔗 OAuth only (Google/Facebook — no password)'
  END AS password_status,
  raw_app_meta_data->>'provider' AS auth_provider
FROM auth.users
ORDER BY created_at DESC;

-- ================================================================
--  How bcrypt works (for reference):
--
--  1. User submits password "MyPass123!"
--  2. Supabase generates a random 16-byte salt
--  3. bcrypt(salt + "MyPass123!", cost=10) → "$2a$10$abc...xyz"
--  4. Only the final hash is stored — salt is embedded inside it
--  5. On login: bcrypt.compare(input, stored_hash) → true/false
--
--  Cost factor 10 means 2^10 = 1,024 iterations.
--  A hacker with a GPU would take YEARS to brute-force one hash.
-- ================================================================
`,
  },

  // ── SECTION 3 ────────────────────────────────────────────────────────────
  {
    id: 'tables',
    label: '3. Create All Tables (includes notifications)',
    color: 'bg-indigo-600',
    info: 'Creates profiles, categories, expenses, budget_alerts tables with indexes.',
    sql: `-- ================================================================
--  STEP 3 ▸ Create All Application Tables
-- ================================================================

-- ── 3a. PROFILES ────────────────────────────────────────────────
-- One row per user. Created automatically by trigger on signup.
-- Mirrors subset of auth.users for app-level queries.
-- NOTE: Passwords live in auth.users.encrypted_password (bcrypt).
--       This table does NOT store passwords.
CREATE TABLE IF NOT EXISTS public.profiles (
  id              UUID          PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email           TEXT          NOT NULL,
  full_name       TEXT,
  avatar_url      TEXT,
  role            TEXT          NOT NULL DEFAULT 'user'
                                CHECK (role IN ('admin', 'user')),
  is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
  monthly_budget  NUMERIC(12,2) CHECK (monthly_budget >= 0),
  phone           TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_profiles_role     ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_email    ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_active   ON public.profiles(is_active);

COMMENT ON TABLE  public.profiles                IS 'App-level user profiles. Passwords are in auth.users.encrypted_password (bcrypt).';
COMMENT ON COLUMN public.profiles.role           IS 'admin = full dashboard access, user = personal expense tracker';
COMMENT ON COLUMN public.profiles.monthly_budget IS 'Optional budget cap in PHP. NULL = no limit set.';

-- ── 3b. CATEGORIES ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.categories (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL UNIQUE,
  icon        TEXT,                           -- emoji e.g. 🍔
  color       TEXT        DEFAULT '#6366F1',  -- hex color
  created_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_categories_name ON public.categories(name);
COMMENT ON TABLE public.categories IS 'Expense categories (Food, Transportation, etc.) managed by admins.';

-- ── 3c. EXPENSES ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.expenses (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID          NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category_id  UUID          NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
  item_name    TEXT          NOT NULL CHECK (char_length(item_name) >= 1),
  quantity     NUMERIC(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  price        NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  -- ✅ Auto-computed: total = quantity × price (stored, always accurate)
  total        NUMERIC(12,2) GENERATED ALWAYS AS (quantity * price) STORED,
  date         DATE          NOT NULL DEFAULT CURRENT_DATE,
  notes        TEXT,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_user_id      ON public.expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_category_id  ON public.expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date         ON public.expenses(date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_user_date    ON public.expenses(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_created_at   ON public.expenses(created_at DESC);

COMMENT ON COLUMN public.expenses.total IS 'Auto-computed: quantity × price. Cannot be set manually.';

-- ── 3d. BUDGET_ALERTS ────────────────────────────────────────────
-- Stores history of budget warning events (auto-generated)
CREATE TABLE IF NOT EXISTS public.budget_alerts (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID          NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  month       TEXT          NOT NULL,            -- e.g. '2024-06'
  budget      NUMERIC(12,2) NOT NULL,
  spent       NUMERIC(12,2) NOT NULL,
  pct         NUMERIC(5,2)  NOT NULL,            -- e.g. 85.50 means 85.5%
  alert_type  TEXT          NOT NULL DEFAULT 'warning'
              CHECK (alert_type IN ('warning', 'exceeded')),
  dismissed   BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  -- One alert per user per month per type
  UNIQUE (user_id, month, alert_type)
);

CREATE INDEX IF NOT EXISTS idx_budget_alerts_user  ON public.budget_alerts(user_id, month);

-- ── 3e. NOTIFICATIONS ─────────────────────────────────────────────
-- Admin-to-user notifications (manual messages from admin panel)
CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  message     TEXT        NOT NULL,
  type        TEXT        NOT NULL DEFAULT 'info'
              CHECK (type IN ('info', 'warning', 'danger', 'success')),
  is_read     BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user    ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(user_id, is_read);

COMMENT ON TABLE public.notifications IS 'Admin-to-user notifications. Admins insert here; users read their own.';

-- ── 3f. Verify tables created ────────────────────────────────────
SELECT
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = t.table_name) AS column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
ORDER BY table_name;
`,
  },

  // ── SECTION 4 ────────────────────────────────────────────────────────────
  {
    id: 'rls',
    label: '4. Row Level Security (RLS)',
    color: 'bg-green-600',
    info: 'Locks down every table so users can only see their own data. Admins see everything.',
    sql: `-- ================================================================
--  STEP 4 ▸ Row Level Security (RLS)
--  This is the most important security layer.
--  Without RLS, any authenticated user could read ALL data.
--
--  SECURITY NOTES:
--  • set_updated_at() uses SET search_path = public (prevents injection)
--  • profiles INSERT policy uses WITH CHECK (auth.uid() = id) — NOT (true)
--    The handle_new_user() trigger is SECURITY DEFINER so it bypasses RLS;
--    no permissive WITH CHECK (true) needed.
-- ================================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_alerts  ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first (safe re-run)
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies
           WHERE schemaname = 'public'
  LOOP
    EXECUTE FORMAT('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- ════════════════════════════════════════════════════════════════
--  PROFILES policies
-- ════════════════════════════════════════════════════════════════

-- Helper: is the current user an admin?
-- Used inline in policies for performance
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Users read their own profile; admins read all
CREATE POLICY "profiles_select"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id OR public.is_admin());

-- Users update their own profile (cannot change their own role)
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role = (SELECT role FROM public.profiles WHERE id = auth.uid()));

-- Admins can update any profile (including role changes)
CREATE POLICY "profiles_update_admin"
  ON public.profiles FOR UPDATE
  USING (public.is_admin());

-- INSERT: Users can only insert their OWN profile row (auth.uid() must match id).
-- The handle_new_user() trigger runs as SECURITY DEFINER (service_role),
-- which bypasses RLS entirely — so it does NOT need this policy.
-- This policy only applies to direct authenticated inserts (upsert from app).
CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Only admins can delete profiles
CREATE POLICY "profiles_delete_admin"
  ON public.profiles FOR DELETE
  USING (public.is_admin());

-- ════════════════════════════════════════════════════════════════
--  CATEGORIES policies
-- ════════════════════════════════════════════════════════════════

-- All authenticated users can view categories
CREATE POLICY "categories_select"
  ON public.categories FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can create/edit/delete categories
CREATE POLICY "categories_insert_admin"
  ON public.categories FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "categories_update_admin"
  ON public.categories FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "categories_delete_admin"
  ON public.categories FOR DELETE
  USING (public.is_admin());

-- ════════════════════════════════════════════════════════════════
--  EXPENSES policies
-- ════════════════════════════════════════════════════════════════

-- Users manage their own expenses
CREATE POLICY "expenses_select_own"
  ON public.expenses FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "expenses_insert_own"
  ON public.expenses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "expenses_update_own"
  ON public.expenses FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "expenses_delete_own"
  ON public.expenses FOR DELETE
  USING (auth.uid() = user_id OR public.is_admin());

-- ════════════════════════════════════════════════════════════════
--  BUDGET_ALERTS policies
-- ════════════════════════════════════════════════════════════════

CREATE POLICY "alerts_select"
  ON public.budget_alerts FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "alerts_insert"
  ON public.budget_alerts FOR INSERT
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "alerts_update"
  ON public.budget_alerts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "alerts_delete"
  ON public.budget_alerts FOR DELETE
  USING (auth.uid() = user_id OR public.is_admin());

-- ════════════════════════════════════════════════════════════════
--  NOTIFICATIONS policies
-- ════════════════════════════════════════════════════════════════

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can read their own notifications; admins can read all
CREATE POLICY "notifications_select"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

-- Only admins can create notifications (send to users)
CREATE POLICY "notifications_insert_admin"
  ON public.notifications FOR INSERT
  WITH CHECK (public.is_admin());

-- Users can mark their own as read; admins can update any
CREATE POLICY "notifications_update"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id OR public.is_admin());

-- Users can dismiss their own; admins can delete any
CREATE POLICY "notifications_delete"
  ON public.notifications FOR DELETE
  USING (auth.uid() = user_id OR public.is_admin());

-- ── Verify RLS is enabled ────────────────────────────────────────
SELECT schemaname, tablename, rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
`,
  },

  // ── SECTION 5 ────────────────────────────────────────────────────────────
  {
    id: 'functions',
    label: '5. Functions & Triggers',
    color: 'bg-blue-600',
    info: 'Auto-creates user profile on signup, auto-updates timestamps, provides analytics queries.',
    sql: `-- ================================================================
--  STEP 5 ▸ Functions & Triggers
-- ================================================================

-- ── 5a. Auto-create profile row when a new user signs up ─────────
-- Fires after every INSERT into auth.users (email, Google, etc.)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    avatar_url,
    role
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      SPLIT_PART(COALESCE(NEW.email,''), '@', 1)
    ),
    COALESCE(
      NEW.raw_user_meta_data->>'avatar_url',
      NEW.raw_user_meta_data->>'picture'
    ),
    'user'   -- always start as 'user'; promote to 'admin' manually
  )
  ON CONFLICT (id) DO UPDATE
    SET
      email      = EXCLUDED.email,
      full_name  = COALESCE(EXCLUDED.full_name, profiles.full_name),
      avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url),
      updated_at = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ── 5b. Auto-update updated_at on row changes ────────────────────
-- FIX: SET search_path = public prevents search_path injection attacks
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_expenses_updated_at ON public.expenses;
CREATE TRIGGER set_expenses_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 5c. Monthly spending summary for one user ────────────────────
-- Usage: SELECT * FROM public.monthly_summary('user-uuid', '2024-06-01');
CREATE OR REPLACE FUNCTION public.monthly_summary(
  p_user_id  UUID,
  p_month    DATE DEFAULT DATE_TRUNC('month', CURRENT_DATE)
)
RETURNS TABLE (
  category_name   TEXT,
  category_icon   TEXT,
  category_color  TEXT,
  total_spent     NUMERIC,
  num_items       BIGINT,
  avg_per_item    NUMERIC
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.name                  AS category_name,
    c.icon                  AS category_icon,
    c.color                 AS category_color,
    ROUND(SUM(e.total), 2)  AS total_spent,
    COUNT(*)                AS num_items,
    ROUND(AVG(e.total), 2)  AS avg_per_item
  FROM public.expenses e
  JOIN public.categories c ON c.id = e.category_id
  WHERE
    e.user_id = p_user_id
    AND DATE_TRUNC('month', e.date::TIMESTAMPTZ)
        = DATE_TRUNC('month', p_month::TIMESTAMPTZ)
  GROUP BY c.name, c.icon, c.color
  ORDER BY total_spent DESC;
$$;

-- ── 5d. Daily spending for a user (for weekly/daily charts) ──────
-- Usage: SELECT * FROM public.daily_spending('user-uuid', '2024-06-01', '2024-06-30');
CREATE OR REPLACE FUNCTION public.daily_spending(
  p_user_id   UUID,
  p_from      DATE DEFAULT DATE_TRUNC('month', CURRENT_DATE),
  p_to        DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  day         DATE,
  total_spent NUMERIC,
  num_items   BIGINT
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.date                  AS day,
    ROUND(SUM(e.total), 2)  AS total_spent,
    COUNT(*)                AS num_items
  FROM public.expenses e
  WHERE
    e.user_id = p_user_id
    AND e.date BETWEEN p_from AND p_to
  GROUP BY e.date
  ORDER BY e.date;
$$;

-- ── 5e. System-wide admin analytics ──────────────────────────────
-- Usage: SELECT * FROM public.admin_overview();
CREATE OR REPLACE FUNCTION public.admin_overview()
RETURNS TABLE (
  total_users         BIGINT,
  active_users        BIGINT,
  users_with_budget   BIGINT,
  total_expenses_php  NUMERIC,
  month_expenses_php  NUMERIC,
  total_transactions  BIGINT,
  top_category        TEXT,
  over_budget_users   BIGINT
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT COUNT(*)                    FROM public.profiles)::BIGINT              AS total_users,
    (SELECT COUNT(*) FROM public.profiles WHERE is_active = TRUE)::BIGINT          AS active_users,
    (SELECT COUNT(*) FROM public.profiles WHERE monthly_budget IS NOT NULL)::BIGINT AS users_with_budget,
    (SELECT COALESCE(ROUND(SUM(total),2), 0) FROM public.expenses)::NUMERIC        AS total_expenses_php,
    (SELECT COALESCE(ROUND(SUM(total),2), 0) FROM public.expenses
      WHERE DATE_TRUNC('month', date::TIMESTAMPTZ) = DATE_TRUNC('month', NOW()))::NUMERIC AS month_expenses_php,
    (SELECT COUNT(*) FROM public.expenses)::BIGINT                                  AS total_transactions,
    (SELECT c.name FROM public.categories c
      JOIN public.expenses e ON e.category_id = c.id
      GROUP BY c.name ORDER BY SUM(e.total) DESC LIMIT 1)                          AS top_category,
    (SELECT COUNT(*) FROM public.profiles p
      WHERE p.monthly_budget IS NOT NULL
        AND (
          SELECT COALESCE(SUM(e.total), 0) FROM public.expenses e
          WHERE e.user_id = p.id
            AND DATE_TRUNC('month', e.date::TIMESTAMPTZ) = DATE_TRUNC('month', NOW())
        ) > p.monthly_budget
    )::BIGINT                                                                        AS over_budget_users;
$$;

-- ── 5f. Verify triggers and functions ────────────────────────────
SELECT trigger_name, event_object_table, action_timing, event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public' OR event_object_schema = 'auth'
ORDER BY trigger_name;
`,
  },

  // ── SECTION 6 ────────────────────────────────────────────────────────────
  {
    id: 'seed',
    label: '6. Seed Default Categories',
    color: 'bg-amber-500',
    info: 'Inserts the 8 default expense categories. Safe to run multiple times.',
    sql: `-- ================================================================
--  STEP 6 ▸ Insert Default Expense Categories
--  ON CONFLICT DO NOTHING = safe to re-run any time
-- ================================================================

INSERT INTO public.categories (name, icon, color) VALUES
  ('Food',            '🍔', '#F59E0B'),
  ('Transportation',  '🚌', '#3B82F6'),
  ('Utilities',       '💡', '#10B981'),
  ('School Supplies', '📚', '#8B5CF6'),
  ('Healthcare',      '💊', '#EF4444'),
  ('Entertainment',   '🎬', '#EC4899'),
  ('Clothing',        '👕', '#14B8A6'),
  ('Others',          '📦', '#6B7280')
ON CONFLICT (name) DO NOTHING;

-- Verify
SELECT id, name, icon, color FROM public.categories ORDER BY name;
`,
  },

  // ── SECTION 7 ────────────────────────────────────────────────────────────
  {
    id: 'admin',
    label: '7. Promote Yourself to Admin',
    color: 'bg-purple-600',
    info: 'Run AFTER you have registered your account. Replace the email with yours.',
    sql: `-- ================================================================
--  STEP 7 ▸ Promote Your Account to Admin
--
--  IMPORTANT:
--  1. First register your account normally in the app
--  2. Replace 'your-email@example.com' with your actual email
--  3. Run this query
--  4. Sign out and sign back in — you'll land on the Admin Dashboard
-- ================================================================

UPDATE public.profiles
SET role = 'admin'
WHERE email = 'your-email@example.com';   -- ← CHANGE THIS

-- Verify it worked (you should see role = 'admin')
SELECT
  id,
  email,
  full_name,
  role,
  is_active,
  created_at
FROM public.profiles
WHERE role = 'admin';

-- ================================================================
--  TROUBLESHOOTING:
--  If the UPDATE returns 0 rows, your profile wasn't created yet.
--  This happens if the trigger didn't fire. Fix:
-- ================================================================

-- Manually insert your profile (only if the UPDATE above returned 0 rows)
-- First get your auth.users ID:
SELECT id, email FROM auth.users WHERE email = 'your-email@example.com';

-- Then insert (replace 'PUT-UUID-HERE' with the ID from above):
-- INSERT INTO public.profiles (id, email, full_name, role)
-- VALUES ('PUT-UUID-HERE', 'your-email@example.com', 'Your Name', 'admin')
-- ON CONFLICT (id) DO UPDATE SET role = 'admin';
`,
  },

  // ── SECTION 8 ────────────────────────────────────────────────────────────
  {
    id: 'realtime',
    label: '8. Enable Realtime (Online Presence)',
    color: 'bg-pink-600',
    info: 'Allows the live "X users online" counter to work in the admin dashboard.',
    sql: `-- ================================================================
--  STEP 8 ▸ Enable Supabase Realtime
-- ================================================================

-- Add tables to the realtime publication
-- This lets the frontend subscribe to live changes
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.expenses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.categories;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- ================================================================
--  ALSO do this in the Supabase Dashboard UI:
--  1. Go to Database → Replication
--  2. Find "supabase_realtime" publication
--  3. Toggle ON: profiles, expenses, categories
--  4. Go to Settings → API → make sure Realtime is ENABLED
-- ================================================================

-- Verify which tables are in the publication
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;
`,
  },

  // ── SECTION 9 ────────────────────────────────────────────────────────────
  {
    id: 'verify',
    label: '9. Verify Everything Works',
    color: 'bg-teal-600',
    info: 'Run these checks after completing all previous steps to confirm setup is correct.',
    sql: `-- ================================================================
--  STEP 9 ▸ Full Verification Checklist
--  Run each block to confirm your database is fully set up.
-- ================================================================

-- ① Check all 4 tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('profiles','categories','expenses','budget_alerts')
ORDER BY table_name;
-- Expected: 4 rows

-- ② Check RLS is enabled on all tables
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
-- Expected: all 4 tables show rowsecurity = true

-- ③ Check policies exist (and confirm NO overly-permissive WITH CHECK (true))
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
-- Expected: ~15 policies across 4 tables
-- profiles_insert_own  → with_check should be "(auth.uid() = id)"  NOT "true"
-- No policy should show with_check = "true" for INSERT/UPDATE/DELETE

-- ④ Check triggers exist
SELECT trigger_name, event_object_table, action_timing
FROM information_schema.triggers
WHERE trigger_schema = 'public' OR event_object_schema = 'auth'
ORDER BY trigger_name;
-- Expected: on_auth_user_created, set_profiles_updated_at, set_expenses_updated_at

-- ⑤ Check categories were seeded
SELECT name, icon, color FROM public.categories ORDER BY name;
-- Expected: 8 rows (Food, Transportation, Utilities, etc.)

-- ⑥ Check admin accounts
SELECT id, email, role, is_active, created_at
FROM public.profiles
WHERE role = 'admin';
-- Expected: at least 1 row (your account)

-- ⑦ Test admin_overview function
SELECT * FROM public.admin_overview();
-- Expected: 1 row with counts (most will be 0 on fresh install)

-- ⑦b. Verify set_updated_at has immutable search_path (no mutable search_path warning)
SELECT proname, prosecdef, proconfig
FROM pg_proc
WHERE proname IN ('set_updated_at', 'handle_new_user', 'is_admin', 'monthly_summary', 'daily_spending', 'admin_overview')
  AND pronamespace = 'public'::regnamespace;
-- Expected: proconfig should contain 'search_path=public' for all functions
-- prosecdef = true means SECURITY DEFINER (service_role privileges)

-- ⑧ Check password hashes (bcrypt)
SELECT
  email,
  LEFT(encrypted_password, 7) AS hash_prefix,   -- shows '$2a$10' (bcrypt)
  CASE
    WHEN encrypted_password IS NOT NULL THEN '✅ bcrypt hashed'
    ELSE '🔗 OAuth (no password)'
  END AS password_status
FROM auth.users
ORDER BY created_at DESC;
-- Expected: email users show '$2a$10$...', Google users show NULL

-- ⑨ Check realtime publication
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime';
-- Expected: profiles, expenses, categories
`,
  },

  // ── SECTION 10 ───────────────────────────────────────────────────────────
  {
    id: 'useful_queries',
    label: '10. Useful Admin Queries',
    color: 'bg-cyan-600',
    info: 'Handy SQL queries you can run any time to inspect data, manage users, etc.',
    sql: `-- ================================================================
--  USEFUL ADMIN QUERIES
--  These are safe SELECT / UPDATE queries for day-to-day admin work.
-- ================================================================

-- ── List all users with spending summary ─────────────────────────
SELECT
  p.email,
  p.full_name,
  p.role,
  p.is_active,
  p.monthly_budget,
  COUNT(e.id)                     AS total_transactions,
  COALESCE(ROUND(SUM(e.total),2), 0) AS total_spent,
  p.created_at::DATE              AS joined
FROM public.profiles p
LEFT JOIN public.expenses e ON e.user_id = p.id
GROUP BY p.id, p.email, p.full_name, p.role, p.is_active, p.monthly_budget, p.created_at
ORDER BY total_spent DESC;

-- ── Find users who exceeded their budget this month ──────────────
SELECT
  p.email,
  p.full_name,
  p.monthly_budget,
  ROUND(SUM(e.total), 2)          AS month_spent,
  ROUND(SUM(e.total) - p.monthly_budget, 2) AS over_by
FROM public.profiles p
JOIN public.expenses e ON e.user_id = p.id
WHERE
  p.monthly_budget IS NOT NULL
  AND DATE_TRUNC('month', e.date::TIMESTAMPTZ) = DATE_TRUNC('month', NOW())
GROUP BY p.id, p.email, p.full_name, p.monthly_budget
HAVING SUM(e.total) > p.monthly_budget
ORDER BY over_by DESC;

-- ── Monthly system-wide totals (last 12 months) ──────────────────
SELECT
  TO_CHAR(DATE_TRUNC('month', date::TIMESTAMPTZ), 'YYYY-MM') AS month,
  COUNT(*)                  AS transactions,
  COUNT(DISTINCT user_id)   AS unique_users,
  ROUND(SUM(total), 2)      AS total_php
FROM public.expenses
WHERE date >= (CURRENT_DATE - INTERVAL '12 months')
GROUP BY DATE_TRUNC('month', date::TIMESTAMPTZ)
ORDER BY month DESC;

-- ── Top 10 biggest single expenses ever ──────────────────────────
SELECT
  e.date,
  p.email,
  e.item_name,
  c.name  AS category,
  e.quantity,
  e.price,
  e.total
FROM public.expenses e
JOIN public.profiles   p ON p.id = e.user_id
JOIN public.categories c ON c.id = e.category_id
ORDER BY e.total DESC
LIMIT 10;

-- ── Deactivate a user account ────────────────────────────────────
-- UPDATE public.profiles SET is_active = FALSE WHERE email = 'user@example.com';

-- ── Reactivate a user account ────────────────────────────────────
-- UPDATE public.profiles SET is_active = TRUE WHERE email = 'user@example.com';

-- ── Set a user's monthly budget ──────────────────────────────────
-- UPDATE public.profiles SET monthly_budget = 5000 WHERE email = 'user@example.com';

-- ── Delete all expenses for a user (with confirmation) ───────────
-- DELETE FROM public.expenses WHERE user_id = (
--   SELECT id FROM public.profiles WHERE email = 'user@example.com'
-- );

-- ── Soft-list passwords (bcrypt format) ──────────────────────────
SELECT
  u.email,
  u.encrypted_password,
  u.email_confirmed_at IS NOT NULL AS email_confirmed,
  u.last_sign_in_at,
  u.raw_app_meta_data->>'provider' AS provider
FROM auth.users u
ORDER BY u.created_at DESC;
`,
  },

  // ── SECTION MIGRATION ─────────────────────────────────────────────────────
  {
    id: 'migration_fix',
    label: '🔧 FIX: "Failed to Save" Expense Error',
    color: 'bg-orange-500',
    info: 'Run this if adding expenses fails. Fixes the total column to be auto-computed (GENERATED).',
    sql: `-- ================================================================
--  🔧 FIX: "Failed to save" / "column total can only be updated to DEFAULT"
--
--  CAUSE: The 'total' column in your expenses table is either:
--    a) A regular column (old schema) that the app is no longer sending
--    b) A GENERATED column that the app was incorrectly trying to INSERT
--
--  THE FIX: Make total a proper GENERATED ALWAYS AS column so PostgreSQL
--  computes it automatically from quantity × price.
--  You never need to send 'total' from the app — it's automatic.
-- ================================================================

-- STEP A: Check current state of the total column
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default,
  is_generated,       -- 'ALWAYS' means it's computed
  generation_expression
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'expenses'
  AND column_name  = 'total';
-- If is_generated = 'ALWAYS' → your column is already correct ✅
-- If is_generated = 'NEVER'  → run STEP B below to fix it

-- ----------------------------------------------------------------
-- STEP B: Fix the total column (drop + re-add as GENERATED)
-- Run this if STEP A shows is_generated = 'NEVER'
-- ----------------------------------------------------------------

-- 1. Drop the old plain 'total' column
ALTER TABLE public.expenses DROP COLUMN IF EXISTS total;

-- 2. Re-add it as a GENERATED ALWAYS column (auto-computed)
ALTER TABLE public.expenses
  ADD COLUMN total NUMERIC(12,2)
  GENERATED ALWAYS AS (quantity * price) STORED;

-- 3. Verify the fix
SELECT
  column_name,
  is_generated,
  generation_expression
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'expenses'
  AND column_name  = 'total';
-- Expected: is_generated = 'ALWAYS', generation_expression = '(quantity * price)'

-- ----------------------------------------------------------------
-- STEP C: Also confirm expenses table has all required columns
-- ----------------------------------------------------------------
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'expenses'
ORDER BY ordinal_position;
-- Expected columns: id, user_id, category_id, item_name,
--                   quantity, price, total, date, notes,
--                   created_at, updated_at

-- ================================================================
--  After running this fix:
--  1. Refresh the app (hard reload: Ctrl+Shift+R)
--  2. Try adding an expense — it should save instantly ✅
--  3. The 'total' field is now auto-computed as quantity × price
--     You don't need to enter it manually anywhere.
-- ================================================================
`,
  },

  // ── SECTION RESET ─────────────────────────────────────────────────────────
  {
    id: 'reset',
    label: '🗑️ RESET — Drop Everything (Danger!)',
    color: 'bg-red-600',
    info: 'Drops ALL SpendWise tables and functions. Only use for a completely fresh start.',
    sql: `-- ================================================================
--  ⚠️  DANGER ZONE — FULL DATABASE RESET
--  This deletes ALL SpendWise data permanently.
--  Auth users in auth.users are NOT deleted by this script.
--  Only run if you want to start completely fresh!
-- ================================================================

-- Step 1: Drop triggers
DROP TRIGGER IF EXISTS on_auth_user_created       ON auth.users;
DROP TRIGGER IF EXISTS set_profiles_updated_at    ON public.profiles;
DROP TRIGGER IF EXISTS set_expenses_updated_at    ON public.expenses;

-- Step 2: Drop functions
DROP FUNCTION IF EXISTS public.handle_new_user()        CASCADE;
DROP FUNCTION IF EXISTS public.set_updated_at()         CASCADE;
DROP FUNCTION IF EXISTS public.is_admin()               CASCADE;
DROP FUNCTION IF EXISTS public.monthly_summary(UUID, DATE) CASCADE;
DROP FUNCTION IF EXISTS public.daily_spending(UUID, DATE, DATE) CASCADE;
DROP FUNCTION IF EXISTS public.admin_overview()         CASCADE;

-- Step 3: Drop tables (CASCADE removes all policies, indexes, constraints)
DROP TABLE IF EXISTS public.budget_alerts  CASCADE;
DROP TABLE IF EXISTS public.expenses       CASCADE;
DROP TABLE IF EXISTS public.categories     CASCADE;
DROP TABLE IF EXISTS public.profiles       CASCADE;

-- Step 4: Confirm everything is gone
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public';
-- Expected: 0 rows (empty result)

-- ================================================================
--  After reset, run steps 1–9 again in order to rebuild.
-- ================================================================
`,
  },
];

const FULL_SQL = SECTIONS.map(s => s.sql).join('\n');

// ─────────────────────────────────────────────────────────────────────────────

function CopyButton({ code, label = 'Copy' }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors select-none"
    >
      {copied
        ? <><Check className="w-3 h-3 text-green-400" />Copied!</>
        : <><Copy className="w-3 h-3" />{label}</>
      }
    </button>
  );
}

function Section({ section, index }: { section: typeof SECTIONS[0]; index: number }) {
  const [open, setOpen] = useState(false);
  const isDanger   = section.id === 'reset';
  const isPassword = section.id === 'password_note';

  return (
    <div className={`rounded-2xl overflow-hidden border shadow-sm ${
      isDanger   ? 'border-red-200'    :
      isPassword ? 'border-violet-200' :
      'border-gray-200'
    }`}>
      {/* Header row */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center gap-3 p-4 text-left transition-colors ${
          isDanger   ? 'bg-red-50 hover:bg-red-100'       :
          isPassword ? 'bg-violet-50 hover:bg-violet-100' :
          'bg-white hover:bg-gray-50'
        }`}
      >
        <div className={`w-8 h-8 rounded-xl ${section.color} flex items-center justify-center flex-shrink-0 text-white font-bold text-xs`}>
          {isDanger ? <AlertTriangle className="w-4 h-4" /> : index + 1}
        </div>

        <div className="flex-1 min-w-0">
          <p className={`font-semibold text-sm ${
            isDanger   ? 'text-red-700'    :
            isPassword ? 'text-violet-700' :
            'text-gray-800'
          }`}>
            {section.label}
          </p>
          <p className={`text-xs mt-0.5 truncate ${
            isDanger   ? 'text-red-500'    :
            isPassword ? 'text-violet-500' :
            'text-gray-400'
          }`}>
            {section.info}
          </p>
        </div>

        {open
          ? <ChevronDown  className="w-4 h-4 text-gray-400 flex-shrink-0" />
          : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
        }
      </button>

      {/* SQL body */}
      {open && (
        <div className="bg-gray-950 border-t border-gray-800">
          <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-gray-800">
            <span className="text-xs text-gray-500 font-mono uppercase tracking-wide">
              {isPassword ? 'SQL + Comments' : 'PostgreSQL'}
            </span>
            <CopyButton code={section.sql} />
          </div>
          <pre className="text-green-300 text-xs font-mono px-4 py-4 overflow-x-auto max-h-[28rem] overflow-y-auto whitespace-pre leading-relaxed">
            <code>{section.sql}</code>
          </pre>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function FullDatabaseSQL() {
  const downloadSQL = () => {
    const blob = new Blob([FULL_SQL], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'spendwise-full-schema.sql';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 pb-8">

      {/* ── Header ── */}
      <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Database className="w-6 h-6 text-green-400" />
              <h2 className="text-xl font-bold">Full Database SQL Schema</h2>
              <span className="bg-green-500/20 text-green-300 text-xs px-2 py-0.5 rounded-full border border-green-500/30 font-medium">
                v1.0 — Production Ready
              </span>
            </div>
            <p className="text-gray-300 text-sm max-w-2xl leading-relaxed">
              Complete, production-ready SQL for SpendWise. Run sections{' '}
              <strong className="text-white">1–9 in order</strong> in your Supabase SQL Editor.
              Section 2 explains password hashing — <strong className="text-violet-300">no SQL needed</strong> for that one.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={downloadSQL}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shadow"
            >
              <Download className="w-4 h-4" />
              Download .sql File
            </button>
            <CopyButton code={FULL_SQL} label="Copy All SQL" />
          </div>
        </div>
      </div>

      {/* ── Security Fixes Banner ── */}
      <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold text-emerald-800 text-sm mb-2">✅ 2 Supabase Security Advisor Issues — Fixed in This SQL</p>
            <div className="space-y-2">
              <div className="bg-white border border-emerald-200 rounded-xl p-3">
                <p className="text-xs font-semibold text-red-600 mb-1">
                  ❌ BEFORE: <code className="bg-red-50 px-1 rounded">Function public.set_updated_at has a role mutable search_path</code>
                </p>
                <p className="text-xs text-emerald-700">
                  ✅ FIXED in <strong>Step 5</strong> — Added <code className="bg-emerald-100 px-1 rounded font-mono">SECURITY DEFINER SET search_path = public</code> to <code className="bg-emerald-100 px-1 rounded font-mono">set_updated_at()</code>. Prevents search_path injection attacks.
                </p>
              </div>
              <div className="bg-white border border-emerald-200 rounded-xl p-3">
                <p className="text-xs font-semibold text-red-600 mb-1">
                  ❌ BEFORE: <code className="bg-red-50 px-1 rounded">profiles INSERT policy allows unrestricted access (WITH CHECK always true)</code>
                </p>
                <p className="text-xs text-emerald-700">
                  ✅ FIXED in <strong>Step 4</strong> — Replaced <code className="bg-emerald-100 px-1 rounded font-mono">profiles_insert_trigger (WITH CHECK true)</code> with <code className="bg-emerald-100 px-1 rounded font-mono">profiles_insert_own (WITH CHECK auth.uid() = id)</code>. The trigger uses <code className="bg-emerald-100 px-1 rounded font-mono">SECURITY DEFINER</code> so it bypasses RLS safely without needing <code className="bg-emerald-100 px-1 rounded font-mono">WITH CHECK (true)</code>.
                </p>
              </div>
            </div>
            <p className="text-xs text-emerald-600 mt-2 font-medium">
              💡 After running Steps 4 & 5, go to Supabase → <strong>Security Advisor</strong> and click <strong>Refresh</strong> — both warnings will be gone.
            </p>
          </div>
        </div>
      </div>

      {/* ── Password security callout ── */}
      <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4 flex gap-3">
        <Shield className="w-5 h-5 text-violet-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-violet-800 text-sm">🔐 Passwords Are bcrypt Hashed — Always</p>
          <p className="text-violet-700 text-xs mt-1 leading-relaxed">
            SpendWise uses Supabase Auth which stores all passwords as{' '}
            <code className="bg-violet-100 px-1 rounded font-mono">bcrypt</code> hashes
            (e.g. <code className="bg-violet-100 px-1 rounded font-mono">$2a$10$…</code>) in{' '}
            <code className="bg-violet-100 px-1 rounded font-mono">auth.users.encrypted_password</code>.
            Plain-text passwords are <strong>never stored anywhere</strong>.
            Google OAuth users have <code className="bg-violet-100 px-1 rounded font-mono">NULL</code> in
            that column — they authenticate via Google's servers. See Section 2 for full details.
          </p>
        </div>
      </div>

      {/* ── How to run banner ── */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex gap-3">
        <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800">
          <strong>How to run:</strong> Go to your{' '}
          <a href="https://supabase.com" target="_blank" rel="noreferrer" className="underline font-semibold">
            Supabase Dashboard
          </a>{' '}
          → <strong>SQL Editor</strong> → <strong>New Query</strong> → paste a section → click{' '}
          <strong>Run (F5)</strong>. Run sections <strong>1 → 9</strong> in order.
          The Reset section is only for starting over completely.
        </div>
      </div>

      {/* ── Quick order pills ── */}
      <div className="flex flex-wrap gap-2">
        {SECTIONS.filter(s => s.id !== 'reset').map((s, i) => (
          <span
            key={s.id}
            className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-full px-3 py-1 text-xs font-medium text-gray-700 shadow-sm"
          >
            <span className={`w-4 h-4 rounded-full ${s.color} flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0`}>
              {i + 1}
            </span>
            {s.label.replace(/^\d+\.\s*/, '').replace(/🔐\s*/, '')}
          </span>
        ))}
      </div>

      {/* ── All sections ── */}
      {SECTIONS.map((section, i) => (
        <Section key={section.id} section={section} index={i} />
      ))}

      {/* ── Table reference ── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">📊 Table Reference</h3>
          <p className="text-xs text-gray-400 mt-0.5">All 4 public tables — passwords are NOT stored here</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Table', 'Purpose', 'Key Columns', 'Passwords?', 'RLS'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-gray-500 font-semibold text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {[
                {
                  table:    'profiles',
                  purpose:  'User accounts, roles, budgets',
                  cols:     'id, email, full_name, role, is_active, monthly_budget',
                  pw:       '❌ No — see auth.users',
                  rls:      '✅ Users own, Admins all',
                },
                {
                  table:    'auth.users',
                  purpose:  'Supabase Auth — managed automatically',
                  cols:     'id, email, encrypted_password (bcrypt), raw_user_meta_data',
                  pw:       '✅ bcrypt hash ($2a$10$...)',
                  rls:      '🔒 Supabase managed',
                },
                {
                  table:    'categories',
                  purpose:  'Expense categories (admin-managed)',
                  cols:     'id, name, icon, color, created_by',
                  pw:       '❌ N/A',
                  rls:      '✅ Read: all auth, Write: admin',
                },
                {
                  table:    'expenses',
                  purpose:  'All expense records with auto total',
                  cols:     'id, user_id, category_id, item_name, quantity, price, total (computed), date',
                  pw:       '❌ N/A',
                  rls:      '✅ Users own, Admins read-all',
                },
                {
                  table:    'budget_alerts',
                  purpose:  'Auto budget warning history',
                  cols:     'id, user_id, month, budget, spent, pct, alert_type, dismissed',
                  pw:       '❌ N/A',
                  rls:      '✅ Users own, Admins read-all',
                },
                {
                  table:    'notifications',
                  purpose:  'Admin-to-user manual notifications',
                  cols:     'id, user_id, title, message, type, is_read, created_at',
                  pw:       '❌ N/A',
                  rls:      '✅ Users read own, Admin write-all',
                },
              ].map(row => (
                <tr key={row.table} className={`hover:bg-gray-50 ${row.table === 'auth.users' ? 'bg-violet-50/40' : ''}`}>
                  <td className="px-4 py-3">
                    <code className={`px-2 py-0.5 rounded text-xs font-mono ${
                      row.table === 'auth.users'
                        ? 'bg-violet-100 text-violet-700'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {row.table}
                    </code>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{row.purpose}</td>
                  <td className="px-4 py-3">
                    <code className="text-xs text-indigo-600 font-mono">{row.cols}</code>
                  </td>
                  <td className="px-4 py-3 text-xs font-medium">
                    <span className={row.pw.startsWith('✅') ? 'text-violet-700' : 'text-gray-400'}>
                      {row.pw}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-green-700">{row.rls}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Function reference ── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">⚡ Function & Trigger Reference</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Function', 'Auto-fires?', 'Purpose'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-gray-500 font-semibold text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {[
                {
                  fn:      'handle_new_user()',
                  trigger: '✅ After every signup (email + Google)',
                  purpose: 'Auto-creates a profile row. Captures full_name and avatar from Google metadata.',
                },
                {
                  fn:      'set_updated_at()',
                  trigger: '✅ Before every UPDATE on profiles, expenses',
                  purpose: 'Stamps updated_at = NOW() automatically — no manual timestamp needed.',
                },
                {
                  fn:      'is_admin()',
                  trigger: '❌ Called by RLS policies internally',
                  purpose: 'Returns TRUE if current user has role = admin. Used in all RLS policy checks.',
                },
                {
                  fn:      'monthly_summary(user_id, month)',
                  trigger: '❌ Call manually',
                  purpose: 'Returns per-category totals, counts, and averages for a user in a given month.',
                },
                {
                  fn:      'daily_spending(user_id, from, to)',
                  trigger: '❌ Call manually',
                  purpose: 'Returns daily spending totals for charts and weekly/daily breakdowns.',
                },
                {
                  fn:      'admin_overview()',
                  trigger: '❌ Call manually',
                  purpose: 'System-wide stats: users, spending totals, top category, over-budget count.',
                },
              ].map(row => (
                <tr key={row.fn} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <code className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-mono">{row.fn}</code>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{row.trigger}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{row.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Common errors ── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <h3 className="font-bold text-gray-800 mb-4">🛠️ Common SQL Errors & Fixes</h3>
        <div className="space-y-3">
          {[
            {
              err: 'already exists',
              fix: 'Safe — the IF NOT EXISTS / ON CONFLICT clauses handle this. Re-run the section.',
            },
            {
              err: 'permission denied for table profiles',
              fix: 'RLS policy missing or you\'re not authenticated. Re-run Step 4 and make sure you\'re signed in.',
            },
            {
              err: 'violates foreign key constraint',
              fix: 'You\'re deleting a category that still has expenses. Delete or reassign those expenses first.',
            },
            {
              err: 'new row violates check constraint',
              fix: 'quantity must be > 0, price >= 0, and role must be "admin" or "user" exactly.',
            },
            {
              err: 'relation "auth.users" does not exist',
              fix: 'Run SQL in the Supabase SQL Editor (not a local psql). auth schema is Supabase-only.',
            },
            {
              err: 'column "total" can only be updated to DEFAULT',
              fix: 'The total column is GENERATED (auto-computed). Never set it manually — it\'s quantity × price.',
            },
            {
              err: 'publication "supabase_realtime" does not exist',
              fix: 'Go to Dashboard → Settings → API and enable Realtime for your project first.',
            },
            {
              err: 'UPDATE returned 0 rows (admin promote)',
              fix: 'Your profile row doesn\'t exist yet. Register in the app first, then run the UPDATE. See Step 7 for the manual INSERT fallback.',
            },
            {
              err: 'Supabase Security Advisor: Function public.set_updated_at has a role mutable search_path',
              fix: 'FIXED in Step 5 of this SQL. The function now uses SECURITY DEFINER + SET search_path = public. Re-run Step 5 to clear this warning permanently.',
            },
            {
              err: 'Supabase Security Advisor: Table public.profiles has RLS policy for INSERT that allows unrestricted access (WITH CHECK clause is always true)',
              fix: 'FIXED in Step 4 of this SQL. The old profiles_insert_trigger policy (WITH CHECK true) is replaced by profiles_insert_own (WITH CHECK auth.uid() = id). The handle_new_user() trigger is SECURITY DEFINER so it bypasses RLS without needing WITH CHECK (true). Re-run Step 4 to clear this warning.',
            },
          ].map((item, i) => (
            <div key={i} className="p-3 rounded-xl border border-gray-100 bg-gray-50">
              <p className="text-xs font-mono text-red-600 mb-1">❌ ERROR: …{item.err}…</p>
              <p className="text-xs text-gray-700">✅ {item.fix}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Done banner ── */}
      <div className="bg-gradient-to-r from-green-600 to-teal-600 rounded-2xl p-5 text-white shadow-lg">
        <h3 className="font-bold text-lg mb-1">✅ Database is Ready!</h3>
        <p className="text-green-100 text-sm leading-relaxed">
          Once all 9 steps succeed, your SpendWise database is fully set up with{' '}
          <strong className="text-white">bcrypt-hashed passwords</strong>,{' '}
          <strong className="text-white">row-level security</strong>,{' '}
          <strong className="text-white">auto-computed expense totals</strong>, and{' '}
          <strong className="text-white">real-time presence tracking</strong>.{' '}
          Go to <strong>Setup Guide → Step 7</strong> to promote yourself to admin,
          sign out, sign back in, and enjoy your Admin Dashboard!
        </p>
      </div>
    </div>
  );
}
