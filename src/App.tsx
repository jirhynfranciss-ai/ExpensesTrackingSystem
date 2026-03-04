import { useEffect, useRef, useState } from "react";
import { Toaster } from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";
import { AuthProvider, useAuth } from "./context/AuthContext";
import AuthPage       from "./pages/AuthPage";
import UserDashboard  from "./pages/user/UserDashboard";
import AdminDashboard from "./pages/admin/AdminDashboard";
import logo           from "./assets/logo.svg";

// ── Particles ─────────────────────────────────────────────────────────────────
const PARTICLE_DATA = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  size: (i % 4) * 1.5 + 2,
  left: (i * 17 + 5) % 100,
  delay: (i * 0.7) % 8,
  dur: (i % 4) * 1.5 + 6,
  color: [
    "rgba(99,102,241,0.6)",
    "rgba(168,85,247,0.5)",
    "rgba(236,72,153,0.4)",
    "rgba(16,185,129,0.4)",
  ][i % 4],
}));

function Particles() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {PARTICLE_DATA.map((p) => (
        <div
          key={p.id}
          className="particle"
          style={{
            width:  p.size,
            height: p.size,
            left:   `${p.left}%`,
            bottom: "-10px",
            backgroundColor:    p.color,
            animationDuration:  `${p.dur}s`,
            animationDelay:     `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

// ── Orbiting logo animation ───────────────────────────────────────────────────
function LogoOrbit() {
  return (
    <div className="relative w-28 h-28 mx-auto">
      <div className="absolute inset-0 rounded-full border border-indigo-500/20 animate-spin-slow" />
      <div
        className="absolute inset-3 rounded-full border border-purple-500/30"
        style={{ animation: "spin 5s linear infinite reverse" }}
      />
      {/* dot 1 */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{ animation: "spin 3s linear infinite" }}
      >
        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-indigo-400 rounded-full shadow-lg shadow-indigo-400/80" />
      </div>
      {/* dot 2 */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{ animation: "spin 4s linear infinite reverse" }}
      >
        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-purple-400 rounded-full shadow-lg shadow-purple-400/80" />
      </div>
      {/* dot 3 */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{ animation: "spin 5s linear infinite" }}
      >
        <div className="absolute top-1/2 -right-1 -translate-y-1/2 w-1.5 h-1.5 bg-pink-400 rounded-full shadow-lg shadow-pink-400/80" />
      </div>
      {/* center logo */}
      <div className="absolute inset-5 rounded-full bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center shadow-2xl animate-pulse-glow">
        <img src={logo} alt="SpendWise" className="w-10 h-10" />
      </div>
    </div>
  );
}

// ── Loading screen ────────────────────────────────────────────────────────────
function LoadingScreen({ message = "Loading…" }: { message?: string }) {
  const [dots, setDots] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setDots((d) => (d + 1) % 4), 400);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-purple-950 flex items-center justify-center relative overflow-hidden">
      {/* blobs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl animate-float-slow" />
      <div
        className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl animate-float-slow"
        style={{ animationDelay: "2s" }}
      />
      <Particles />

      <div className="text-center z-10 px-4">
        <LogoOrbit />

        <div className="mt-8">
          <h1 className="text-3xl font-bold text-white tracking-tight mb-1">
            Spend<span className="gradient-text">Wise</span>
          </h1>
          <p className="text-white/40 text-sm">Smart Expense Tracking</p>
        </div>

        <div className="mt-8">
          <p className="text-white/50 text-sm mb-4">
            {message}
            {".".repeat(dots)}
          </p>
          {/* wave bars */}
          <div className="flex items-end justify-center gap-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="w-1.5 bg-gradient-to-t from-indigo-500 to-purple-400 rounded-full animate-wave"
                style={{ height: "24px", animationDelay: `${i * 0.12}s` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Detect OAuth tokens in URL ────────────────────────────────────────────────
function hasOAuthPayload(): boolean {
  try {
    const h = window.location.hash;
    const s = window.location.search;
    return (
      h.includes("access_token=") ||
      h.includes("error=")        ||
      s.includes("code=")         ||
      s.includes("error=")
    );
  } catch {
    return false;
  }
}

// ── Page wrapper with animation ───────────────────────────────────────────────
const pageVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -10 },
};

const pageTransition = { duration: 0.3, ease: "easeInOut" as const };

// ── Inner app ─────────────────────────────────────────────────────────────────
function AppContent() {
  const { user, profile, loading } = useAuth();

  const wasOAuth  = useRef(hasOAuthPayload());
  const [oauthWait, setOauthWait] = useState(wasOAuth.current);

  useEffect(() => {
    if (!loading && oauthWait) {
      const t = setTimeout(() => setOauthWait(false), 600);
      return () => clearTimeout(t);
    }
  }, [loading, oauthWait]);

  const isLoading = loading || oauthWait;

  return (
    <AnimatePresence mode="wait">
      {isLoading ? (
        <motion.div
          key="loading"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <LoadingScreen
            message={
              oauthWait
                ? "Completing sign-in… please wait"
                : "Checking your session"
            }
          />
        </motion.div>
      ) : !user || !profile ? (
        <motion.div
          key="auth"
          variants={pageVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={pageTransition}
        >
          <AuthPage />
        </motion.div>
      ) : profile.role === "admin" ? (
        <motion.div
          key="admin"
          variants={pageVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={pageTransition}
        >
          <AdminDashboard />
        </motion.div>
      ) : (
        <motion.div
          key="user"
          variants={pageVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={pageTransition}
        >
          <UserDashboard />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
export function App() {
  return (
    <AuthProvider>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4500,
          style: {
            borderRadius: "14px",
            background:   "linear-gradient(135deg, #1e1b4b, #312e81)",
            color:        "#fff",
            fontSize:     "14px",
            border:       "1px solid rgba(99,102,241,0.3)",
            boxShadow:    "0 8px 30px rgba(0,0,0,0.3)",
          },
          success: {
            iconTheme: { primary: "#10B981", secondary: "#fff" },
            style: {
              background: "linear-gradient(135deg, #064e3b, #065f46)",
              border:     "1px solid rgba(16,185,129,0.3)",
            },
          },
          error: {
            iconTheme: { primary: "#EF4444", secondary: "#fff" },
            duration:  7000,
            style: {
              background: "linear-gradient(135deg, #450a0a, #7f1d1d)",
              border:     "1px solid rgba(239,68,68,0.3)",
            },
          },
        }}
      />
      <AppContent />
    </AuthProvider>
  );
}
