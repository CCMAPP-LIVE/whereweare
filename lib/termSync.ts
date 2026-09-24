import { addDays, format, parseISO } from "date-fns";
import type { createAdminClient } from "@/lib/supabase/admin";
import { parseIcs } from "@/lib/ics";
import { createWeekEvent, deleteWeekEvent } from "@/lib/weekEvents";
import { londonToday } from "@/lib/time";

/**
 * Keep "🏫 …" school-calendar days in step with a school's .ics feed for the
 * given children: add new dates and (with `prune`) remove future ones the
 * school has moved or cancelled. Used by Settings (manual import / Refresh
 * now) and the Sunday refresh of SCHOOL_CALENDARS.
 */
type Admin = ReturnType<typeof createAdminClient>;

export const SCHOOL_NOTE = "School calendar";

/** Configured feeds: SCHOOL_CALENDARS='[{"name":"Mudeford Infants","url":"…","kids":["Percy"]}]' */
export function configuredSchools(): { name: string; url: string; kids: string[] }[] {
  try {
    const v = JSON.parse(process.env.SCHOOL_CALENDARS ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x?.url === "string") : [];
  } catch {
    return [];
  }
}

export async function fetchIcs(rawUrl: string): Promise<string> {
  const url = rawUrl.trim().replace(/^webcal:/i, "https:");
  if (!/^https:\/\//i.test(url)) throw new Error("Use an https:// or webcal:// link");
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error("Couldn't download that calendar link");
  const text = (await res.text()).slice(0, 2_000_000);
  if (!/BEGIN:VCALENDAR/i.test(text))
    throw new Error("That doesn't look like a calendar (.ics) file");
  return text;
}

export async function syncSchoolCalendar(
  admin: Admin,
  ownerId: string,
  ics: string,
  kidIds: string[],
  opts: { prune: boolean },
): Promise<{ added: number; removed: number; remaining: number }> {
  const today = londonToday();
  const horizon = format(addDays(parseISO(`${today}T12:00:00`), 400), "yyyy-MM-dd");
  const kidKey = [...kidIds].sort().join(",");

  // What the school's feed says: one entry per school day. Weekends inside a
  // holiday are skipped (single-day entries kept even on a weekend); long
  // holidays up to 60 days; repeated feed entries ignored.
  const wanted = new Map<string, { title: string; day: string }>();
  for (const ev of parseIcs(ics)) {
    const title = `🏫 ${ev.title}`.slice(0, 200);
    const multiDay = addDays(parseISO(`${ev.start}T12:00:00`), 1) < parseISO(`${ev.end}T12:00:00`);
    let d = ev.start;
    for (let i = 0; d < ev.end && i < 60; i++) {
      const weekday = parseISO(`${d}T12:00:00`).getDay();
      if (d >= today && d <= horizon && !(multiDay && (weekday === 0 || weekday === 6)))
        wanted.set(`${title}|${d}`, { title, day: d });
      d = format(addDays(parseISO(`${d}T12:00:00`), 1), "yyyy-MM-dd");
    }
  }

  // What we already have for exactly these children.
  const { data: existing } = await admin
    .from("week_events")
    .select("id, title, day, kid_ids, notes, google_event_id")
    .like("title", "🏫 %")
    .gte("day", today);
  const mine = (existing ?? []).filter((e) => [...(e.kid_ids ?? [])].sort().join(",") === kidKey);
  const have = new Set(mine.map((e) => `${e.title}|${e.day}`));

  const started = Date.now();
  let removed = 0;
  if (opts.prune) {
    const stale = mine.filter((e) => e.notes === SCHOOL_NOTE && !wanted.has(`${e.title}|${e.day}`));
    for (const e of stale) {
      await deleteWeekEvent(admin, e.id, e.google_event_id).catch(() => {});
      removed++;
    }
  }

  const todo = [...wanted.entries()].filter(([k]) => !have.has(k)).map(([, v]) => v);
  let added = 0;
  for (let i = 0; i < todo.length; i += 4) {
    if (Date.now() - started > 45_000) break;
    await Promise.all(
      todo.slice(i, i + 4).map((t) =>
        createWeekEvent(admin, ownerId, {
          title: t.title,
          day: t.day,
          startTime: null,
          endTime: null,
          notes: SCHOOL_NOTE,
          kidIds,
          assigneeUserId: null,
          helperId: null,
        })
          .then(() => added++)
          .catch(() => {}),
      ),
    );
  }
  return { added, removed, remaining: Math.max(0, todo.length - added) };
}

/** Refresh every configured school feed (Sunday cron / "Refresh now"). */
export async function refreshConfiguredSchools(admin: Admin, ownerId: string) {
  const { data: kids } = await admin.from("kids").select("id, name");
  const results: { name: string; added: number; removed: number; error?: string }[] = [];
  for (const s of configuredSchools()) {
    const kidIds = (kids ?? [])
      .filter((k) => s.kids.some((n) => n.toLowerCase() === k.name.toLowerCase()))
      .map((k) => k.id);
    try {
      const ics = await fetchIcs(s.url);
      const r = await syncSchoolCalendar(
        admin,
        ownerId,
        ics,
        kidIds.length ? kidIds : (kids ?? []).map((k) => k.id),
        {
          prune: true,
        },
      );
      results.push({ name: s.name, ...r });
    } catch (e) {
      results.push({ name: s.name, added: 0, removed: 0, error: (e as Error).message });
    }
  }
  return results;
}
