import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TODO_STATUSES, type TodoStatus } from "@/lib/constants";

const TITLE_MAX = 300;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const title =
    typeof body.title === "string" ? body.title.trim().slice(0, TITLE_MAX) : "";
  const status: TodoStatus = TODO_STATUSES.includes(body.status)
    ? body.status
    : "todo";
  const assigneeUserId: string | null =
    typeof body.assigneeUserId === "string" && body.assigneeUserId !== ""
      ? body.assigneeUserId
      : null;

  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

  const admin = createAdminClient();

  // New cards land at the bottom of their column: next position = max + 1.
  const { data: last } = await admin
    .from("todos")
    .select("position")
    .eq("status", status)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPosition = (last?.position ?? -1) + 1;

  const { data: inserted, error } = await admin
    .from("todos")
    .insert({
      title,
      status,
      position: nextPosition,
      assignee_user_id: assigneeUserId,
      created_by: user.id,
    })
    .select("id, title, status, position, assignee_user_id, created_by")
    .single();
  if (error || !inserted)
    return NextResponse.json(
      { error: error?.message ?? "insert failed" },
      { status: 500 },
    );

  return NextResponse.json({ ok: true, todo: inserted });
}

// Bulk-clear a whole column (e.g. "Clear done"), so finished cards don't pile
// up forever. Scoped to a single valid status; no status = nothing cleared.
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const status = body.status as TodoStatus;
  if (!TODO_STATUSES.includes(status))
    return NextResponse.json({ error: "invalid status" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("todos").delete().eq("status", status);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
