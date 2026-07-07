import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  deleteSchoolEventOnLifeCalendar,
  upsertSchoolEventOnLifeCalendar,
} from "@/lib/google/schoolEvents";

const TIME_RE = /^\d{2}:\d{2}$/;

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const time = typeof body.time === "string" ? body.time : "";
  const assigneeUserId: string | null =
    typeof body.assigneeUserId === "string" && body.assigneeUserId !== ""
      ? body.assigneeUserId
      : null;
  const helperId: string | null =
    typeof body.helperId === "string" && body.helperId !== "" ? body.helperId : null;
  const notes: string | null =
    typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) || null : null;

  if (!TIME_RE.test(time))
    return NextResponse.json({ error: "invalid time" }, { status: 400 });

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("school_events")
    .select("id, kid_id, day, kind, google_event_id")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { error: updateErr } = await admin
    .from("school_events")
    .update({
      time,
      assignee_user_id: helperId ? null : assigneeUserId,
      helper_id: helperId,
      notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  try {
    const [{ data: kidRow }, { data: assigneeRow }, { data: helperRow }] =
      await Promise.all([
        admin.from("kids").select("name").eq("id", existing.kid_id).maybeSingle(),
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
    const newGoogleEventId = await upsertSchoolEventOnLifeCalendar({
      id,
      day: existing.day,
      kind: existing.kind as "drop" | "pickup",
      time,
      kidName: kidRow?.name ?? "Kid",
      assigneeName,
      notes,
      googleEventId: existing.google_event_id,
    });
    if (newGoogleEventId && newGoogleEventId !== existing.google_event_id) {
      await admin
        .from("school_events")
        .update({ google_event_id: newGoogleEventId })
        .eq("id", id);
    }
  } catch {
    // Non-fatal.
  }

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

  const { data: existing } = await admin
    .from("school_events")
    .select("id, google_event_id")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ ok: true });

  if (existing.google_event_id) {
    try {
      await deleteSchoolEventOnLifeCalendar(existing.google_event_id);
    } catch {
      // Non-fatal.
    }
  }

  const { error } = await admin.from("school_events").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
