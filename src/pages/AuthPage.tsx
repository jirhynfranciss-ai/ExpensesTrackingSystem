import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  Eye, EyeOff, AlertTriangle, Mail, CheckCircle,
  Clock, RefreshCw, Info, X, ExternalLink, Copy,
  Shield, Smartphone, Monitor, Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';
import logo from '../assets/logo.svg';

type Screen = 'auth' | 'confirm' | 'rate_limited' | 'webview_error' | 'google_setup_error';

// ── Floating particles background ─────────────────────────────────────────────
function AuthParticles() {
  const items = Array.from({ length: 15 }, (_, i) => ({
    id: i,
    size: Math.random() * 5 + 2,
    left: Math.random() * 100,
    delay: Math.random() * 10,
    duration: Math.random() * 8 + 6,
    color: ['rgba(99,102,241,0.5)','rgba(168,85,247,0.4)','rgba(236,72,153,0.3)','rgba(16,185,129,0.3)'][i % 4],
  }));
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {items.map(p => (
        <div key={p.id} className="particle" style={{
          width: p.size, height: p.size,
          left: `${p.left}%`, bottom: '-10px',
          backgroundColor: p.color,
          animationDuration: `${p.duration}s`,
          animationDelay: `${p.delay}s`,
        }} />
      ))}
    </div>
  );
}

// ── Copy block ────────────────────────────────────────────────────────────────
function CopyBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative mt-2">
      <pre className="bg-black/40 text-green-400 p-3 rounded-xl text-xs overflow-x-auto font-mono whitespace-pre leading-relaxed">{code}</pre>
      <button
        onClick={() => { navigator.clipboard.writeText(code).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
        className="absolute top-2 right-2 bg-white/10 hover:bg-white/25 text-white px-2 py-1 rounded-lg text-xs flex items-center gap-1 transition-all"
      >
        <Copy className="w-3 h-3" />{copied ? '✓ Copied!' : 'Copy'}
      </button>
    </div>
  );
}

// ── Admin Help Modal ──────────────────────────────────────────────────────────
function AdminHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 modal-backdrop flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.8, opacity: 0, y: 30 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="bg-gray-900 border border-white/10 rounded-3xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-white font-bold text-lg flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-400" /> How to Access Admin Dashboard
          </h3>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors p-1 hover:bg-white/10 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-3">
          {[
            { step: 1, color: 'bg-blue-500', title: 'Set up Supabase & Run SQL Schema', desc: 'Create a Supabase project and run the full database SQL from the Admin Panel → Database SQL.' },
            { step: 2, color: 'bg-green-500', title: 'Register a Normal Account First', desc: "Sign up using your email or Google. You'll start as a regular user — that's expected." },
            { step: 3, color: 'bg-purple-500', title: 'Promote Yourself to Admin via SQL', desc: 'Go to Supabase → SQL Editor → New Query → paste and run:', code: `UPDATE public.profiles\nSET role = 'admin'\nWHERE email = 'your-email@example.com';` },
            { step: 4, color: 'bg-amber-500', title: 'Sign Out & Sign Back In', desc: "Sign out from SpendWise then sign back in. You'll be routed to the Admin Dashboard automatically." },
            { step: 5, color: 'bg-pink-500', title: 'Used Google to sign up?', desc: 'Find your exact email in Supabase → Authentication → Users. Use that email in the SQL above.' },
          ].map(({ step, color, title, desc, code }, i) => (
            <motion.div
              key={step}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.07 }}
              className="bg-white/5 border border-white/10 rounded-2xl p-4 hover:bg-white/8 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className={`w-7 h-7 rounded-full ${color} flex items-center justify-center text-white font-bold text-sm flex-shrink-0 mt-0.5 shadow-lg`}>{step}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm mb-1">{title}</p>
                  <p className="text-white/60 text-xs leading-relaxed">{desc}</p>
                  {code && <CopyBlock code={code} />}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          onClick={onClose}
          className="w-full mt-5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white py-3 rounded-xl font-semibold transition-all btn-shimmer shadow-lg shadow-indigo-500/20"
        >
          Got it! 🎉
        </motion.button>
      </motion.div>
    </motion.div>
  );
}

// ── Webview Error Screen ──────────────────────────────────────────────────────
function WebViewErrorScreen({ onBack, currentUrl }: { onBack: () => void; currentUrl: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-purple-950 flex items-center justify-center p-4 relative overflow-hidden">
      <AuthParticles />
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-md z-10">
        <div className="glass border border-white/20 rounded-3xl p-8 shadow-2xl text-center">
          <motion.div animate={{ rotate: [0,10,-10,0] }} transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
            className="w-16 h-16 bg-orange-500/20 border-2 border-orange-400/40 rounded-full flex items-center justify-center mx-auto mb-5">
            <Smartphone className="w-8 h-8 text-orange-300" />
          </motion.div>
          <h2 className="text-2xl font-bold text-white mb-2">Open in a Real Browser</h2>
          <p className="text-white/60 mb-6 text-sm leading-relaxed">Google blocks sign-in from in-app browsers. Open in <strong className="text-white">Chrome</strong> or <strong className="text-white">Safari</strong>.</p>
          <div className="space-y-3 text-left mb-6">
            {[
              { color: 'bg-blue-500/20 border-blue-400/30', textColor: 'text-blue-300', icon: <Monitor className="w-4 h-4" />, title: 'On Android', steps: ['Tap ⋮ three-dot menu at top right', 'Tap "Open in Chrome" or "Open in Browser"', 'Try Google Sign-In again'] },
              { color: 'bg-purple-500/20 border-purple-400/30', textColor: 'text-purple-300', icon: <Monitor className="w-4 h-4" />, title: 'On iPhone / iPad', steps: ['Tap Share icon (box with arrow) at bottom', 'Tap "Open in Safari"', 'Try Google Sign-In again'] },
            ].map(({ color, textColor, icon, title, steps }, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
                className={`border rounded-2xl p-4 ${color}`}>
                <p className={`font-bold text-sm mb-2 flex items-center gap-2 ${textColor}`}>{icon}{title}</p>
                <ol className="text-white/60 text-xs space-y-1.5 list-decimal list-inside">{steps.map((s, j) => <li key={j}>{s}</li>)}</ol>
              </motion.div>
            ))}
            <div className="bg-white/10 border border-white/20 rounded-2xl p-4">
              <p className="text-white/80 font-bold text-sm mb-2">Or copy & paste the URL:</p>
              <div className="bg-black/30 rounded-xl p-2.5 flex items-center gap-2">
                <p className="text-green-400 text-xs font-mono flex-1 truncate">{currentUrl}</p>
                <button onClick={() => { navigator.clipboard.writeText(currentUrl).catch(()=>{}); setCopied(true); setTimeout(()=>setCopied(false),2000); }}
                  className="bg-white/10 hover:bg-white/20 text-white px-2 py-1 rounded-lg text-xs flex items-center gap-1 transition-all flex-shrink-0">
                  <Copy className="w-3 h-3" />{copied ? '✓' : 'Copy'}
                </button>
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={onBack}
              className="flex-1 flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white py-3 rounded-xl font-semibold transition-all">
              <RefreshCw className="w-4 h-4" /> Back
            </motion.button>
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={() => { navigator.clipboard.writeText(currentUrl).catch(()=>{}); setCopied(true); }}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2">
              <ExternalLink className="w-4 h-4" /> Copy URL
            </motion.button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ── Google Setup Error ────────────────────────────────────────────────────────
function GoogleSetupErrorScreen({ onBack, errorMsg }: { onBack: () => void; errorMsg: string }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-purple-950 flex items-center justify-center p-4 relative overflow-hidden">
      <AuthParticles />
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-lg z-10">
        <div className="glass border border-white/20 rounded-3xl p-8 shadow-2xl">
          <div className="text-center mb-6">
            <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 2, repeat: Infinity }}
              className="w-16 h-16 bg-red-500/20 border-2 border-red-400/40 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-red-300" />
            </motion.div>
            <h2 className="text-xl font-bold text-white mb-2">Google Sign-In Not Configured</h2>
            <p className="text-white/50 text-xs font-mono bg-black/30 rounded-lg px-3 py-1.5 inline-block">{errorMsg}</p>
          </div>
          <div className="space-y-3 mb-6">
            {[
              { title: 'Step 1 — Google Cloud Console', color: 'bg-blue-500/20 border-blue-400/30', tc: 'text-blue-300', steps: ['Go to console.cloud.google.com','Create/select a project','APIs & Services → OAuth consent screen → External','APIs & Services → Credentials → OAuth Client ID → Web app','Add Authorized redirect URI:'], code: 'https://YOUR-PROJECT.supabase.co/auth/v1/callback' },
              { title: 'Step 2 — Enable in Supabase', color: 'bg-green-500/20 border-green-400/30', tc: 'text-green-300', steps: ['Go to supabase.com → your project','Authentication → Providers → Google','Toggle ON "Enable Google provider"','Paste Client ID & Secret → Save'] },
              { title: 'Step 3 — Add Redirect URLs', color: 'bg-purple-500/20 border-purple-400/30', tc: 'text-purple-300', steps: ['Supabase → Authentication → URL Configuration','Site URL: http://localhost:5173','Redirect URLs — add both:'], code: 'http://localhost:5173\nhttps://your-app.vercel.app' },
            ].map(({ title, color, tc, steps, code }, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                className={`border rounded-2xl p-4 ${color}`}>
                <p className={`font-bold text-sm mb-2 ${tc}`}>{title}</p>
                <ol className="text-white/60 text-xs space-y-1 list-decimal list-inside">{steps.map((s, j) => <li key={j}>{s}</li>)}</ol>
                {code && <CopyBlock code={code} />}
              </motion.div>
            ))}
          </div>
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={onBack}
            className="w-full flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white py-3 rounded-xl font-semibold transition-all">
            <RefreshCw className="w-4 h-4" /> Back to Sign In
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Rate Limited Screen ───────────────────────────────────────────────────────
function RateLimitedScreen({ onBack, onGoogle }: { onBack: () => void; onGoogle: () => void }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-purple-950 flex items-center justify-center p-4 relative overflow-hidden">
      <AuthParticles />
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-lg z-10">
        <div className="glass border border-white/20 rounded-3xl p-8 shadow-2xl text-center">
          <motion.div animate={{ rotate: [0, 360] }} transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
            className="w-16 h-16 bg-amber-500/20 border-2 border-amber-400/40 rounded-full flex items-center justify-center mx-auto mb-5">
            <Clock className="w-8 h-8 text-amber-300" />
          </motion.div>
          <h2 className="text-2xl font-bold text-white mb-2">Email Rate Limit Reached</h2>
          <p className="text-white/60 mb-6 text-sm leading-relaxed">Supabase's free tier limits confirmation emails per hour.</p>
          <div className="space-y-3 text-left mb-6">
            {[
              { color: 'bg-green-500/20 border-green-400/30', tc: 'text-green-300', title: '⭐ Best Fix — Disable Email Confirmation', steps: ['Go to supabase.com → your project','Authentication → Providers → Email','Toggle OFF "Confirm email"','Save → sign up again ✅'] },
              { color: 'bg-blue-500/20 border-blue-400/30', tc: 'text-blue-300', title: '🔑 Use Google Login Instead', steps: ['Click "Continue with Google" below','Never rate limited, no email needed'] },
              { color: 'bg-white/10 border-white/20', tc: 'text-white/80', title: '⏳ Wait ~1 Hour', steps: ['Supabase resets the email limit hourly'] },
            ].map(({ color, tc, title, steps }, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
                className={`border rounded-2xl p-4 ${color}`}>
                <p className={`font-bold text-sm mb-1 ${tc}`}>{title}</p>
                <ul className="text-white/60 text-xs space-y-0.5 list-disc list-inside">{steps.map((s, j) => <li key={j}>{s}</li>)}</ul>
              </motion.div>
            ))}
          </div>
          <div className="flex gap-3">
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={onBack}
              className="flex-1 flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white py-3 rounded-xl font-semibold transition-all">
              <RefreshCw className="w-4 h-4" /> Back
            </motion.button>
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={onGoogle}
              className="flex-1 bg-white text-gray-800 py-3 rounded-xl font-semibold transition-all hover:bg-gray-100 flex items-center justify-center gap-2 shadow-lg">
              <GoogleIcon /> Try Google
            </motion.button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ── Confirm Email Screen ──────────────────────────────────────────────────────
function ConfirmEmailScreen({ email, onBack }: { email: string; onBack: () => void }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-purple-950 flex items-center justify-center p-4 relative overflow-hidden">
      <AuthParticles />
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-md text-center z-10">
        <div className="glass border border-white/20 rounded-3xl p-10 shadow-2xl">
          <motion.div
            animate={{ y: [0, -8, 0] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="w-16 h-16 bg-green-500/20 border-2 border-green-400/40 rounded-full flex items-center justify-center mx-auto mb-5">
            <Mail className="w-8 h-8 text-green-300" />
          </motion.div>
          <h2 className="text-2xl font-bold text-white mb-2">Check your email!</h2>
          <p className="text-white/60 mb-1 text-sm">We sent a confirmation link to</p>
          <p className="text-white font-bold text-base mb-6 break-all">{email}</p>
          <div className="bg-white/10 rounded-2xl p-4 mb-5 text-left space-y-2">
            {['Click the link in the email to confirm your account','Then come back here and sign in',"Check spam/junk if you don't see it"].map((t, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
                className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                <p className="text-white/70 text-sm">{t}</p>
              </motion.div>
            ))}
          </div>
          <div className="bg-amber-500/20 border border-amber-400/30 rounded-2xl p-3 mb-5 text-left">
            <p className="text-amber-300 text-xs font-semibold mb-1">💡 Skip Email Confirmation Entirely</p>
            <p className="text-amber-200 text-xs">Supabase → <strong>Authentication → Providers → Email</strong> → disable <strong>"Confirm email"</strong>.</p>
          </div>
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={onBack}
            className="w-full bg-white/20 hover:bg-white/30 text-white py-3 rounded-xl font-semibold transition-all">
            Back to Sign In
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Main Auth Page ────────────────────────────────────────────────────────────
export default function AuthPage() {
  const [mode, setMode]                   = useState<'signin' | 'signup'>('signin');
  const [email, setEmail]                 = useState('');
  const [password, setPassword]           = useState('');
  const [fullName, setFullName]           = useState('');
  const [showPassword, setShowPassword]   = useState(false);
  const [submitting, setSubmitting]       = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [screen, setScreen]               = useState<Screen>('auth');
  const [showAdminHelp, setShowAdminHelp] = useState(false);
  const [googleError, setGoogleError]     = useState('');
  const [currentUrl, setCurrentUrl]       = useState('');

  const { signIn, signUp, signInWithGoogle } = useAuth();

  useEffect(() => { setCurrentUrl(window.location.href); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSupabaseConfigured) { toast.error('Supabase is not connected. Add environment variables first.'); return; }
    setSubmitting(true);
    try {
      if (mode === 'signin') {
        const { error, notConfirmed } = await signIn(email, password);
        if (notConfirmed) toast.error('Please confirm your email first. Check your inbox.', { duration: 8000 });
        else if (error) {
          const msg = error.message.toLowerCase();
          if (msg.includes('rate limit') || msg.includes('too many')) setScreen('rate_limited');
          else if (msg.includes('invalid login') || msg.includes('invalid_credentials') || msg.includes('wrong password')) toast.error('Incorrect email or password. Please try again.');
          else toast.error(error.message);
        }
      } else {
        if (!fullName.trim()) { toast.error('Please enter your full name.'); setSubmitting(false); return; }
        if (password.length < 6) { toast.error('Password must be at least 6 characters.'); setSubmitting(false); return; }
        const { error, needsConfirmation, rateLimited, alreadyExists } = await signUp(email, password, fullName);
        if (rateLimited) setScreen('rate_limited');
        else if (alreadyExists) { toast.error('This email is already registered. Switching to Sign In...'); setMode('signin'); }
        else if (error) {
          const msg = error.message.toLowerCase();
          if (msg.includes('rate limit') || msg.includes('too many')) setScreen('rate_limited');
          else toast.error(error.message);
        } else if (needsConfirmation) setScreen('confirm');
        else toast.success('Account created! Welcome to SpendWise! 🎉');
      }
    } catch { toast.error('Something went wrong. Please try again.'); }
    setSubmitting(false);
  };

  const handleGoogle = async () => {
    if (!isSupabaseConfigured) { toast.error('Supabase is not connected. Add environment variables first.'); return; }
    setGoogleLoading(true);
    try {
      const { error, webViewDetected } = await signInWithGoogle();
      if (webViewDetected) { setScreen('webview_error'); setGoogleLoading(false); return; }
      if (error) {
        const msg = (error.message || '').toLowerCase();
        if (msg.includes('disallowed_useragent') || msg.includes('use secure browsers') || msg.includes('403')) { setScreen('webview_error'); setGoogleLoading(false); return; }
        if (msg.includes('provider is not enabled') || msg.includes('oauth') || msg.includes('not configured') || msg.includes('unsupported provider')) { setGoogleError(error.message); setScreen('google_setup_error'); setGoogleLoading(false); return; }
        toast.error('Google sign-in failed: ' + error.message);
        setGoogleLoading(false);
      }
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Google sign-in failed'); setGoogleLoading(false); }
  };

  if (screen === 'webview_error')      return <WebViewErrorScreen onBack={() => setScreen('auth')} currentUrl={currentUrl} />;
  if (screen === 'google_setup_error') return <GoogleSetupErrorScreen onBack={() => setScreen('auth')} errorMsg={googleError} />;
  if (screen === 'rate_limited')       return <RateLimitedScreen onBack={() => setScreen('auth')} onGoogle={() => { setScreen('auth'); handleGoogle(); }} />;
  if (screen === 'confirm')            return <ConfirmEmailScreen email={email} onBack={() => { setScreen('auth'); setMode('signin'); }} />;

  return (
    <>
      <AnimatePresence>{showAdminHelp && <AdminHelpModal key="admin-modal" onClose={() => setShowAdminHelp(false)} />}</AnimatePresence>

      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-purple-950 flex items-center justify-center p-4 relative overflow-hidden">
        {/* Animated background blobs */}
        <div className="absolute top-1/4 -left-20 w-80 h-80 bg-indigo-600/15 rounded-full blur-3xl animate-float-slow" />
        <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-purple-600/15 rounded-full blur-3xl animate-float-slow delay-500" />
        <div className="absolute top-3/4 left-1/4 w-60 h-60 bg-pink-600/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }} />
        <AuthParticles />

        {/* Animated grid lines */}
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: 'linear-gradient(rgba(99,102,241,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.5) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }} />

        <div className="w-full max-w-md z-10">
          {/* Logo area */}
          <motion.div
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="text-center mb-8"
          >
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-600/30 to-purple-700/30 border border-indigo-500/30 mb-4 shadow-2xl animate-pulse-glow"
            >
              <img src={logo} alt="SpendWise" className="w-12 h-12" />
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
              className="text-4xl font-bold text-white tracking-tight"
            >
              Spend<span className="gradient-text">Wise</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-white/40 mt-1 text-sm flex items-center justify-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              Smart Expense Tracking
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            </motion.p>
          </motion.div>

          {/* Supabase warning */}
          <AnimatePresence>
            {!isSupabaseConfigured && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-amber-500/20 border border-amber-400/40 rounded-2xl p-4 mb-4 flex gap-3"
              >
                <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-200">
                  <strong className="block text-amber-300 mb-0.5">Supabase Not Connected</strong>
                  Add <code className="bg-black/20 px-1 rounded text-xs">VITE_SUPABASE_URL</code> and <code className="bg-black/20 px-1 rounded text-xs">VITE_SUPABASE_ANON_KEY</code> to your <code className="bg-black/20 px-1 rounded text-xs">.env</code> file.
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Main Card */}
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.15, ease: 'easeOut' }}
            className="glass border border-white/20 rounded-3xl p-8 shadow-2xl"
          >
            {/* Mode tabs */}
            <div className="flex bg-white/10 rounded-xl p-1 mb-6 relative">
              <motion.div
                layoutId="tab-indicator"
                className="absolute inset-1 rounded-lg bg-white shadow-sm"
                style={{ width: 'calc(50% - 4px)', x: mode === 'signin' ? 0 : 'calc(100% + 0px)' }}
                transition={{ type: 'spring', stiffness: 400, damping: 35 }}
              />
              {(['signin', 'signup'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors relative z-10 ${mode === m ? 'text-indigo-900' : 'text-white/60 hover:text-white'}`}
                >
                  {m === 'signin' ? 'Sign In' : 'Sign Up'}
                </button>
              ))}
            </div>

            {/* Google button */}
            <motion.button
              whileHover={{ scale: 1.02, boxShadow: '0 8px 25px rgba(0,0,0,0.2)' }}
              whileTap={{ scale: 0.98 }}
              onClick={handleGoogle}
              disabled={submitting || googleLoading}
              className="w-full flex items-center justify-center gap-3 bg-white text-gray-700 py-3.5 rounded-xl font-medium hover:bg-gray-50 transition-all shadow-md disabled:opacity-60 disabled:cursor-not-allowed mb-5 btn-shimmer"
            >
              {googleLoading ? (
                <><motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-5 h-5 border-2 border-gray-300 border-t-gray-700 rounded-full" />
                  <span>Redirecting to Google…</span></>
              ) : (
                <><GoogleIcon /><span>Continue with Google</span></>
              )}
            </motion.button>

            {/* Divider */}
            <div className="flex items-center gap-3 mb-5">
              <div className="flex-1 h-px bg-white/20" />
              <span className="text-white/30 text-xs">or continue with email</span>
              <div className="flex-1 h-px bg-white/20" />
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <AnimatePresence mode="wait">
                {mode === 'signup' && (
                  <motion.div
                    key="fullname"
                    initial={{ opacity: 0, height: 0, y: -10 }}
                    animate={{ opacity: 1, height: 'auto', y: 0 }}
                    exit={{ opacity: 0, height: 0, y: -10 }}
                    transition={{ duration: 0.25 }}
                  >
                    <label className="block text-white/70 text-sm font-medium mb-1.5">Full Name</label>
                    <input
                      type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                      placeholder="Juan dela Cruz" autoComplete="name"
                      className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all hover:border-white/30"
                      required
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.div layout>
                <label className="block text-white/70 text-sm font-medium mb-1.5">Email Address</label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com" autoComplete="email"
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all hover:border-white/30"
                  required
                />
              </motion.div>

              <motion.div layout>
                <label className="block text-white/70 text-sm font-medium mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                    className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 pr-12 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all hover:border-white/30"
                    required minLength={6}
                  />
                  <motion.button
                    type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition-colors" tabIndex={-1}
                  >
                    <AnimatePresence mode="wait">
                      <motion.div key={showPassword ? 'off' : 'on'} initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0, rotate: 90 }} transition={{ duration: 0.15 }}>
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </motion.div>
                    </AnimatePresence>
                  </motion.button>
                </div>
                {mode === 'signup' && <p className="text-white/30 text-xs mt-1.5">Minimum 6 characters</p>}
              </motion.div>

              <motion.button
                type="submit"
                disabled={submitting || googleLoading}
                whileHover={{ scale: 1.02, boxShadow: '0 10px 30px rgba(99,102,241,0.4)' }}
                whileTap={{ scale: 0.98 }}
                className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white py-3.5 rounded-xl font-semibold transition-all shadow-lg shadow-indigo-500/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-1 btn-shimmer"
              >
                {submitting ? (
                  <><motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full" />
                    {mode === 'signin' ? 'Signing in…' : 'Creating account…'}</>
                ) : (
                  mode === 'signin' ? 'Sign In' : 'Create Account'
                )}
              </motion.button>
            </form>

            {/* Switch mode */}
            <p className="text-center text-white/40 text-sm mt-5">
              {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
              <button onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
                className="text-indigo-300 hover:text-white font-semibold transition-colors underline underline-offset-2">
                {mode === 'signin' ? 'Sign Up' : 'Sign In'}
              </button>
            </p>
          </motion.div>

          {/* Admin help */}
          <motion.button
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
            whileHover={{ scale: 1.02 }}
            onClick={() => setShowAdminHelp(true)}
            className="w-full mt-4 flex items-center justify-center gap-2 text-white/25 hover:text-white/50 text-xs transition-colors py-2"
          >
            <Info className="w-3.5 h-3.5" /> How to access the Admin Dashboard?
          </motion.button>

          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
            className="text-center text-white/15 text-xs mt-1">
            SpendWise © 2025 · Secured by Supabase
          </motion.p>
        </div>
      </div>
    </>
  );
}

// ── Google SVG icon ───────────────────────────────────────────────────────────
function GoogleIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}
