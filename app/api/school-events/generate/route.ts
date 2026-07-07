import { NextResponse } from "next/server";
import { addDays, parseISO, format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { upsertSchoolEventOnLifeCalendar } from "@/lib/google/schoolEvents";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Materialise this week's school events from the defaults template.
 * Idempotent (unique on kid_id, day, kind) — running twice is a no-op for
 * unchanged rows. Only creates new events; anything already there stays put
 * (so hand-edits survive a re-generate).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const weekStart = typeof body.weekStart === "string" ? body.weekStart : "";
  if (!DAY_RE.test(weekStart))
    return NextResponse.json({ error: "invalid weekStart" }, { status: 400 });

  const admin = createAdminClient();

  const { data: defaults, error: defErr } = await admin
    .from("school_defaults")
    .select("kid_id, weekday, kind, time, default_assignee_user_id, active");
  if (defErr) return NextResponse.json({ error: defErr.message }, { status: 500 });
  const activeDefaults = (defaults ?? []).filter((d) => d.active);

  if (activeDefaults.length === 0)
    return NextResponse.json({ ok: true, created: 0 });

  const monday = parseISO(`${weekStart}T12:00:00`);
  const rows = activeDefaults.map((d) => ({
    kid_id: d.kid_id,
    day: format(addDays(monday, d.weekday), "yyyy-MM-dd"),
    kind: d.kind,
    time: d.time,
    assignee_user_id: d.default_assignee_user_id,
    created_by: user.id,
  }));

  // Existing rows for this week — used to skip Life Calendar sync for any
  // that were already synced (idempotent regenerate).
  const days = rows.map((r) => r.day);
  const { data: existingRows } = await admin
    .from("school_events")
    .select("id, kid_id, day, kind, google_event_id")
    .in("day", days);
  const existingKey = new Set(
    (existingRows ?? []).map((r) => `${r.kid_id}|${r.day}|${r.kind}`),
  );

  const toInsert = rows.filter(
    (r) => !existingKey.has(`${r.kid_id}|${r.day}|${r.kind}`),
  );

  if (toInsert.length === 0) return NextResponse.json({ ok: true, created: 0 });

  const { data: inserted, error: insErr } = await admin
    .from("school_events")
    .insert(toInsert)
    .select("id, kid_id, day, kind, time, assignee_user_id, notes");
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  // Resolve names once, then push to Life Calendar.
  const kidIds = [...new Set((inserted ?? []).map((r) => r.kid_id))];
  const assigneeIds = [
    ...new Set(
      (inserted ?? [])
        .map((r) => r.assignee_user_id)
        .filter((x): x is string => !!x),
    ),
  ];

  const [{ data: kidRows }, { data: profileRows }] = await Promise.all([
    kidIds.length
      ? admin.from("kids").select("id, name").in("id", kidIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    assigneeIds.length
      ? admin.from("profiles").select("id, display_name").in("id", assigneeIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string | null }[] }),
  ]);
  const kidName = new Map((kidRows ?? []).map((k) => [k.id, k.name]));
  const assigneeName = new Map(
    (profileRows ?? []).map((p) => [p.id, p.display_name ?? "Someone"]),
  );

  let syncFailures = 0;
  await Promise.all(
    (inserted ?? []).map(async (r) => {
      try {
        const googleEventId = await upsertSchoolEventOnLifeCalendar({
          id: r.id,
          day: r.day,
          kind: r.kind as "drop" | "pickup",
          time: r.time.slice(0, 5),
          kidName: kidName.get(r.kid_id) ?? "Kid",
          assigneeName: r.assignee_user_id
            ? assigneeName.get(r.assignee_user_id) ?? null
            : null,
          notes: r.notes,
          googleEventId: null,
        });
        if (googleEventId) {
          await admin
            .from("school_events")
            .update({ google_event_id: googleEventId })
            .eq("id", r.id);
        }
      } catch {
        syncFailures++;
      }
    }),
  );

  return NextResponse.json({
    ok: true,
    created: inserted?.length ?? 0,
    syncFailures,
  });
}
