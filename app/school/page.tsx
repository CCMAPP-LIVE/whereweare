import { redirect } from "next/navigation";
import { addDays, format, parseISO } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import {
  daysForView,
  londonToday,
  normalizeAnchor,
  weekStartOf,
} from "@/lib/time";
import NavBar from "@/components/NavBar";
import SchoolView, {
  type SchoolDefault,
  type SchoolEvent,
} from "@/components/SchoolView";

export const dynamic = "force-dynamic";

export default async function SchoolPage({
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
  const anchor = normalizeAnchor(typeof sp.date === "string" ? sp.date : undefined);
  const days = daysForView("week", anchor);
  const weekStart = weekStartOf(anchor);
  const today = londonToday();

  const firstDay = days[0];
  const lastDay = days[days.length - 1];

  const [
    { data: profiles },
    { data: kidRows },
    { data: eventRows },
    { data: defaultRows },
    { data: weekRow },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name, created_at")
      .order("created_at"),
    supabase
      .from("kids")
      .select("id, name")
      .order("sort_order", { ascending: true }),
    supabase
      .from("school_events")
      .select(
        "id, kid_id, day, kind, time, assignee_user_id, notes, google_event_id, updated_at",
      )
      .gte("day", firstDay)
      .lte("day", lastDay)
      .order("time", { ascending: true }),
    supabase
      .from("school_defaults")
      .select("kid_id, weekday, kind, time, default_assignee_user_id, active"),
    supabase
      .from("school_weeks")
      .select("is_school_week, notes")
      .eq("week_start", weekStart)
      .maybeSingle(),
  ]);

  const people = (profiles ?? []).map((p) => ({
    id: p.id,
    name: p.display_name?.trim() || "Someone",
  }));
  const kids = (kidRows ?? []).map((k) => ({ id: k.id, name: k.name }));

  const events: SchoolEvent[] = (eventRows ?? []).map((r) => ({
    id: r.id,
    kidId: r.kid_id,
    day: r.day,
    kind: r.kind as "drop" | "pickup",
    time: r.time.slice(0, 5),
    assigneeUserId: r.assignee_user_id,
    notes: r.notes,
  }));

  const defaults: SchoolDefault[] = (defaultRows ?? []).map((d) => ({
    kidId: d.kid_id,
    weekday: d.weekday,
    kind: d.kind as "drop" | "pickup",
    time: d.time.slice(0, 5),
    defaultAssigneeUserId: d.default_assignee_user_id,
    active: d.active,
  }));

  const dayLabels = days.map((day) => ({
    day,
    label: format(parseISO(`${day}T12:00:00`), "EEE d MMM"),
    weekday: (parseISO(`${day}T12:00:00`).getDay() + 6) % 7, // 0=Mon
  }));
  // Guard against unused `addDays` if the label logic is changed later.
  void addDays;

  return (
    <>
      <NavBar />
      <SchoolView
        currentUserId={user.id}
        people={people}
        kids={kids}
        anchor={anchor}
        today={today}
        weekStart={weekStart}
        dayLabels={dayLabels}
        initialEvents={events}
        initialDefaults={defaults}
        initialIsSchoolWeek={weekRow?.is_school_week ?? true}
        initialNotes={weekRow?.notes ?? ""}
      />
    </>
  );
}
