import { format, parseISO } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEventsForUser } from "@/lib/calendars";
import { daysForView, nextDay, rangeOfDays } from "@/lib/time";
import { APP_TIMEZONE, SLOTS, STATUS_MAP } from "@/lib/constants";
import type { NormalizedEvent, Slot, Status } from "@/lib/types";

/**
 * Builds the week sheet used by /print (signed in) and the shared read-only
 * link /week/<token> (Joy, grandparents): school runs, plans, where everyone
 * is and optionally work/other calendars, for everyone or one person/child.
 */

export type Line = { time: string; text: string; tag?: string };
export const INCLUDE_KEYS = ["school", "events", "where", "calendars"] as const;
export type IncludeKey = (typeof INCLUDE_KEYS)[number];

function timeOf(ev: NormalizedEvent): string {
  if (ev.allDay) return "All day";
  if (ev.provider === "google") return formatInTimeZone(new Date(ev.start), APP_TIMEZONE, "HH:mm");
  return ev.start.slice(11, 16);
}
function daysOf(ev: NormalizedEvent): string[] {
  if (ev.allDay) {
    const keys: string[] = [];
    let d = ev.start.slice(0, 10);
    const end = ev.end.slice(0, 10);
    while (d < end) {
      keys.push(d);
      d = nextDay(d);
    }
    return keys.length ? keys : [ev.start.slice(0, 10)];
  }
  if (ev.provider === "google")
    return [formatInTimeZone(new Date(ev.start), APP_TIMEZONE, "yyyy-MM-dd")];
  return [ev.start.slice(0, 10)];
}

export type WeekSheet = {
  days: string[];
  byDay: Map<string, { where: string[]; school: Line[]; events: Line[]; other: Line[] }>;
  whoLabel: string;
  weekLabel: string;
  people: { id: string; name: string }[];
  kids: { id: string; name: string }[];
};

export async function buildWeekSheet(
  db: SupabaseClient<Database>,
  opts: { weekStart: string; who: string; include: Set<IncludeKey> },
): Promise<WeekSheet> {
  const { weekStart, who, include } = opts;
  const days = daysForView("week", weekStart);
  const firstDay = days[0];
  const lastDay = days[days.length - 1];

  const [{ data: profiles }, { data: kidRows }, { data: helperRows }] = await Promise.all([
    db.from("profiles").select("id, display_name, created_at").order("created_at"),
    db.from("kids").select("id, name, sort_order").order("sort_order"),
    db.from("helpers").select("id, name"),
  ]);
  const people = (profiles ?? []).map((p) => ({
    id: p.id,
    name: p.display_name?.trim() || "Someone",
  }));
  const kids = (kidRows ?? []).map((k) => ({ id: k.id, name: k.name }));
  const personName = new Map(people.map((p) => [p.id, p.name]));
  const kidName = new Map(kids.map((k) => [k.id, k.name]));
  const helperName = new Map((helperRows ?? []).map((h) => [h.id, h.name]));

  const personFilter = who.startsWith("p:") ? who.slice(2) : null;
  const kidFilter = who.startsWith("k:") ? who.slice(2) : null;
  const shownPeople = personFilter
    ? people.filter((p) => p.id === personFilter)
    : kidFilter
      ? []
      : people;
  const { timeMin, timeMax } = rangeOfDays(days);

  const [
    { data: avail },
    { data: dtimes },
    { data: weekEvents },
    { data: schoolEvents },
    external,
  ] = await Promise.all([
    include.has("where")
      ? db
          .from("availability")
          .select("user_id, day, slot, status, note")
          .gte("day", firstDay)
          .lte("day", lastDay)
      : Promise.resolve({
          data: [] as {
            user_id: string;
            day: string;
            slot: Slot;
            status: Status | null;
            note: string | null;
          }[],
        }),
    include.has("where")
      ? db
          .from("day_times")
          .select("user_id, day, leave_time, return_time")
          .gte("day", firstDay)
          .lte("day", lastDay)
      : Promise.resolve({
          data: [] as {
            user_id: string;
            day: string;
            leave_time: string | null;
            return_time: string | null;
          }[],
        }),
    include.has("events")
      ? db
          .from("week_events")
          .select("day, start_time, end_time, title, notes, kid_ids, assignee_user_id, helper_id")
          .gte("day", firstDay)
          .lte("day", lastDay)
      : Promise.resolve({ data: [] }),
    include.has("school")
      ? db
          .from("school_events")
          .select("day, time, kind, kid_id, assignee_user_id, helper_id")
          .gte("day", firstDay)
          .lte("day", lastDay)
      : Promise.resolve({ data: [] }),
    include.has("calendars") && shownPeople.length
      ? (async () => {
          try {
            const admin = createAdminClient();
            return await Promise.all(
              shownPeople.map((p) =>
                getEventsForUser(admin, p.id, timeMin, timeMax)
                  .then((evs) => ({ id: p.id, evs }))
                  .catch(() => ({ id: p.id, evs: [] as NormalizedEvent[] })),
              ),
            );
          } catch {
            return [];
          }
        })()
      : Promise.resolve([]),
  ]);

  // Build each day's lines.
  const byDay = new Map<
    string,
    { where: string[]; school: Line[]; events: Line[]; other: Line[] }
  >();
  for (const d of days) byDay.set(d, { where: [], school: [], events: [], other: [] });

  // Where we are
  if (include.has("where")) {
    for (const p of shownPeople) {
      for (const d of days) {
        const slots = (avail ?? []).filter((a) => a.user_id === p.id && a.day === d && a.status);
        const t = (dtimes ?? []).find((x) => x.user_id === p.id && x.day === d);
        const bits: string[] = [];
        if (slots.length) {
          const statuses = SLOTS.map((s) => slots.find((a) => a.slot === s.value)?.status ?? null);
          const allSame = statuses.every((st) => st && st === statuses[0]);
          bits.push(
            allSame
              ? STATUS_MAP[statuses[0]!].label
              : SLOTS.flatMap((s, i) =>
                  statuses[i] ? [`${s.label} ${STATUS_MAP[statuses[i]!].label}`] : [],
                ).join(", "),
          );
        }
        if (t?.leave_time) bits.push(`out ${t.leave_time.slice(0, 5)}`);
        if (t?.return_time) bits.push(`back ${t.return_time.slice(0, 5)}`);
        if (bits.length) byDay.get(d)!.where.push(`${p.name}: ${bits.join(" · ")}`);
      }
    }
  }

  // School runs
  for (const s of schoolEvents ?? []) {
    if (kidFilter && s.kid_id !== kidFilter) continue;
    if (personFilter && s.assignee_user_id !== personFilter) continue;
    const doer =
      (s.helper_id && helperName.get(s.helper_id)) ||
      (s.assignee_user_id && personName.get(s.assignee_user_id)) ||
      "not set";
    byDay.get(s.day)?.school.push({
      time: s.time.slice(0, 5),
      text: `${s.kind === "drop" ? "Drop-off" : "Pickup"} — ${kidName.get(s.kid_id) ?? ""}`,
      tag: doer,
    });
  }

  // Planned events (added in the app)
  for (const e of weekEvents ?? []) {
    const shared = !e.assignee_user_id && !e.helper_id;
    if (kidFilter && !(e.kid_ids ?? []).includes(kidFilter)) continue;
    if (personFilter && !(e.assignee_user_id === personFilter || shared)) continue;
    const kidsText = (e.kid_ids ?? [])
      .map((k: string) => kidName.get(k))
      .filter(Boolean)
      .join(" & ");
    const doer =
      (e.helper_id && helperName.get(e.helper_id)) ||
      (e.assignee_user_id && personName.get(e.assignee_user_id)) ||
      people.map((p) => p.name).join(" & ");
    byDay.get(e.day)?.events.push({
      time: e.start_time
        ? `${e.start_time.slice(0, 5)}${e.end_time ? `–${e.end_time.slice(0, 5)}` : ""}`
        : "All day",
      text: `${e.title}${kidsText ? ` — ${kidsText}` : ""}${e.notes ? ` (${e.notes})` : ""}`,
      tag: doer,
    });
  }

  // Other calendars (work etc.)
  for (const { id, evs } of external) {
    for (const ev of evs) {
      for (const d of daysOf(ev)) {
        if (d < firstDay || d > lastDay) continue;
        byDay.get(d)!.other.push({
          time: timeOf(ev),
          text: ev.title,
          tag:
            shownPeople.length > 1
              ? `${personName.get(id)} · ${ev.calendarLabel}`
              : ev.calendarLabel,
        });
      }
    }
  }
  const sortLines = (a: Line, b: Line) =>
    (a.time === "All day" ? "00:00" : a.time).localeCompare(
      b.time === "All day" ? "00:00" : b.time,
    );
  for (const v of byDay.values()) {
    v.school.sort(sortLines);
    v.events.sort(sortLines);
    v.other.sort(sortLines);
  }

  const whoLabel =
    who === "all"
      ? "Everyone"
      : personFilter
        ? (personName.get(personFilter) ?? "")
        : (kidName.get(kidFilter ?? "") ?? "");
  const weekLabel = `${format(parseISO(`${firstDay}T12:00:00`), "EEE d MMM")} – ${format(
    parseISO(`${lastDay}T12:00:00`),
    "EEE d MMM yyyy",
  )}`;

  return { days, byDay, whoLabel, weekLabel, people, kids };
}

/** Plain-text version for WhatsApp / Messages. */
export function weekSheetText(sheet: WeekSheet): string {
  const out: string[] = [`*Week ahead — ${sheet.whoLabel}*`, sheet.weekLabel, ""];
  for (const d of sheet.days) {
    const v = sheet.byDay.get(d)!;
    const lines: string[] = [];
    for (const w of v.where) lines.push(`📍 ${w}`);
    for (const l of [...v.school, ...v.events, ...v.other])
      lines.push(`• ${l.time} ${l.text}${l.tag ? ` — ${l.tag}` : ""}`);
    if (!lines.length) continue;
    out.push(`*${format(parseISO(`${d}T12:00:00`), "EEE d MMM")}*`, ...lines, "");
  }
  if (out.length === 3) out.push("Nothing planned.");
  return out.join("\n").trim();
}
