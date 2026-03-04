import { createClient } from "@supabase/supabase-js";

const supabaseUrl     = (import.meta.env.VITE_SUPABASE_URL     as string) || "https://ujwmmcfsctfdziijrcym.supabase.co";
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqd21tY2ZzY3RmZHppaWpyY3ltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1NTg4MzQsImV4cCI6MjA4ODEzNDgzNH0.0wQ1vAWPwmHBazRpK9uIYY5ewJkNsGISMypuyEDC9L8";

export const isSupabaseConfigured: boolean =
  supabaseUrl.length > 0 &&
  !supabaseUrl.includes("placeholder") &&
  supabaseAnonKey.length > 0 &&
  !supabaseAnonKey.includes("placeholder");

export const supabase = createClient(
  supabaseUrl     || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-anon-key",
  {
    auth: {
      autoRefreshToken:   true,
      persistSession:     true,
      detectSessionInUrl: true,
      flowType:           "implicit",
      storageKey:         "spendwise-auth",
    },
  }
);

/** Returns the correct redirect URL for OAuth — always uses current origin */
export function getRedirectUrl(): string {
  if (typeof window === "undefined") return "http://localhost:5173";
  return window.location.origin;
}

/** Removes OAuth tokens from the address bar after Supabase reads them */
export function cleanUrl(): void {
  try {
    const { hash, search, pathname } = window.location;
    const dirty =
      hash.includes("access_token")  ||
      hash.includes("refresh_token") ||
      hash.includes("type=signup")   ||
      hash.includes("type=recovery") ||
      hash.includes("error=")        ||
      search.includes("code=")       ||
      search.includes("error=")      ||
      search.includes("token=");
    if (dirty) {
      window.history.replaceState(null, "", pathname || "/");
    }
  } catch {
    // non-critical
  }
}
