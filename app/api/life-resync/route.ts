import { NextResponse } from "next/server";
import { addDays, format, parseISO } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncDayToLifeCalendar } from "@/lib/google/lifeCalendar";
import { upsertSchoolEventOnLifeCalendar } from "@/lib/google/schoolEvents";
import { resyncWeekEvent } from "@/lib/weekEvents";
import { londonToday } from "@/lib/time";

export const maxDuration = 60;

/** Run `fn` over `items`, a few at a time (Google rate limits + time budget). */
async function pool<T>(items: T[], size: number, fn: (x: T) => Promise<boolean>) {
  let ok = 0;
  let failed = 0;
  for (let i = 0; i < items.length; i += size) {
    const results = await Promise.all(items.slice(i, i + size).map((x) => fn(x).catch(() => false)));
    for (const r of results) {
      if (r) ok++;
      else failed++;
    }
  }
  return { ok, failed };
}

/**
 * Backfill / repair the shared Life calendar from the app: re-sends every
 * event, school run and daily availability from a week ago to a year ahead
 * (both people). Idempotent — updates what's there, adds what's missing,
 * and the availability sync removes duplicates.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const today = londonToday();
  const from = format(addDays(parseISO(`${today}T12:00:00`), -7), "yyyy-MM-dd");
  const to = format(addDays(parseISO(`${today}T12:00:00`), 365), "yyyy-MM-dd");
  const started = Date.now();

  const [weekRes, schoolRes, availRes, timesRes, kidsRes, helpersRes, peopleRes] = await Promise.all([
    admin
      .from("week_events")
      .select("id, day, start_time, end_time, title, notes, kid_ids, assignee_user_id, helper_id, google_event_id")
      .gte("day", from)
      .lte("day", to),
    admin
      .from("school_events")
      .select("id, day, kind, time, kid_id, assignee_user_id, helper_id, notes, google_event_id")
      .gte("day", from)
      .lte("day", to),
    admin.from("availability").select("user_id, day").gte("day", from).lte("day", to),
    admin.from("day_times").select("user_id, day").gte("day", from).lte("day", to),
    admin.from("kids").select("id, name"),
    admin.from("helpers").select("id, name"),
    admin.from("profiles").select("id, display_name"),
  ]);

  const events = await pool(weekRes.data ?? [], 4, async (r) => {
    const res = await resyncWeekEvent(
      admin,
      r.id,
      {
        day: r.day,
        startTime: r.start_time?.slice(0, 5) ?? null,
        endTime: r.end_time?.slice(0, 5) ?? null,
        title: r.title,
        notes: r.notes,
        kidIds: r.kid_ids ?? [],
        assigneeUserId: r.assignee_user_id,
        helperId: r.helper_id,
      },
      r.google_event_id,
    );
    return res.lifeSynced;
  });

  const kidName = new Map((kidsRes.data ?? []).map((k) => [k.id, k.name]));
  const helperName = new Map((helpersRes.data ?? []).map((h) => [h.id, h.name]));
  const personName = new Map((peopleRes.data ?? []).map((p) => [p.id, p.display_name]));
  const school = await pool(schoolRes.data ?? [], 4, async (r) => {
    const id = await upsertSchoolEventOnLifeCalendar({
      id: r.id,
      day: r.day,
      kind: r.kind as "drop" | "pickup",
      time: r.time.slice(0, 5),
      kidName: kidName.get(r.kid_id) ?? "Kid",
      assigneeName: r.helper_id
        ? (helperName.get(r.helper_id) ?? null)
        : r.assignee_user_id
          ? (personName.get(r.assignee_user_id) ?? null)
          : null,
      notes: r.notes,
      googleEventId: r.google_event_id,
    });
    if (id && id !== r.google_event_id)
      await admin.from("school_events").update({ google_event_id: id }).eq("id", r.id);
    return !!id;
  });

  // One availability entry per person per day that has a status or out/back times.
  const personDays = [
    ...new Set([...(availRes.data ?? []), ...(timesRes.data ?? [])].map((r) => `${r.user_id}|${r.day}`)),
  ].map((k) => k.split("|") as [string, string]);
  const availability = await pool(personDays, 3, async ([userId, day]) => {
    if (Date.now() - started > 50_000) return false; // leave time to respond
    await syncDayToLifeCalendar(admin, userId, day);
    return true;
  });

  return NextResponse.json({
    ok: true,
    events,
    school,
    availability,
    partial: Date.now() - started > 50_000,
  });
}
