import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { upsertWeekEventOnLifeCalendar } from "@/lib/google/weekEvents";

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
  const assigneeUserId: string | null =
    typeof body.assigneeUserId === "string" && body.assigneeUserId !== ""
      ? body.assigneeUserId
      : null;
  const kidId: string | null =
    typeof body.kidId === "string" && body.kidId !== "" ? body.kidId : null;

  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
  if (!DAY_RE.test(day))
    return NextResponse.json({ error: "invalid day" }, { status: 400 });
  if (startTime && !TIME_RE.test(startTime))
    return NextResponse.json({ error: "invalid startTime" }, { status: 400 });
  if (endTime && !TIME_RE.test(endTime))
    return NextResponse.json({ error: "invalid endTime" }, { status: 400 });

  const admin = createAdminClient();

  const { data: inserted, error: insertErr } = await admin
    .from("week_events")
    .insert({
      user_id: user.id,
      day,
      start_time: startTime,
      end_time: endTime,
      title,
      notes,
      assignee_user_id: assigneeUserId,
      kid_id: kidId,
    })
    .select("id")
    .single();
  if (insertErr || !inserted)
    return NextResponse.json({ error: insertErr?.message ?? "insert failed" }, { status: 500 });

  // Best-effort Life Calendar sync.
  let lifeSynced = true;
  let warning: string | undefined;
  try {
    const [assigneeRes, kidRes] = await Promise.all([
      assigneeUserId
        ? admin
            .from("profiles")
            .select("display_name")
            .eq("id", assigneeUserId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      kidId
        ? admin.from("kids").select("name").eq("id", kidId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const assigneeName = assigneeRes.data?.display_name ?? null;
    const kidName = kidRes.data?.name ?? null;
    const googleEventId = await upsertWeekEventOnLifeCalendar({
      id: inserted.id,
      day,
      startTime,
      endTime,
      title,
      notes,
      kidName,
      assigneeName,
      googleEventId: null,
    });
    if (googleEventId) {
      await admin
        .from("week_events")
        .update({ google_event_id: googleEventId })
        .eq("id", inserted.id);
    }
  } catch (e) {
    lifeSynced = false;
    warning = (e as Error).message;
  }

  return NextResponse.json({ ok: true, id: inserted.id, lifeSynced, warning });
}
