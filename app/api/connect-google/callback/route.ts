import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { google } from "googleapis";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireEnv } from "@/lib/env";
import { refreshCalendarsForUser } from "@/lib/calendars";

/** OAuth return point for the direct "add a Google calendar account" flow. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  const cookieStore = await cookies();
  const expected = cookieStore.get("g_oauth_state")?.value;
  if (!code || !state || !expected || state !== expected) {
    return NextResponse.redirect(`${origin}/settings?error=google_connect`);
  }

  const redirectUri = `${origin}/api/connect-google/callback`;
  const oauth2 = new google.auth.OAuth2(
    requireEnv("GOOGLE_CLIENT_ID"),
    requireEnv("GOOGLE_CLIENT_SECRET"),
    redirectUri,
  );

  let email: string | null = null;
  let refreshToken: string | null = null;
  try {
    const { tokens } = await oauth2.getToken(code);
    refreshToken = tokens.refresh_token ?? null;
    if (tokens.id_token) {
      const part = tokens.id_token.split(".")[1];
      const payload = JSON.parse(
        Buffer.from(part, "base64").toString("utf8"),
      ) as { email?: string };
      email = payload.email ?? null;
    }
    if (!email && tokens.access_token) {
      oauth2.setCredentials(tokens);
      const oi = google.oauth2({ version: "v2", auth: oauth2 });
      const me = await oi.userinfo.get();
      email = me.data.email ?? null;
    }
  } catch {
    return NextResponse.redirect(`${origin}/settings?error=google_token`);
  }

  if (!refreshToken) {
    // Google only returns a refresh token on first consent for an account.
    // prompt=consent forces it, but if the account was linked before with no
    // offline access, ask the user to remove app access and retry.
    return NextResponse.redirect(`${origin}/settings?error=no_refresh_token`);
  }

  const admin = createAdminClient();
  const { data: account } = await admin
    .from("calendar_accounts")
    .upsert(
      {
        user_id: user.id,
        provider: "google",
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
    await refreshCalendarsForUser(admin, user.id).catch(() => {});
  }

  const res = NextResponse.redirect(`${origin}/settings?connected=1`);
  res.cookies.set("g_oauth_state", "", { maxAge: 0, path: "/" });
  return res;
}
