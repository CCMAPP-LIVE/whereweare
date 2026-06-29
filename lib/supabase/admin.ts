import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { requireEnv, SUPABASE_URL } from "@/lib/env";

/**
 * Service-role client. Bypasses Row Level Security — use ONLY in trusted
 * server code (route handlers, cron, server-side reads). Never import this
 * into a Client Component. This is the only client allowed to read
 * `calendar_oauth_tokens` (refresh tokens).
 */
export function createAdminClient() {
  return createClient<Database>(
    SUPABASE_URL,
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
