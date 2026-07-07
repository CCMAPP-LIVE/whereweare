import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push/send";

const BODY_MAX = 2000;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("messages")
    .select("id, sender_id, recipient_id, body, created_at, read_at")
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, messages: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const requestBody = await request.json().catch(() => ({}));
  const body =
    typeof requestBody.body === "string" ? requestBody.body.trim().slice(0, BODY_MAX) : "";
  if (!body) return NextResponse.json({ error: "message required" }, { status: 400 });

  const admin = createAdminClient();

  // Two-person app: the recipient is whichever other profile exists.
  const { data: recipient } = await admin
    .from("profiles")
    .select("id, display_name")
    .neq("id", user.id)
    .limit(1)
    .maybeSingle();
  if (!recipient)
    return NextResponse.json({ error: "no other person to message yet" }, { status: 400 });

  const { data: sender } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  const { data: inserted, error } = await admin
    .from("messages")
    .insert({ sender_id: user.id, recipient_id: recipient.id, body })
    .select("id, sender_id, recipient_id, body, created_at, read_at")
    .single();
  if (error || !inserted)
    return NextResponse.json({ error: error?.message ?? "insert failed" }, { status: 500 });

  await sendPushToUser(admin, recipient.id, {
    title: sender?.display_name?.trim() || "New message",
    body,
    url: "/messages",
  });

  return NextResponse.json({ ok: true, message: inserted });
}
