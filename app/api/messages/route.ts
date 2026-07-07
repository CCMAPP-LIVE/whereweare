import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push/send";
import { dayLabel } from "@/lib/time";

const BODY_MAX = 2000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const day = new URL(request.url).searchParams.get("day");
  if (!day || !DAY_RE.test(day))
    return NextResponse.json({ error: "day required" }, { status: 400 });

  const { data, error } = await supabase
    .from("messages")
    .select("id, sender_id, recipient_id, body, day, created_at")
    .eq("day", day)
    .order("created_at", { ascending: true });
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
  if (!body) return NextResponse.json({ error: "comment required" }, { status: 400 });

  const day = typeof requestBody.day === "string" ? requestBody.day : "";
  if (!DAY_RE.test(day)) return NextResponse.json({ error: "invalid day" }, { status: 400 });

  const admin = createAdminClient();

  const { data: others } = await admin
    .from("profiles")
    .select("id, display_name")
    .neq("id", user.id);
  const { data: sender } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  // Shared per-day thread: recipient_id just needs to name someone else for
  // the FK; every other person gets notified regardless.
  const recipientId = others?.[0]?.id;
  if (!recipientId)
    return NextResponse.json({ error: "no other person to comment with yet" }, { status: 400 });

  const { data: inserted, error } = await admin
    .from("messages")
    .insert({ sender_id: user.id, recipient_id: recipientId, body, day })
    .select("id, sender_id, recipient_id, body, day, created_at")
    .single();
  if (error || !inserted)
    return NextResponse.json({ error: error?.message ?? "insert failed" }, { status: 500 });

  const { weekday, date } = dayLabel(day);
  const title = sender?.display_name?.trim() || "New comment";
  for (const other of others ?? []) {
    await sendPushToUser(admin, other.id, {
      title: `${title} · ${weekday} ${date}`,
      body,
      url: `/plan?date=${day}`,
    });
  }

  return NextResponse.json({ ok: true, message: inserted });
}
