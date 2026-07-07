import { NextResponse } from "next/server";
import { google } from "googleapis";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { googleUserAuth } from "@/lib/google/auth";

/**
 * TEMPORARY diagnostic: surfaces the real Google API result/error for the
 * logged-in user's connected Google accounts, so we can see why calendar
 * events aren't loading (token refresh failure, wrong identity, empty range,
 * etc.). Auth-required; returns only this user's own data. Delete after use.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: accounts } = await admin
    .from("calendar_accounts")
    .select("id, provider, account_email")
    .eq("user_id", user.id)
    .eq("provider", "google");

  const out: unknown[] = [];

  for (const acc of accounts ?? []) {
    const { data: tok } = await admin
      .from("calendar_oauth_tokens")
      .select("refresh_token")
      .eq("calendar_account_id", acc.id)
      .maybeSingle();

    const accResult: Record<string, unknown> = {
      account_email: acc.account_email,
      has_token: Boolean(tok?.refresh_token),
    };

    if (tok?.refresh_token) {
      const auth = googleUserAuth(tok.refresh_token);
      // 1. Can we even mint an access token (client id/secret match)?
      try {
        const at = await auth.getAccessToken();
        accResult.token_refresh = at.token ? "ok" : "empty";
        // Whose identity is this token?
        try {
          const info = await fetch(
            `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${at.token}`,
          ).then((r) => r.json());
          accResult.token_identity = info.email ?? info.error ?? "(unknown)";
        } catch {
          accResult.token_identity = "(tokeninfo failed)";
        }
      } catch (e) {
        accResult.token_refresh = `FAILED: ${(e as Error).message}`;
        out.push(accResult);
        continue;
      }

      const cal = google.calendar({ version: "v3", auth });
      // 2. Read the enabled calendars for this account + count events.
      const { data: cals } = await admin
        .from("calendars")
        .select("external_id, summary, label, enabled")
        .eq("calendar_account_id", acc.id)
        .eq("enabled", true);

      const perCal: unknown[] = [];
      for (const c of cals ?? []) {
        try {
          const evs = await cal.events.list({
            calendarId: c.external_id,
            timeMin: "2026-06-25T00:00:00Z",
            timeMax: "2026-07-20T00:00:00Z",
            singleEvents: true,
            maxResults: 15,
          });
          perCal.push({
            external_id: c.external_id,
            label: c.label ?? c.summary,
            count: (evs.data.items ?? []).length,
            sample: (evs.data.items ?? [])
              .slice(0, 5)
              .map((e) => e.summary ?? "(no title)"),
          });
        } catch (e) {
          perCal.push({
            external_id: c.external_id,
            label: c.label ?? c.summary,
            error: (e as Error).message,
          });
        }
      }
      accResult.enabled_calendars = perCal;
    }

    out.push(accResult);
  }

  const payload = { user_email: user.email, accounts: out };
  // Also emit to runtime logs so the result is retrievable server-side.
  console.log("DEBUG_CALENDARS_RESULT " + JSON.stringify(payload));
  return NextResponse.json(payload, { status: 200 });
}
