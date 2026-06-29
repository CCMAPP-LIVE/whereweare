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
import CalendarView, { type EventLite } from "@/components/CalendarView";

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

  // Calendar events (best-effort: needs service-role + provider setup).
  const events: Record<string, Record<string, EventLite[]>> = {};
  for (const p of people) events[p.id] = {};
  let calendarsConfigured = true;
  try {
    const admin = createAdminClient();
    for (const p of people) {
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
            provider: ev.provider,
          });
        }
      }
      for (const day of Object.keys(events[p.id])) {
        events[p.id][day].sort((a, b) => a.time.localeCompare(b.time));
      }
    }
  } catch {
    calendarsConfigured = false; // SUPABASE_SERVICE_ROLE_KEY not set yet
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
      />
    </>
  );
}
