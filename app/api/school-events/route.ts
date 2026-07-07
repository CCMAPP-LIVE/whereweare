import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { upsertSchoolEventOnLifeCalendar } from "@/lib/google/schoolEvents";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const kidId = typeof body.kidId === "string" ? body.kidId : "";
  const day = typeof body.day === "string" ? body.day : "";
  const kind = typeof body.kind === "string" ? body.kind : "";
  const time = typeof body.time === "string" ? body.time : "";
  const assigneeUserId: string | null =
    typeof body.assigneeUserId === "string" && body.assigneeUserId !== ""
      ? body.assigneeUserId
      : null;
  const helperId: string | null =
    typeof body.helperId === "string" && body.helperId !== "" ? body.helperId : null;
  const notes: string | null =
    typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) || null : null;

  if (!kidId) return NextResponse.json({ error: "kidId required" }, { status: 400 });
  if (!DAY_RE.test(day))
    return NextResponse.json({ error: "invalid day" }, { status: 400 });
  if (kind !== "drop" && kind !== "pickup")
    return NextResponse.json({ error: "invalid kind" }, { status: 400 });
  if (!TIME_RE.test(time))
    return NextResponse.json({ error: "invalid time" }, { status: 400 });

  const admin = createAdminClient();

  const { data: inserted, error } = await admin
    .from("school_events")
    .insert({
      kid_id: kidId,
      day,
      kind,
      time,
      assignee_user_id: helperId ? null : assigneeUserId,
      helper_id: helperId,
      notes,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !inserted)
    return NextResponse.json({ error: error?.message ?? "insert failed" }, { status: 500 });

  try {
    const [{ data: kidRow }, { data: assigneeRow }, { data: helperRow }] =
      await Promise.all([
        admin.from("kids").select("name").eq("id", kidId).maybeSingle(),
        !helperId && assigneeUserId
          ? admin
              .from("profiles")
              .select("display_name")
              .eq("id", assigneeUserId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        helperId
          ? admin.from("helpers").select("name").eq("id", helperId).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
    const assigneeName =
      helperRow?.name ?? assigneeRow?.display_name ?? null;
    const googleEventId = await upsertSchoolEventOnLifeCalendar({
      id: inserted.id,
      day,
      kind,
      time,
      kidName: kidRow?.name ?? "Kid",
      assigneeName,
      notes,
      googleEventId: null,
    });
    if (googleEventId) {
      await admin
        .from("school_events")
        .update({ google_event_id: googleEventId })
        .eq("id", inserted.id);
    }
  } catch {
    // Non-fatal; row is source of truth.
  }

  return NextResponse.json({ ok: true, id: inserted.id });
}
