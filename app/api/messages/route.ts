import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push/send";
import { dayLabel } from "@/lib/time";

const BODY_MAX = 2000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("messages")
    .select("id, sender_id, recipient_id, body, day, created_at, read_at")
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

  const day =
    typeof requestBody.day === "string" && DAY_RE.test(requestBody.day)
      ? requestBody.day
      : null;

  const admin = createAdminClient();

  const requestedRecipientId =
    typeof requestBody.recipientId === "string" ? requestBody.recipientId : null;

  // Fall back to "whichever other profile exists" when the client doesn't send one.
  const recipientQuery = admin.from("profiles").select("id, display_name").neq("id", user.id);
  const { data: recipient } = requestedRecipientId
    ? await recipientQuery.eq("id", requestedRecipientId).maybeSingle()
    : await recipientQuery.limit(1).maybeSingle();
  if (!recipient)
    return NextResponse.json({ error: "no other person to message yet" }, { status: 400 });

  const { data: sender } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  const { data: inserted, error } = await admin
    .from("messages")
    .insert({ sender_id: user.id, recipient_id: recipient.id, body, day })
    .select("id, sender_id, recipient_id, body, day, created_at, read_at")
    .single();
  if (error || !inserted)
    return NextResponse.json({ error: error?.message ?? "insert failed" }, { status: 500 });

  const title = sender?.display_name?.trim() || "New message";
  await sendPushToUser(admin, recipient.id, {
    title: day ? `${title} · ${dayLabel(day).weekday} ${dayLabel(day).date}` : title,
    body,
    url: day ? `/plan?date=${day}` : "/messages",
  });

  return NextResponse.json({ ok: true, message: inserted });
}
