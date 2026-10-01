import { NextResponse } from "next/server";
import { google } from "googleapis";
import { createClient } from "@/lib/supabase/server";
import { requireEnv } from "@/lib/env";
import { WRITE_SCOPE } from "@/lib/booking";

/**
 * Start a direct Google OAuth flow to add a calendar account, INDEPENDENT of
 * the app's login identity. Supabase's linkIdentity refuses to attach more
 * than one Google account per user, so we capture the refresh token ourselves
 * and store it against the current user's calendar_accounts. This lets a user
 * connect any number of Google accounts (dmsco, jdmhomes, brainshed, …).
 */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  const redirectUri = `${origin}/api/connect-google/callback`;
  const oauth2 = new google.auth.OAuth2(
    requireEnv("GOOGLE_CLIENT_ID"),
    requireEnv("GOOGLE_CLIENT_SECRET"),
    redirectUri,
  );

  const state = crypto.randomUUID();
  const url = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent select_account", // force account picker + a refresh token
    scope: [
      "openid",
      "email",
      "https://www.googleapis.com/auth/calendar.readonly",
      // Create events on this account — used ONLY for booking-link meetings,
      // so their invites come from this address (brainshed, dmsco, …).
      WRITE_SCOPE,
    ],
    state,
  });

  // Where to land afterwards (e.g. back on /bookings). Same-site paths only.
  const next = new URL(request.url).searchParams.get("next") ?? "";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "";

  const res = NextResponse.redirect(url);
  const cookie = { httpOnly: true, secure: true, sameSite: "lax" as const, maxAge: 600, path: "/" };
  res.cookies.set("g_oauth_state", state, cookie);
  if (safeNext) res.cookies.set("g_oauth_next", safeNext, cookie);
  return res;
}
