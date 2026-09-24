import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteWeekEvent, updateWeekEvent } from "@/lib/weekEvents";

const TITLE_MAX = 200;
const NOTES_MAX = 2000;
const TIME_RE = /^\d{2}:\d{2}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim().slice(0, TITLE_MAX) : "";
  const day = typeof body.day === "string" ? body.day : "";
  const startTime: string | null =
    typeof body.startTime === "string" && body.startTime !== "" ? body.startTime : null;
  const endTime: string | null =
    typeof body.endTime === "string" && body.endTime !== "" ? body.endTime : null;
  const notes: string | null =
    typeof body.notes === "string" ? body.notes.trim().slice(0, NOTES_MAX) || null : null;
  const helperId: string | null =
    typeof body.helperId === "string" && body.helperId !== "" ? body.helperId : null;
  const assigneeUserId: string | null =
    !helperId && typeof body.assigneeUserId === "string" && body.assigneeUserId !== ""
      ? body.assigneeUserId
      : null;
  const kidIds: string[] = Array.isArray(body.kidIds)
    ? body.kidIds.filter((x: unknown): x is string => typeof x === "string" && x !== "")
    : [];

  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
  if (!DAY_RE.test(day))
    return NextResponse.json({ error: "invalid day" }, { status: 400 });
  if (startTime && !TIME_RE.test(startTime))
    return NextResponse.json({ error: "invalid startTime" }, { status: 400 });
  if (endTime && !TIME_RE.test(endTime))
    return NextResponse.json({ error: "invalid endTime" }, { status: 400 });

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("week_events")
    .select("id, user_id, google_event_id")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (existing.user_id !== user.id)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const result = await updateWeekEvent(
      admin,
      id,
      { day, startTime, endTime, title, notes, assigneeUserId, helperId, kidIds },
      existing.google_event_id,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("week_events")
    .select("id, user_id, google_event_id")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ ok: true });
  if (existing.user_id !== user.id)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    await deleteWeekEvent(admin, id, existing.google_event_id);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
