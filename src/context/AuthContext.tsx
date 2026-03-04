import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { supabase, getRedirectUrl, cleanUrl } from "../lib/supabase";
import type { Session, User } from "@supabase/supabase-js";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: "admin" | "user";
  is_active: boolean;
  monthly_budget: number | null;
  created_at: string;
  updated_at: string;
}

interface AuthCtx {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signUp: (
    email: string,
    password: string,
    fullName: string
  ) => Promise<{
    error: Error | null;
    needsConfirmation?: boolean;
    rateLimited?: boolean;
    alreadyExists?: boolean;
  }>;
  signIn: (
    email: string,
    password: string
  ) => Promise<{
    error: Error | null;
    notConfirmed?: boolean;
    rateLimited?: boolean;
  }>;
  signInWithGoogle: () => Promise<{
    error: Error | null;
    webViewDetected?: boolean;
  }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx | undefined>(undefined);

// ── Helpers ───────────────────────────────────────────────────────────────────
async function fetchProfile(userId: string): Promise<Profile | null> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    if (error || !data) return null;
    return data as Profile;
  } catch {
    return null;
  }
}

async function upsertProfile(user: User): Promise<void> {
  try {
    await supabase.from("profiles").upsert(
      {
        id:         user.id,
        email:      user.email ?? "",
        full_name:
          user.user_metadata?.full_name ??
          user.user_metadata?.name ??
          user.email?.split("@")[0] ??
          "User",
        avatar_url:
          user.user_metadata?.avatar_url ??
          user.user_metadata?.picture ??
          null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id", ignoreDuplicates: false }
    );
  } catch {
    // Table may not exist yet — silently ignore
  }
}

function parseAuthError(err: unknown) {
  const msg    = ((err as { message?: string })?.message ?? "").toLowerCase();
  const status = (err as { status?: number })?.status ?? 0;
  return {
    rateLimited:   msg.includes("rate limit") || msg.includes("too many") || msg.includes("over_email_send_rate_limit") || status === 429,
    notConfirmed:  msg.includes("email not confirmed") || msg.includes("email_not_confirmed"),
    alreadyExists: msg.includes("already registered") || msg.includes("user already registered"),
    invalidCreds:  msg.includes("invalid login") || msg.includes("invalid_credentials") || msg.includes("wrong password"),
  };
}

// ── Provider ──────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,    setUser]    = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const mounted  = useRef(true);
  const resolved = useRef(false);

  /** Clears the loading state — fires exactly once */
  const done = useCallback(() => {
    if (resolved.current || !mounted.current) return;
    resolved.current = true;
    setLoading(false);
  }, []);

  const loadProfile = useCallback(async (u: User) => {
    await upsertProfile(u);
    const p = await fetchProfile(u.id);
    if (mounted.current && p) setProfile(p);
  }, []);

  useEffect(() => {
    mounted.current  = true;
    resolved.current = false;

    // Hard safety net — UI always unblocks within 7 seconds
    const safety = setTimeout(done, 7000);

    // 1. Subscribe to auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, sess) => {
      cleanUrl();
      if (!mounted.current) return;

      if (sess?.user) {
        setSession(sess);
        setUser(sess.user);
        try { await loadProfile(sess.user); } catch { /* ignore */ }
      } else {
        setSession(null);
        setUser(null);
        setProfile(null);
      }
      done();
    });

    // 2. Check for an existing session (covers page refresh & OAuth return)
    supabase.auth
      .getSession()
      .then(async ({ data: { session: s } }) => {
        cleanUrl();
        if (!mounted.current) return;
        if (s?.user) {
          setSession(s);
          setUser(s.user);
          try { await loadProfile(s.user); } catch { /* ignore */ }
        }
        done();
      })
      .catch(() => done());

    return () => {
      mounted.current = false;
      clearTimeout(safety);
      subscription.unsubscribe();
    };
  }, [done, loadProfile]);

  // ── refreshProfile ──────────────────────────────────────────────────────────
  const refreshProfile = useCallback(async () => {
    if (!user || !mounted.current) return;
    const p = await fetchProfile(user.id);
    if (mounted.current && p) setProfile(p);
  }, [user]);

  // ── signUp ──────────────────────────────────────────────────────────────────
  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: getRedirectUrl(),
        },
      });
      if (error) {
        const c = parseAuthError(error);
        if (c.rateLimited)   return { error: error as unknown as Error, rateLimited: true };
        if (c.alreadyExists) return { error: error as unknown as Error, alreadyExists: true };
        return { error: error as unknown as Error };
      }
      return { error: null, needsConfirmation: !data.session };
    } catch (err) {
      const c = parseAuthError(err);
      if (c.rateLimited) return { error: err as Error, rateLimited: true };
      return { error: err as Error };
    }
  };

  // ── signIn ──────────────────────────────────────────────────────────────────
  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        const c = parseAuthError(error);
        if (c.notConfirmed) return { error: error as unknown as Error, notConfirmed: true };
        if (c.rateLimited)  return { error: error as unknown as Error, rateLimited: true };
        return { error: error as unknown as Error };
      }
      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  // ── Google OAuth ────────────────────────────────────────────────────────────
  const signInWithGoogle = async () => {
    try {
      const ua = navigator.userAgent || "";
      const isWebView =
        /\bwv\b/.test(ua)                                     ||
        ua.includes("WebView")                                ||
        (ua.includes("iPhone") && !ua.includes("Safari"))    ||
        (ua.includes("iPad")   && !ua.includes("Safari"))    ||
        ua.includes("FBAN")   || ua.includes("FBAV")         ||
        ua.includes("Instagram") || ua.includes("Twitter")   ||
        ua.includes("Electron");

      if (isWebView) {
        return {
          error: new Error("Please open in Chrome or Safari to use Google Sign-In."),
          webViewDetected: true,
        };
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo:  getRedirectUrl(),
          queryParams: { access_type: "offline", prompt: "select_account" },
        },
      });

      if (error) return { error: error as unknown as Error };
      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  // ── signOut ─────────────────────────────────────────────────────────────────
  const signOut = async () => {
    try { await supabase.auth.signOut(); } catch { /* ignore */ }
    setUser(null);
    setSession(null);
    setProfile(null);
    cleanUrl();
  };

  return (
    <AuthContext.Provider
      value={{
        user, session, profile, loading,
        signUp, signIn, signInWithGoogle, signOut, refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
