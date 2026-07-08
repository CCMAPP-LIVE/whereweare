import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push/send";

const BODY_MAX = 2000;

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("todo_comments")
    .select("id, sender_id, body, created_at")
    .eq("todo_id", id)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, comments: data ?? [] });
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const requestBody = await request.json().catch(() => ({}));
  const body =
    typeof requestBody.body === "string"
      ? requestBody.body.trim().slice(0, BODY_MAX)
      : "";
  if (!body) return NextResponse.json({ error: "comment required" }, { status: 400 });

  const admin = createAdminClient();

  const { data: todo } = await admin
    .from("todos")
    .select("title")
    .eq("id", id)
    .maybeSingle();
  if (!todo) return NextResponse.json({ error: "card not found" }, { status: 404 });

  const { data: inserted, error } = await admin
    .from("todo_comments")
    .insert({ todo_id: id, sender_id: user.id, body })
    .select("id, sender_id, body, created_at")
    .single();
  if (error || !inserted)
    return NextResponse.json({ error: error?.message ?? "insert failed" }, { status: 500 });

  // Notify everyone else — mirrors day comments' notify-the-household pattern.
  const [{ data: sender }, { data: others }] = await Promise.all([
    admin.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    admin.from("profiles").select("id").neq("id", user.id),
  ]);
  const title = sender?.display_name?.trim() || "New comment";
  for (const other of others ?? []) {
    await sendPushToUser(admin, other.id, {
      title: `${title} · ${todo.title}`,
      body,
      url: "/todos",
    });
  }

  return NextResponse.json({ ok: true, comment: inserted });
}
