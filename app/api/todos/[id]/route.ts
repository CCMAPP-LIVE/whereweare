import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TODO_STATUSES, type TodoStatus } from "@/lib/constants";

const TITLE_MAX = 300;

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const admin = createAdminClient();

  const update: {
    title?: string;
    status?: TodoStatus;
    position?: number;
    assignee_user_id?: string | null;
    updated_at: string;
  } = { updated_at: new Date().toISOString() };

  if (typeof body.title === "string") {
    const title = body.title.trim().slice(0, TITLE_MAX);
    if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
    update.title = title;
  }

  // Moving to another column: drop the card at the bottom of the target column.
  if (TODO_STATUSES.includes(body.status)) {
    const status = body.status as TodoStatus;
    update.status = status;
    const { data: last } = await admin
      .from("todos")
      .select("position")
      .eq("status", status)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    update.position = (last?.position ?? -1) + 1;
  }

  if ("assigneeUserId" in body) {
    update.assignee_user_id =
      typeof body.assigneeUserId === "string" && body.assigneeUserId !== ""
        ? body.assigneeUserId
        : null;
  }

  const { error } = await admin.from("todos").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { error } = await admin.from("todos").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
