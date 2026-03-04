import { useState } from 'react';
import {
  ChevronDown, ChevronRight, Copy, Check, ExternalLink,
  Database, Globe, Key, Shield, Users, Settings,
  AlertTriangle, CheckCircle, Terminal, BookOpen, Server
} from 'lucide-react';

// ── Full SQL Schema ───────────────────────────────────────────────────────────
const SQL_SCHEMA = `-- ============================================================
-- SpendWise — Complete Database Schema
-- Run this entire block in Supabase SQL Editor → New Query
-- ============================================================

-- 1. PROFILES (extends auth.users)
create table if not exists public.profiles (
  id            uuid        references auth.users on delete cascade primary key,
  email         text        not null,
  full_name     text,
  avatar_url    text,
  role          text        not null default 'user' check (role in ('admin','user')),
  is_active     boolean     not null default true,
  monthly_budget numeric(12,2),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 2. CATEGORIES
create table if not exists public.categories (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null unique,
  icon       text,
  color      text,
  created_by uuid        references public.profiles(id),
  created_at timestamptz not null default now()
);

-- 3. EXPENSES
create table if not exists public.expenses (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        references public.profiles(id) on delete cascade not null,
  category_id uuid        references public.categories(id) not null,
  item_name   text        not null,
  quantity    numeric(10,2) not null default 1,
  price       numeric(12,2) not null,
  total       numeric(12,2) generated always as (quantity * price) stored,
  date        date        not null,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 4. ENABLE ROW LEVEL SECURITY
alter table public.profiles  enable row level security;
alter table public.categories enable row level security;
alter table public.expenses   enable row level security;

-- 5. RLS — PROFILES
create policy "Users view own profile"
  on public.profiles for select using (auth.uid() = id);
create policy "Admins view all profiles"
  on public.profiles for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
create policy "Users update own profile"
  on public.profiles for update using (auth.uid() = id);
create policy "Admins update all profiles"
  on public.profiles for update
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
create policy "Service role insert profiles"
  on public.profiles for insert with check (true);

-- 6. RLS — CATEGORIES
create policy "All authenticated users view categories"
  on public.categories for select to authenticated using (true);
create policy "Admins manage categories"
  on public.categories for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- 7. RLS — EXPENSES
create policy "Users manage own expenses"
  on public.expenses for all using (auth.uid() = user_id);
create policy "Admins view all expenses"
  on public.expenses for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- 8. AUTO-CREATE PROFILE ON NEW USER SIGNUP
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'),
    'user'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 9. AUTO-UPDATE updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_profiles_updated_at before update on public.profiles
  for each row execute procedure public.set_updated_at();
create trigger set_expenses_updated_at before update on public.expenses
  for each row execute procedure public.set_updated_at();

-- 10. DEFAULT CATEGORIES
insert into public.categories (name, icon, color) values
  ('Food',             '🍔', '#F59E0B'),
  ('Transportation',   '🚌', '#3B82F6'),
  ('Utilities',        '💡', '#10B981'),
  ('School Supplies',  '📚', '#8B5CF6'),
  ('Healthcare',       '🏥', '#EF4444'),
  ('Entertainment',    '🎬', '#EC4899'),
  ('Clothing',         '👕', '#F97316'),
  ('Others',           '📦', '#6B7280')
on conflict (name) do nothing;

-- 11. ENABLE REALTIME (for online presence)
alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.expenses;

-- ✅ Schema complete!
-- Next: run the admin promotion query below (separate query)
`;

const ADMIN_SQL = `UPDATE public.profiles
SET role = 'admin'
WHERE email = 'your-email@example.com';`;

const ENV_VARS = `VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key-here`;

// ── Reusable components ───────────────────────────────────────────────────────
function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative mt-2">
      <pre className="bg-gray-950 text-emerald-400 p-4 rounded-xl text-xs overflow-x-auto max-h-72 overflow-y-auto whitespace-pre font-mono leading-relaxed">
        <code>{code}</code>
      </pre>
      <button
        onClick={copy}
        className="absolute top-2 right-2 bg-gray-800 hover:bg-gray-700 text-white px-2.5 py-1 rounded-lg text-xs flex items-center gap-1 transition-colors"
      >
        {copied
          ? <><Check className="w-3 h-3 text-emerald-400" /> Copied!</>
          : <><Copy className="w-3 h-3" /> Copy</>
        }
      </button>
    </div>
  );
}

function Step({
  num, title, icon: Icon, color, children, defaultOpen = false,
}: {
  num: number; title: string; icon: React.ElementType;
  color: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-4 bg-white hover:bg-gray-50 text-left transition-colors"
      >
        <div className={`w-9 h-9 rounded-xl ${color} flex items-center justify-center flex-shrink-0 shadow-sm`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-xs text-gray-400 font-semibold tracking-wide">STEP {num}</span>
          <p className="font-semibold text-gray-800 text-sm mt-0.5">{title}</p>
        </div>
        {open
          ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
          : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
        }
      </button>
      {open && (
        <div className="p-5 bg-gray-50 border-t border-gray-200 text-sm text-gray-700 space-y-3">
          {children}
        </div>
      )}
    </div>
  );
}

function InfoBox({ type, children }: { type: 'warning' | 'success' | 'info' | 'tip' | 'danger'; children: React.ReactNode }) {
  const s = {
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    info:    'bg-blue-50 border-blue-200 text-blue-800',
    tip:     'bg-purple-50 border-purple-200 text-purple-800',
    danger:  'bg-red-50 border-red-200 text-red-800',
  };
  const icons = { warning: '⚠️', success: '✅', info: 'ℹ️', tip: '💡', danger: '🚨' };
  return (
    <div className={`border rounded-xl p-3 text-xs leading-relaxed ${s[type]}`}>
      <span className="mr-1">{icons[type]}</span>{children}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AdminSetupGuide() {
  const [showSQL, setShowSQL] = useState(false);

  return (
    <div className="space-y-4 max-w-3xl">

      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-6 text-white shadow-sm">
        <div className="flex items-center gap-3 mb-2">
          <BookOpen className="w-6 h-6" />
          <h2 className="text-xl font-bold">SpendWise — Full Setup & Connection Guide</h2>
        </div>
        <p className="text-indigo-100 text-sm mb-4">
          Follow these steps to connect SpendWise to Supabase, enable Google login, and deploy to Vercel.
          Each step is expandable — click to open.
        </p>

        {/* Secret shortcut reminder */}
        <div className="bg-white/20 backdrop-blur rounded-xl px-4 py-3 text-sm">
          <p className="text-yellow-200 font-bold mb-1">🔑 How to show/hide this guide:</p>
          <p className="text-white/90 text-xs">
            Press{' '}
            <kbd className="bg-white/20 px-2 py-0.5 rounded font-mono">↑</kbd>{' '}
            <kbd className="bg-white/20 px-2 py-0.5 rounded font-mono">↑</kbd>{' '}
            <kbd className="bg-white/20 px-2 py-0.5 rounded font-mono">↓</kbd>{' '}
            <kbd className="bg-white/20 px-2 py-0.5 rounded font-mono">↓</kbd>{' '}
            (Arrow keys — click outside any input first)
            <br />
            <span className="text-white/70">Or triple-tap the <strong>· · ·</strong> button at the bottom of the sidebar.</span>
          </p>
        </div>
      </div>

      {/* Quick Checklist */}
      <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm">
        <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2 text-sm">
          <CheckCircle className="w-5 h-5 text-emerald-500" /> Setup Checklist
        </h3>
        <div className="grid sm:grid-cols-2 gap-2">
          {[
            'Create a Supabase account & project',
            'Run the SQL schema in Supabase',
            'Get Supabase URL & Anon Key',
            'Enable Google OAuth in Supabase',
            'Create .env file with the keys',
            'Push code to GitHub',
            'Deploy to Vercel with env vars',
            'Add Vercel URL to Supabase auth settings',
            'Promote your account to admin',
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 text-sm">
              <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0" />
              <span className="text-gray-600">{item}</span>
            </div>
          ))}
        </div>
      </div>

      {/* STEP 1 — Supabase */}
      <Step num={1} title="Create a Supabase Project" icon={Database} color="bg-indigo-500" defaultOpen>
        <ol className="list-decimal list-inside space-y-2 leading-relaxed">
          <li>Go to <a href="https://supabase.com" target="_blank" rel="noreferrer" className="text-indigo-600 underline inline-flex items-center gap-1">supabase.com <ExternalLink className="w-3 h-3" /></a> and sign up for free.</li>
          <li>Click <strong>"New project"</strong>.</li>
          <li>Enter a <strong>Project Name</strong> (e.g. <code className="bg-gray-100 px-1 rounded">spendwise</code>), set a strong <strong>Database Password</strong> (save it!), and choose a <strong>Region</strong> near you.</li>
          <li>Click <strong>"Create new project"</strong> and wait 1–2 minutes.</li>
        </ol>
        <InfoBox type="info">
          Supabase free tier (Spark plan): 500 MB storage, 2 GB bandwidth, 50,000 monthly active users — plenty to start.
        </InfoBox>
      </Step>

      {/* STEP 2 — SQL Schema */}
      <Step num={2} title="Run the Database SQL Schema" icon={Terminal} color="bg-emerald-500">
        <ol className="list-decimal list-inside space-y-2 leading-relaxed">
          <li>In your Supabase project → click <strong>SQL Editor</strong> in the left sidebar.</li>
          <li>Click <strong>"New query"</strong>.</li>
          <li>Copy the full SQL below and paste it into the editor.</li>
          <li>Click <strong>"Run"</strong> (or Ctrl/Cmd + Enter).</li>
          <li>You should see <code className="bg-gray-100 px-1 rounded text-xs">Success. No rows returned</code>.</li>
        </ol>

        <button
          onClick={() => setShowSQL(!showSQL)}
          className="flex items-center gap-2 text-indigo-600 font-semibold text-sm border border-indigo-200 px-3 py-2 rounded-xl hover:bg-indigo-50 transition-colors"
        >
          {showSQL ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          {showSQL ? 'Hide SQL' : '📋 Show Full SQL Schema (click to expand & copy)'}
        </button>

        {showSQL && <CodeBlock code={SQL_SCHEMA} />}

        <InfoBox type="warning">
          The schema includes a trigger that auto-creates a profile row for every new signup (including Google OAuth). Make sure the trigger ran without errors before proceeding.
        </InfoBox>
      </Step>

      {/* STEP 3 — API Keys */}
      <Step num={3} title="Get Your Supabase API Keys" icon={Key} color="bg-yellow-500">
        <ol className="list-decimal list-inside space-y-2 leading-relaxed">
          <li>In Supabase → click <strong>Settings</strong> (gear icon) → <strong>API</strong>.</li>
          <li>Copy the <strong>Project URL</strong> — looks like <code className="bg-gray-100 px-1 rounded text-xs">https://abcdefgh.supabase.co</code></li>
          <li>Copy the <strong>anon / public</strong> key — a long string starting with <code className="bg-gray-100 px-1 rounded text-xs">eyJ...</code></li>
        </ol>
        <p className="font-medium text-gray-700 text-xs mt-1">Your <code>.env</code> file (in the project root) should look like:</p>
        <CodeBlock code={ENV_VARS} />
        <InfoBox type="danger">
          <strong>Never use the service_role key in your frontend.</strong> Only use the <strong>anon/public</strong> key. The service_role key bypasses all security and must stay server-side only.
        </InfoBox>
      </Step>

      {/* STEP 4 — Google OAuth */}
      <Step num={4} title="Enable Google Sign-In (OAuth)" icon={Globe} color="bg-red-500">
        <div className="space-y-4">
          <p className="font-semibold text-gray-800">Part A — Create Google OAuth Credentials</p>
          <ol className="list-decimal list-inside space-y-2 leading-relaxed">
            <li>
              Go to <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" className="text-indigo-600 underline inline-flex items-center gap-1">
                Google Cloud Console <ExternalLink className="w-3 h-3" />
              </a>
            </li>
            <li>Click the project selector at the top → <strong>"New Project"</strong> → name it (e.g. SpendWise) → <strong>Create</strong>.</li>
            <li>In the left sidebar: <strong>APIs & Services → OAuth consent screen</strong>.</li>
            <li>Select <strong>"External"</strong> → <strong>Create</strong>.</li>
            <li>Fill in:
              <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                <li><strong>App name:</strong> SpendWise</li>
                <li><strong>User support email:</strong> your email</li>
                <li><strong>Developer contact email:</strong> your email</li>
              </ul>
            </li>
            <li>Click <strong>Save and Continue</strong> through the Scopes page (no changes needed).</li>
            <li>Click <strong>Save and Continue</strong> through Test Users (optional: add your email).</li>
            <li>Go to <strong>APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID</strong>.</li>
            <li>Application type: <strong>Web application</strong>.</li>
            <li>
              Under <strong>Authorized redirect URIs</strong>, add exactly:
              <CodeBlock code={`https://YOUR-PROJECT-ID.supabase.co/auth/v1/callback`} />
              <p className="text-xs text-gray-500 mt-1">Replace YOUR-PROJECT-ID with your actual Supabase project reference ID (visible in your Supabase URL).</p>
            </li>
            <li>Click <strong>Create</strong>. A dialog shows your <strong>Client ID</strong> and <strong>Client Secret</strong> — copy both.</li>
          </ol>

          <p className="font-semibold text-gray-800">Part B — Enable Google in Supabase</p>
          <ol className="list-decimal list-inside space-y-2 leading-relaxed">
            <li>In Supabase → <strong>Authentication → Providers</strong>.</li>
            <li>Find <strong>Google</strong> → toggle it <strong>ON</strong>.</li>
            <li>Paste your <strong>Client ID</strong> and <strong>Client Secret</strong>.</li>
            <li>Click <strong>Save</strong>.</li>
          </ol>

          <InfoBox type="success">
            Google sign-in will now work! Users can click "Continue with Google" to register or sign in without a password or email confirmation.
          </InfoBox>

          <p className="font-semibold text-gray-800">Part C — Fix the #access_token URL (Most Important Step)</p>
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-800 leading-relaxed">
            <p className="font-bold mb-1">❓ Why does the URL show <code>#access_token=eyJhbG...</code>?</p>
            <p>After Google sign-in, Supabase redirects back to your app with the session token in the URL hash. This is <strong>completely normal</strong> — it's how the OAuth implicit flow works. SpendWise reads the token automatically and wipes it from the URL using <code>window.history.replaceState()</code>, so users only see it for a fraction of a second.</p>
            <p className="mt-1.5 font-semibold">The #1 reason it gets STUCK is a wrong redirect URL (e.g. port 3000 instead of 5173).</p>
          </div>
          <ol className="list-decimal list-inside space-y-2 leading-relaxed">
            <li>In Supabase → <strong>Authentication → URL Configuration</strong></li>
            <li>Set <strong>Site URL</strong> to: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">http://localhost:5173</code></li>
            <li>
              Under <strong>Redirect URLs</strong>, add ALL of these (one per line):
              <CodeBlock code={`http://localhost:5173\nhttp://localhost:5173/**\nhttps://your-app.vercel.app\nhttps://your-app.vercel.app/**`} />
            </li>
            <li>Click <strong>Save</strong>.</li>
          </ol>
          <InfoBox type="danger">
            ❌ <strong>Do NOT use port 3000.</strong> Vite's default port is <strong>5173</strong>. If your Supabase redirect URL points to port 3000, Google will redirect to a dead page and the ugly token URL will get stuck in the address bar.
          </InfoBox>
          <InfoBox type="success">
            ✅ Once the redirect URLs are correct, the <code>#access_token=</code> hash disappears within milliseconds of the app loading — it's cleaned automatically by the app code.
          </InfoBox>
        </div>
      </Step>

      {/* STEP 5 — Deploy to Vercel */}
      <Step num={5} title="Deploy to Vercel (Free Hosting)" icon={Globe} color="bg-gray-700">
        <ol className="list-decimal list-inside space-y-3 leading-relaxed">
          <li>
            Push your project to GitHub:
            <CodeBlock code={`git init\ngit add .\ngit commit -m "Initial SpendWise commit"\ngit remote add origin https://github.com/YOUR_USERNAME/spendwise.git\ngit push -u origin main`} />
          </li>
          <li>Go to <a href="https://vercel.com" target="_blank" rel="noreferrer" className="text-indigo-600 underline inline-flex items-center gap-1">vercel.com <ExternalLink className="w-3 h-3" /></a> → sign in with GitHub.</li>
          <li>Click <strong>"New Project"</strong> → <strong>"Import from GitHub"</strong> → select your repo.</li>
          <li>Framework should auto-detect as <strong>Vite</strong>. Leave settings as-is.</li>
          <li>
            Under <strong>Environment Variables</strong>, add:
            <CodeBlock code={ENV_VARS} />
          </li>
          <li>Click <strong>"Deploy"</strong> — Vercel builds and gives you a live URL like <code className="bg-gray-100 px-1 rounded text-xs">https://spendwise-abc.vercel.app</code>.</li>
          <li>
            Go back to Supabase → <strong>Authentication → URL Configuration</strong> and add your Vercel URL to <strong>Redirect URLs</strong>:
            <CodeBlock code={`https://your-app.vercel.app\nhttps://your-app.vercel.app/**`} />
          </li>
        </ol>
        <InfoBox type="success">Your app is now live! Share the Vercel URL with your users.</InfoBox>
      </Step>

      {/* STEP 6 — Promote to Admin */}
      <Step num={6} title="Promote Yourself to Admin" icon={Shield} color="bg-purple-600">
        <ol className="list-decimal list-inside space-y-2 leading-relaxed">
          <li>First, <strong>register a normal account</strong> on your deployed site (email or Google).</li>
          <li>Go to Supabase → <strong>SQL Editor → New Query</strong>.</li>
          <li>Run this SQL (replace with your actual email):</li>
        </ol>
        <CodeBlock code={ADMIN_SQL} />
        <ol className="list-decimal list-inside space-y-2 leading-relaxed mt-2" start={4}>
          <li><strong>Sign out</strong> from SpendWise and <strong>sign back in</strong>.</li>
          <li>You'll be redirected to the <strong>Admin Dashboard</strong> automatically! 🎉</li>
        </ol>
        <InfoBox type="tip">
          Used Google to sign up? Find your exact email in Supabase → <strong>Authentication → Users</strong>. Use that email in the SQL above.
        </InfoBox>
        <InfoBox type="tip">
          You can promote multiple people to admin by running the SQL once per email address.
        </InfoBox>
      </Step>

      {/* STEP 7 — Admin Guide */}
      <Step num={7} title="Admin Functions Reference" icon={Users} color="bg-teal-500">
        <div className="space-y-2">
          {[
            { action: 'View all registered users',       where: 'Admin → Users tab' },
            { action: 'Edit user info (name, role, budget)', where: 'Users tab → Edit button' },
            { action: 'Deactivate or delete accounts',   where: 'Users tab → Deactivate button' },
            { action: 'Reset user passwords',            where: 'Users tab → Reset Pwd button (sends email)' },
            { action: 'View all expenses from all users', where: 'Admin → Expenses tab' },
            { action: 'Filter by date / category / amount', where: 'Expenses tab → filter controls' },
            { action: 'Export all expenses to CSV',      where: 'Expenses tab → Export CSV button' },
            { action: 'Add / edit / delete categories',  where: 'Admin → Categories tab' },
            { action: 'View system-wide reports',        where: 'Admin → Reports tab' },
            { action: 'Monitor users who exceed budget', where: 'Reports tab + Overview alert cards' },
            { action: 'See how many users are online',   where: 'Sidebar + Header — live count via Supabase Realtime' },
            { action: 'View & copy full SQL schema',     where: 'Secret tabs → Database SQL' },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-2.5 p-2.5 bg-white rounded-xl border border-gray-100">
              <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-medium text-gray-800 text-sm">{item.action}</span>
                <span className="text-gray-400 mx-1.5">→</span>
                <span className="text-gray-500 text-xs">{item.where}</span>
              </div>
            </div>
          ))}
        </div>
      </Step>

      {/* STEP 8 — Free Database Alternatives */}
      <Step num={8} title="Free Database Alternatives to Supabase" icon={Server} color="bg-orange-500">
        <p className="text-gray-600 leading-relaxed">
          SpendWise is built on Supabase (recommended), but here are other free database platforms you can use if needed:
        </p>
        <div className="space-y-3 mt-2">
          {[
            {
              name: 'Supabase (Recommended)',
              url: 'https://supabase.com',
              free: 'Free forever (Spark plan)',
              features: ['PostgreSQL database', 'Auth (Email + Google + GitHub + more)', 'Realtime subscriptions', '500 MB storage', '2 free projects'],
              badge: '⭐ Best for this app',
              badgeColor: 'bg-emerald-100 text-emerald-700',
            },
            {
              name: 'PlanetScale',
              url: 'https://planetscale.com',
              free: 'Free Hobby plan',
              features: ['MySQL-compatible', '5 GB storage', 'Branching (Git-like DB workflow)', 'No realtime support'],
              badge: 'MySQL',
              badgeColor: 'bg-blue-100 text-blue-700',
            },
            {
              name: 'Neon',
              url: 'https://neon.tech',
              free: 'Free tier — 512 MB',
              features: ['PostgreSQL serverless', 'Branching', 'Auto-scale to zero', 'No built-in auth'],
              badge: 'PostgreSQL',
              badgeColor: 'bg-indigo-100 text-indigo-700',
            },
            {
              name: 'Turso (LibSQL)',
              url: 'https://turso.tech',
              free: 'Free — 500 DBs, 9 GB',
              features: ['Edge SQLite (LibSQL)', 'Extremely fast reads', 'No built-in auth', 'REST & SDK'],
              badge: 'SQLite',
              badgeColor: 'bg-purple-100 text-purple-700',
            },
            {
              name: 'MongoDB Atlas',
              url: 'https://www.mongodb.com/atlas',
              free: 'Free M0 cluster — 512 MB',
              features: ['NoSQL document database', 'Global clusters', 'Charts & analytics', 'No built-in auth'],
              badge: 'NoSQL',
              badgeColor: 'bg-amber-100 text-amber-700',
            },
            {
              name: 'Render (PostgreSQL)',
              url: 'https://render.com',
              free: 'Free 90-day PostgreSQL',
              features: ['Full PostgreSQL', 'Auto-backups', 'Pairs with Render hosting', 'Expires after 90 days on free plan'],
              badge: 'PostgreSQL',
              badgeColor: 'bg-rose-100 text-rose-700',
            },
          ].map((db, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <a href={db.url} target="_blank" rel="noreferrer"
                    className="font-bold text-gray-800 text-sm hover:text-indigo-600 transition-colors inline-flex items-center gap-1">
                    {db.name} <ExternalLink className="w-3 h-3" />
                  </a>
                  <p className="text-xs text-emerald-600 font-medium mt-0.5">{db.free}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${db.badgeColor}`}>
                  {db.badge}
                </span>
              </div>
              <ul className="space-y-0.5">
                {db.features.map((f, j) => (
                  <li key={j} className="text-xs text-gray-500 flex items-center gap-1.5">
                    <span className="w-1 h-1 bg-gray-300 rounded-full flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <InfoBox type="info">
          <strong>Why Supabase?</strong> It's the only free option that includes built-in Auth (Google OAuth), Realtime, and PostgreSQL all-in-one — which is exactly what SpendWise needs. The others would require additional Auth services like Clerk or Auth.js.
        </InfoBox>
      </Step>

      {/* STEP 9 — Local Dev */}
      <Step num={9} title="Local Development Setup" icon={Settings} color="bg-slate-600">
        <ol className="list-decimal list-inside space-y-2 leading-relaxed">
          <li>Make sure <strong>Node.js 18+</strong> is installed.</li>
          <li>Create a <code className="bg-gray-100 px-1 rounded">.env</code> file in the project root:</li>
        </ol>
        <CodeBlock code={ENV_VARS} />
        <ol className="list-decimal list-inside space-y-2 leading-relaxed mt-2" start={3}>
          <li>Install and start:</li>
        </ol>
        <CodeBlock code={`npm install\nnpm run dev`} />
        <p className="mt-2 text-sm">Open <code className="bg-gray-100 px-1 rounded">http://localhost:5173</code> — NOT localhost:3000.</p>
        <InfoBox type="warning">
          Vite's default port is <strong>5173</strong>, not 3000. All your Supabase redirect URLs and Google OAuth redirect URIs must use 5173 for local development.
        </InfoBox>
      </Step>

      {/* Common Issues */}
      <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm">
        <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2 text-sm">
          <AlertTriangle className="w-5 h-5 text-amber-500" /> Common Issues & Fixes
        </h3>
        <div className="space-y-3">
          {[
            {
              issue: 'URL shows #access_token=eyJ... after Google login',
              fix: 'Supabase → Authentication → URL Configuration. Set Site URL to http://localhost:5173. Add http://localhost:5173/** and https://your-app.vercel.app/** to Redirect URLs. The app automatically cleans the URL after consuming the token.',
            },
            {
              issue: '"Email rate limit exceeded" on sign up',
              fix: 'Supabase → Authentication → Providers → Email → toggle OFF "Confirm email". Users will sign in immediately without email confirmation. Or use Google sign-in which has no rate limits.',
            },
            {
              issue: '"Invalid API key" or blank page',
              fix: 'Check that VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are correctly set in .env (local) and in Vercel Environment Variables (production).',
            },
            {
              issue: 'Profile not created after Google sign-in',
              fix: 'The SQL trigger (handle_new_user) must be present in the database. Re-run Step 2 SQL. Also check Supabase → Database → Triggers to verify the trigger exists on auth.users.',
            },
            {
              issue: 'Still seeing User Dashboard after running admin SQL',
              fix: 'Sign out and sign back in. The role is stored in the database — your browser session needs to be refreshed. Also verify the SQL ran: SELECT role FROM profiles WHERE email = \'your@email.com\';',
            },
            {
              issue: 'Google sign-in shows "Error 400: redirect_uri_mismatch"',
              fix: 'In Google Cloud Console → Credentials → your OAuth client → Authorized redirect URIs — make sure https://YOUR-PROJECT-ID.supabase.co/auth/v1/callback is listed exactly. No trailing slash differences.',
            },
            {
              issue: 'Online user count always shows 0',
              fix: 'Enable Realtime in Supabase → Database → Replication → enable for the profiles table. Also make sure supabase_realtime publication includes the profiles table (the SQL schema handles this automatically).',
            },
            {
              issue: 'Category delete fails',
              fix: 'You can only delete categories that have no expenses linked to them. Delete or reassign those expenses first, then try deleting the category.',
            },
          ].map((item, i) => (
            <div key={i} className="p-3.5 bg-gray-50 rounded-xl border border-gray-100">
              <p className="font-semibold text-red-700 text-sm mb-1">❌ {item.issue}</p>
              <p className="text-gray-600 text-xs leading-relaxed">✅ {item.fix}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Done */}
      <div className="bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl p-5 text-white shadow-sm">
        <div className="flex items-center gap-3 mb-2">
          <CheckCircle className="w-6 h-6" />
          <h3 className="font-bold text-lg">You're All Set! 🎉</h3>
        </div>
        <p className="text-emerald-100 text-sm leading-relaxed">
          Once all steps are complete, SpendWise is fully operational. Users can register, track expenses, set budgets, and view reports.
          As admin, you have full visibility and control over all accounts and financial data across the platform.
        </p>
      </div>
    </div>
  );
}
