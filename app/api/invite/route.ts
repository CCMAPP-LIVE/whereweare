import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";

/**
 * Create a single-use invite link locked to a specific email address. Only
 * that email can claim the invite at /api/join, so a forwarded or leaked
 * link is useless without access to that mailbox.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const note = body.note ? String(body.note).slice(0, 100) : null;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "Please give a valid email address." },
      { status: 400 },
    );
  }

  const code = randomUUID().replace(/-/g, "");

  const { error } = await supabase.from("invites").insert({
    code,
    email,
    note,
    created_by: user.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const origin = new URL(request.url).origin;
  return NextResponse.json({
    code,
    email,
    link: `${origin}/join?code=${code}`,
  });
}
