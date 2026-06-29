import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Accept an invite: validate a single-use code, confirm the email matches the
 * invite, then create the account server-side (public sign-up is disabled in
 * Supabase, so this admin path is the only way in).
 */
export async function POST(request: Request) {
  const { code, name, email, password } = await request
    .json()
    .catch(() => ({}));

  const emailLower = String(email ?? "").trim().toLowerCase();
  if (!code || !emailLower || !password || String(password).length < 6) {
    return NextResponse.json(
      { error: "Please fill everything in (password must be 6+ characters)." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { data: invite } = await admin
    .from("invites")
    .select("id, used_by, email")
    .eq("code", String(code))
    .maybeSingle();

  if (!invite) {
    return NextResponse.json(
      { error: "This invite link isn’t valid." },
      { status: 400 },
    );
  }
  if (invite.used_by) {
    return NextResponse.json(
      { error: "This invite link has already been used." },
      { status: 400 },
    );
  }
  if (invite.email && invite.email.toLowerCase() !== emailLower) {
    return NextResponse.json(
      { error: "This invite was sent to a different email address." },
      { status: 400 },
    );
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: emailLower,
    password: String(password),
    email_confirm: true,
    user_metadata: { full_name: name ? String(name) : "" },
  });
  if (createErr || !created.user) {
    return NextResponse.json(
      { error: createErr?.message ?? "Could not create the account." },
      { status: 400 },
    );
  }

  await admin
    .from("invites")
    .update({ used_by: created.user.id, used_at: new Date().toISOString() })
    .eq("id", invite.id);

  return NextResponse.json({ ok: true });
}
