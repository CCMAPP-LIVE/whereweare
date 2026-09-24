import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createWeekEvent } from "@/lib/weekEvents";

const TITLE_MAX = 200;
const NOTES_MAX = 2000;
const TIME_RE = /^\d{2}:\d{2}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: Request) {
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
  // A run is done by either an app user OR a helper (e.g. Joy), never both.
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
  try {
    const result = await createWeekEvent(admin, user.id, {
      day,
      startTime,
      endTime,
      title,
      notes,
      assigneeUserId,
      helperId,
      kidIds,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
