import { redirect } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEventsForUser } from "@/lib/calendars";
import {
  daysForView,
  londonToday,
  nextDay,
  normalizeAnchor,
  normalizeView,
  rangeOfDays,
} from "@/lib/time";
import { APP_TIMEZONE } from "@/lib/constants";
import type { NormalizedEvent, Slot, Status } from "@/lib/types";
import NavBar from "@/components/NavBar";
import CalendarView, {
  type EventLite,
  type SchoolDay,
} from "@/components/CalendarView";

export const dynamic = "force-dynamic";

function timeOf(ev: NormalizedEvent): string {
  if (ev.allDay) return "All day";
  if (ev.provider === "google")
    return formatInTimeZone(new Date(ev.start), APP_TIMEZONE, "HH:mm");
  return ev.start.slice(11, 16); // Microsoft times are already Europe/London
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

export default async function Home({
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
  const view = normalizeView(typeof sp.view === "string" ? sp.view : undefined);
  const anchor = normalizeAnchor(typeof sp.date === "string" ? sp.date : undefined);

  const days = daysForView(view, anchor);
  const firstDay = days[0];
  const lastDay = days[days.length - 1];
  const { timeMin, timeMax } = rangeOfDays(days);
  const today = londonToday();

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, created_at")
    .order("created_at");
  const people = (profiles ?? []).map((p) => ({
    id: p.id,
    name: p.display_name?.trim() || "Someone",
  }));

  // Availability for the visible range.
  const { data: avail } = await supabase
    .from("availability")
    .select("user_id, day, slot, status, note")
    .gte("day", firstDay)
    .lte("day", lastDay);

  const availability: Record<
    string,
    Record<string, Partial<Record<Slot, { status: Status | null; note: string | null }>>>
  > = {};
  for (const p of people) availability[p.id] = {};
  for (const a of avail ?? []) {
    (availability[a.user_id] ??= {});
    (availability[a.user_id][a.day] ??= {})[a.slot] = {
      status: a.status,
      note: a.note,
    };
  }

  // Out/back times for the visible range.
  const { data: dtimes } = await supabase
    .from("day_times")
    .select("user_id, day, leave_time, return_time")
    .gte("day", firstDay)
    .lte("day", lastDay);

  const times: Record<
    string,
    Record<string, { leave: string | null; return: string | null }>
  > = {};
  for (const p of people) times[p.id] = {};
  for (const t of dtimes ?? []) {
    (times[t.user_id] ??= {})[t.day] = {
      leave: t.leave_time,
      return: t.return_time,
    };
  }

  // Unread comment counts per day, for badges on this user's visible range.
  const { data: unreadRows } = await supabase
    .from("messages")
    .select("day")
    .eq("recipient_id", user.id)
    .is("read_at", null)
    .gte("day", firstDay)
    .lte("day", lastDay);
  const unreadByDay: Record<string, number> = {};
  for (const row of unreadRows ?? []) unreadByDay[row.day] = (unreadByDay[row.day] ?? 0) + 1;

  // Total comment counts per day (read or unread) so every day with any
  // discussion shows a badge, not just days with something unread.
  const { data: commentRows } = await supabase
    .from("messages")
    .select("day")
    .not("day", "is", null)
    .gte("day", firstDay)
    .lte("day", lastDay)
    .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`);
  const commentedByDay: Record<string, number> = {};
  for (const row of commentRows ?? [])
    if (row.day) commentedByDay[row.day] = (commentedByDay[row.day] ?? 0) + 1;

  // Calendar events (best-effort: needs service-role + provider setup).
  const events: Record<string, Record<string, EventLite[]>> = {};
  for (const p of people) events[p.id] = {};
  let calendarsConfigured = true;
  try {
    const admin = createAdminClient();
    // Fetch every person's calendars in parallel so a view change waits on the
    // slowest single person, not the sum of everyone.
    await Promise.all(
      people.map(async (p) => {
        let evs: NormalizedEvent[] = [];
        try {
          evs = await getEventsForUser(admin, p.id, timeMin, timeMax);
        } catch {
          evs = [];
        }
        for (const ev of evs) {
          for (const day of daysOf(ev)) {
            if (day < firstDay || day > lastDay) continue;
            (events[p.id][day] ??= []).push({
              id: `${ev.id}:${day}`,
              title: ev.title,
              time: timeOf(ev),
              color: ev.color,
              calendarLabel: ev.calendarLabel,
              provider: ev.provider,
            });
          }
        }
        for (const day of Object.keys(events[p.id])) {
          events[p.id][day].sort((a, b) => a.time.localeCompare(b.time));
        }
      }),
    );
  } catch {
    calendarsConfigured = false; // SUPABASE_SERVICE_ROLE_KEY not set yet
  }

  // In-app events created via the "+ Add event" button / the Plan page
  // (week_events). Merged in so they show natively in the calendar without
  // needing the Life calendar enabled for reading. Rendered under the creator.
  const { data: weekEvents } = await supabase
    .from("week_events")
    .select("id, user_id, day, start_time, title")
    .gte("day", firstDay)
    .lte("day", lastDay);
  for (const we of weekEvents ?? []) {
    if (!events[we.user_id]) continue;
    (events[we.user_id][we.day] ??= []).push({
      id: `we:${we.id}`,
      title: we.title,
      time: we.start_time ? we.start_time.slice(0, 5) : "All day",
      color: "#0d9488",
      calendarLabel: "Added",
      provider: "google",
    });
    events[we.user_id][we.day].sort((a, b) => a.time.localeCompare(b.time));
  }

  // School drop-offs / pickups (school_events), summarised per day into a
  // prominent "who's doing it" band: one line for the drop-off, one for the
  // pickup, with the person/helper name shown boldly. Kids are only broken out
  // when Bernie and Percy have different people for the same run.
  const [{ data: schoolEvents }, { data: kidRows }, { data: helperRows }] =
    await Promise.all([
      supabase
        .from("school_events")
        .select("day, time, kind, kid_id, assignee_user_id, helper_id")
        .gte("day", firstDay)
        .lte("day", lastDay),
      supabase.from("kids").select("id, name, sort_order").order("sort_order"),
      supabase.from("helpers").select("id, name"),
    ]);
  const helperName = new Map((helperRows ?? []).map((h) => [h.id, h.name]));
  const profileName = new Map(people.map((p) => [p.id, p.name]));
  const kidName = new Map((kidRows ?? []).map((k) => [k.id, k.name]));

  // day -> kind -> { time, who -> [kidNames] }
  const acc: Record<
    string,
    Partial<Record<"drop" | "pickup", { time: string; whoToKids: Map<string, string[]> }>>
  > = {};
  for (const se of schoolEvents ?? []) {
    const who = se.assignee_user_id
      ? (profileName.get(se.assignee_user_id) ?? "?")
      : se.helper_id
        ? (helperName.get(se.helper_id) ?? "?")
        : "—";
    const kind = se.kind === "drop" ? "drop" : "pickup";
    const dayAcc = (acc[se.day] ??= {});
    const slot = (dayAcc[kind] ??= {
      time: se.time ? se.time.slice(0, 5) : "",
      whoToKids: new Map<string, string[]>(),
    });
    const list = slot.whoToKids.get(who) ?? [];
    const nm = kidName.get(se.kid_id);
    if (nm) list.push(nm);
    slot.whoToKids.set(who, list);
  }
  const schoolByDay: Record<string, SchoolDay> = {};
  for (const [day, kinds] of Object.entries(acc)) {
    const entry: SchoolDay = {};
    for (const kind of ["drop", "pickup"] as const) {
      const slot = kinds[kind];
      if (!slot) continue;
      entry[kind] = {
        time: slot.time,
        groups: [...slot.whoToKids.entries()].map(([who, kids]) => ({ who, kids })),
      };
    }
    schoolByDay[day] = entry;
  }

  return (
    <>
      <NavBar />
      <CalendarView
        key={`${view}:${anchor}`}
        currentUserId={user.id}
        people={people}
        days={days}
        today={today}
        view={view}
        anchor={anchor}
        availability={availability}
        times={times}
        events={events}
        calendarsConfigured={calendarsConfigured}
        unreadByDay={unreadByDay}
        commentedByDay={commentedByDay}
        schoolByDay={schoolByDay}
      />
    </>
  );
}
