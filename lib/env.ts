/**
 * Centralised access to environment variables with clear errors when a
 * server-only secret is missing. Public values (NEXT_PUBLIC_*) are inlined by
 * Next at build time and safe to read directly in the browser.
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

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
