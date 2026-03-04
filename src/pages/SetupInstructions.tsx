import { useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Check, DollarSign, ExternalLink } from 'lucide-react';

const sql = `-- Run this in your Supabase SQL Editor

-- 1. Profiles table (extends auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  full_name text,
  avatar_url text,
  role text not null default 'user' check (role in ('admin','user')),
  is_active boolean not null default true,
  monthly_budget numeric(12,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Categories table
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  icon text,
  color text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- 3. Expenses table
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  category_id uuid references public.categories(id) not null,
  item_name text not null,
  quantity numeric(10,2) not null default 1,
  price numeric(12,2) not null,
  total numeric(12,2) generated always as (quantity * price) stored,
  date date not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. Enable Row Level Security
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.expenses enable row level security;

-- 5. RLS Policies for profiles
create policy "Users can view own profile" on public.profiles for select using (auth.uid() = id);
create policy "Admins can view all profiles" on public.profiles for select using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Admins can update all profiles" on public.profiles for update using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- 6. RLS Policies for categories
create policy "All users can view categories" on public.categories for select to authenticated using (true);
create policy "Admins can manage categories" on public.categories for all using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- 7. RLS Policies for expenses
create policy "Users can manage own expenses" on public.expenses for all using (auth.uid() = user_id);
create policy "Admins can view all expenses" on public.expenses for select using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- 8. Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url',
    'user'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 9. Insert default categories
insert into public.categories (name, icon, color) values
  ('Food', '🍔', '#F59E0B'),
  ('Transportation', '🚌', '#3B82F6'),
  ('Utilities', '💡', '#10B981'),
  ('School Supplies', '📚', '#8B5CF6'),
  ('Others', '📦', '#6B7280');

-- 10. Make yourself admin (replace with your email)
-- update public.profiles set role = 'admin' where email = 'your-email@example.com';
`;

function Step({ num, title, children, defaultOpen = false }: { num: number; title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 p-4 bg-white hover:bg-gray-50 text-left transition-colors">
        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-600 text-white text-sm font-bold flex items-center justify-center">{num}</span>
        <span className="font-semibold text-gray-800 flex-1">{title}</span>
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>
      {open && <div className="p-4 bg-gray-50 border-t border-gray-200 text-sm text-gray-700 space-y-2">{children}</div>}
    </div>
  );
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <div className="relative">
      <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-xs overflow-x-auto max-h-64 overflow-y-auto">{code}</pre>
      <button onClick={copy} className="absolute top-2 right-2 bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded text-xs flex items-center gap-1">
        {copied ? <><Check className="w-3 h-3" />Copied!</> : <><Copy className="w-3 h-3" />Copy</>}
      </button>
    </div>
  );
}

export default function SetupInstructions() {
  const [showSQL, setShowSQL] = useState(false);
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 p-4 flex items-start justify-center">
      <div className="w-full max-w-3xl my-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/20 backdrop-blur mb-4">
            <DollarSign className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">SpendWise Setup Guide</h1>
          <p className="text-white/70 mt-2">Follow these steps to deploy your expense tracker</p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-2xl space-y-3">
          <h2 className="text-xl font-bold text-gray-800 mb-4">🚀 Complete Setup Instructions</h2>

          <Step num={1} title="Create a Supabase Project" defaultOpen>
            <ol className="list-decimal list-inside space-y-2">
              <li>Go to <a href="https://supabase.com" target="_blank" rel="noreferrer" className="text-indigo-600 underline inline-flex items-center gap-1">supabase.com <ExternalLink className="w-3 h-3" /></a> and sign in / sign up.</li>
              <li>Click <strong>"New project"</strong> and fill in your project name, database password, and region.</li>
              <li>Wait 1–2 minutes for the project to provision.</li>
            </ol>
          </Step>

          <Step num={2} title="Run the Database SQL Schema">
            <p className="mb-2">In your Supabase dashboard, go to <strong>SQL Editor → New Query</strong>, paste the SQL below, and click <strong>Run</strong>.</p>
            <button onClick={() => setShowSQL(!showSQL)} className="mb-2 text-indigo-600 underline text-sm">{showSQL ? 'Hide SQL' : 'Show SQL Schema'}</button>
            {showSQL && <CodeBlock code={sql} />}
            <p className="text-amber-700 bg-amber-50 p-2 rounded-lg mt-2">⚠️ After running, update the last line with your own email to make yourself admin.</p>
          </Step>

          <Step num={3} title="Enable Google OAuth">
            <ol className="list-decimal list-inside space-y-2">
              <li>Go to <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" className="text-indigo-600 underline">Google Cloud Console</a> → Create or select a project.</li>
              <li>Go to <strong>APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID</strong>.</li>
              <li>Set Application type to <strong>Web application</strong>.</li>
              <li>Add Authorized redirect URI: <code className="bg-gray-100 px-1 rounded">https://YOUR-PROJECT.supabase.co/auth/v1/callback</code></li>
              <li>Copy your <strong>Client ID</strong> and <strong>Client Secret</strong>.</li>
              <li>In Supabase: go to <strong>Authentication → Providers → Google</strong>, toggle it on, paste your credentials.</li>
            </ol>
          </Step>

          <Step num={4} title="Enable Facebook OAuth">
            <ol className="list-decimal list-inside space-y-2">
              <li>Go to <a href="https://developers.facebook.com" target="_blank" rel="noreferrer" className="text-indigo-600 underline">Facebook for Developers</a> → Create App → <strong>Consumer</strong> type.</li>
              <li>Add <strong>Facebook Login</strong> product → Web platform.</li>
              <li>In <strong>Facebook Login → Settings</strong>, add Valid OAuth Redirect URI: <code className="bg-gray-100 px-1 rounded">https://YOUR-PROJECT.supabase.co/auth/v1/callback</code></li>
              <li>Copy your <strong>App ID</strong> and <strong>App Secret</strong> from App Settings → Basic.</li>
              <li>In Supabase: go to <strong>Authentication → Providers → Facebook</strong>, toggle it on, paste your credentials.</li>
            </ol>
          </Step>

          <Step num={5} title="Get Your Supabase API Keys">
            <ol className="list-decimal list-inside space-y-2">
              <li>In Supabase dashboard: go to <strong>Settings → API</strong>.</li>
              <li>Copy the <strong>Project URL</strong> (looks like: <code className="bg-gray-100 px-1 rounded">https://xxxx.supabase.co</code>).</li>
              <li>Copy the <strong>anon / public key</strong> (long JWT string).</li>
            </ol>
          </Step>

          <Step num={6} title="Deploy to Vercel">
            <ol className="list-decimal list-inside space-y-2">
              <li>Push this project to a <strong>GitHub repository</strong>.</li>
              <li>Go to <a href="https://vercel.com" target="_blank" rel="noreferrer" className="text-indigo-600 underline">vercel.com</a> → <strong>New Project → Import from GitHub</strong>.</li>
              <li>Select your repository. Framework preset should auto-detect as <strong>Vite</strong>.</li>
              <li>In <strong>Environment Variables</strong>, add:
                <div className="mt-2 space-y-1">
                  <CodeBlock code={`VITE_SUPABASE_URL=https://your-project-id.supabase.co\nVITE_SUPABASE_ANON_KEY=your-anon-key-here`} />
                </div>
              </li>
              <li>Click <strong>Deploy</strong>. Vercel will build and host your app!</li>
              <li>Go back to Supabase → <strong>Authentication → URL Configuration</strong> and add your Vercel URL as Site URL and Redirect URL.</li>
            </ol>
          </Step>

          <Step num={7} title="Local Development (Optional)">
            <p className="mb-2">Create a <code className="bg-gray-100 px-1 rounded">.env</code> file in the root of the project:</p>
            <CodeBlock code={`VITE_SUPABASE_URL=https://your-project-id.supabase.co\nVITE_SUPABASE_ANON_KEY=your-anon-key-here`} />
            <p className="mt-2">Then run: <code className="bg-gray-100 px-1 rounded">npm run dev</code></p>
          </Step>

          <div className="bg-green-50 border border-green-200 rounded-xl p-4 mt-4">
            <h3 className="font-bold text-green-800 mb-2">✅ After Setup Complete</h3>
            <ul className="text-green-700 space-y-1 text-sm list-disc list-inside">
              <li>Register your first account — it will be a regular user by default.</li>
              <li>Run the SQL update to make your email an admin: <code className="bg-green-100 px-1 rounded">UPDATE profiles SET role='admin' WHERE email='you@example.com';</code></li>
              <li>Log back in to access the full Admin Dashboard.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
