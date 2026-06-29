import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshCalendarsForUser } from "@/lib/calendars";
import type { Provider } from "@/lib/types";

/**
 * OAuth return point for both the initial Google sign-in and for linking
 * additional accounts (Outlook/Microsoft, or extra Google accounts).
 *
 * This is the ONE place Supabase exposes `provider_refresh_token`, so we
 * capture it here and persist it to `calendar_oauth_tokens` (service-role).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const provider = (url.searchParams.get("provider") as Provider) || "google";
  const next = url.searchParams.get("next") || "/";
  const origin = url.origin;

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  const session = data.session;
  const refreshToken = session.provider_refresh_token;

  if (refreshToken) {
    const supabaseProvider = provider === "microsoft" ? "azure" : "google";
    const identity = session.user.identities?.find(
      (i) => i.provider === supabaseProvider,
    );
    const email =
      (identity?.identity_data?.email as string | undefined) ??
      session.user.email ??
      null;

    const admin = createAdminClient();
    const { data: account } = await admin
      .from("calendar_accounts")
      .upsert(
        {
          user_id: session.user.id,
          provider,
          account_email: email,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,provider,account_email" },
      )
      .select("id")
      .single();

    if (account) {
      await admin.from("calendar_oauth_tokens").upsert(
        {
          calendar_account_id: account.id,
          refresh_token: refreshToken,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "calendar_account_id" },
      );
      // Best-effort: discover this account's calendars now.
      await refreshCalendarsForUser(admin, session.user.id).catch(() => {});
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
