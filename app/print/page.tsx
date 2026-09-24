import { redirect } from "next/navigation";
import { addDays, format, parseISO } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEventsForUser } from "@/lib/calendars";
import {
  daysForView,
  londonToday,
  nextDay,
  normalizeAnchor,
  rangeOfDays,
  weekStartOf,
} from "@/lib/time";
import { APP_TIMEZONE, SLOTS, STATUS_MAP } from "@/lib/constants";
import type { NormalizedEvent, Slot, Status } from "@/lib/types";
import NavBar from "@/components/NavBar";
import PrintControls from "@/components/PrintControls";

export const dynamic = "force-dynamic";

/**
 * Printable week sheet: school runs, planned events, where everyone is and
 * (optionally) work/other calendars — for everyone or one person/child.
 * Printed with the phone's own print sheet (AirPrint / Save as PDF).
 */

type Line = { time: string; text: string; tag?: string };
const INCLUDE_KEYS = ["school", "events", "where", "calendars"] as const;
type IncludeKey = (typeof INCLUDE_KEYS)[number];

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

export default async function PrintPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const today = londonToday();
  const weekStart = weekStartOf(normalizeAnchor(str("week") ?? today));
  const days = daysForView("week", weekStart);
  const firstDay = days[0];
  const lastDay = days[days.length - 1];
  const who = str("who") ?? "all"; // "all" | "p:<id>" | "k:<id>"
  const include = new Set<IncludeKey>(
    str("include") !== undefined
      ? (str("include")!
          .split(",")
          .filter((x) => (INCLUDE_KEYS as readonly string[]).includes(x)) as IncludeKey[])
      : ["school", "events", "where"],
  );

  const [{ data: profiles }, { data: kidRows }, { data: helperRows }] = await Promise.all([
    supabase.from("profiles").select("id, display_name, created_at").order("created_at"),
    supabase.from("kids").select("id, name, sort_order").order("sort_order"),
    supabase.from("helpers").select("id, name"),
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
      ? supabase
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
      ? supabase
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
      ? supabase
          .from("week_events")
          .select("day, start_time, end_time, title, notes, kid_ids, assignee_user_id, helper_id")
          .gte("day", firstDay)
          .lte("day", lastDay)
      : Promise.resolve({ data: [] }),
    include.has("school")
      ? supabase
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
  const thisWeek = weekStartOf(today);
  const nextWeek = format(addDays(parseISO(`${thisWeek}T12:00:00`), 7), "yyyy-MM-dd");

  return (
    <>
      <NavBar />
      <main className="mx-auto max-w-3xl px-3 py-4 sm:px-4 print:max-w-none print:p-0">
        <PrintControls
          week={weekStart}
          thisWeek={thisWeek}
          nextWeek={nextWeek}
          who={who}
          include={[...include]}
          people={people}
          kids={kids}
        />

        <article className="print-sheet rounded-2xl border border-black/10 bg-white p-4 text-neutral-900 dark:border-white/10 print:rounded-none print:border-0 print:p-0">
          <header className="mb-3 flex items-baseline justify-between border-b border-black/20 pb-2">
            <h1 className="text-lg font-bold">Week ahead — {whoLabel}</h1>
            <span className="text-sm text-neutral-600">{weekLabel}</span>
          </header>

          {days.map((d) => {
            const v = byDay.get(d)!;
            const empty =
              !v.where.length && !v.school.length && !v.events.length && !v.other.length;
            return (
              <section
                key={d}
                className="break-inside-avoid border-b border-black/10 py-2 last:border-0"
              >
                <h2 className="text-sm font-bold">
                  {format(parseISO(`${d}T12:00:00`), "EEEE d MMMM")}
                </h2>
                {empty && <p className="text-xs text-neutral-400">Nothing planned</p>}
                {v.where.length > 0 && (
                  <p className="text-xs text-neutral-700">📍 {v.where.join("   ·   ")}</p>
                )}
                <Lines title="School" lines={v.school} />
                <Lines title="Plans" lines={v.events} />
                <Lines title="Other calendars" lines={v.other} />
              </section>
            );
          })}
          <footer className="mt-2 text-[10px] text-neutral-400">
            Where We Are · printed {format(new Date(), "d MMM yyyy")}
          </footer>
        </article>
      </main>
    </>
  );
}

function Lines({ title, lines }: { title: string; lines: Line[] }) {
  if (!lines.length) return null;
  return (
    <div className="mt-1">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
        {title}
      </div>
      <table className="w-full text-xs">
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="align-top">
              <td className="w-20 whitespace-nowrap py-0.5 pr-2 tabular-nums text-neutral-600">
                {l.time}
              </td>
              <td className="py-0.5">{l.text}</td>
              <td className="py-0.5 pl-2 text-right font-semibold whitespace-nowrap">{l.tag}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
