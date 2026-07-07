import { NextResponse } from "next/server";
import { google } from "googleapis";
import { createClient } from "@/lib/supabase/server";
import { requireEnv } from "@/lib/env";

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
    ],
    state,
  });

  const res = NextResponse.redirect(url);
  res.cookies.set("g_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
