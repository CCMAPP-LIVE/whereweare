/**
 * Centralised access to environment variables with clear errors when a
 * server-only secret is missing. Public values (NEXT_PUBLIC_*) are inlined by
 * Next at build time and safe to read directly in the browser.
 */

// Public Supabase values default to this project so the app renders even
// before Vercel env vars are set. The publishable/anon key is designed to be
// public (it ships in the browser bundle); env vars still override these.
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://gvmxwywuukzptvnttnzv.supabase.co";
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "sb_publishable_Rc5qhrNMyeVsDbIf7VuP_Q_0u81wTvf";

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. See README.md / .env.local.example.`,
    );
  }
  return value;
}

/** Best-effort site origin, used for OAuth redirects and notification links. */
export function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000")
  );
}
