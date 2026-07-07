import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  daysForView,
  londonToday,
  normalizeAnchor,
  weekStartOf,
} from "@/lib/time";
import NavBar from "@/components/NavBar";
import PlanView, { type WeekEvent, type WeekNotes } from "@/components/PlanView";

export const dynamic = "force-dynamic";

export default async function PlanPage({
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

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, created_at")
    .order("created_at");
  const people = (profiles ?? []).map((p) => ({
    id: p.id,
    name: p.display_name?.trim() || "Someone",
  }));

  const firstDay = days[0];
  const lastDay = days[days.length - 1];

  const [{ data: eventRows }, { data: kidRows }] = await Promise.all([
    supabase
      .from("week_events")
      .select(
        "id, user_id, day, start_time, end_time, title, notes, assignee_user_id, kid_ids, google_event_id, updated_at",
      )
      .gte("day", firstDay)
      .lte("day", lastDay)
      .order("start_time", { ascending: true, nullsFirst: true }),
    supabase
      .from("kids")
      .select("id, name")
      .order("sort_order", { ascending: true }),
  ]);

  const events: WeekEvent[] = (eventRows ?? []).map((r) => ({
    id: r.id,
    userId: r.user_id,
    day: r.day,
    startTime: r.start_time,
    endTime: r.end_time,
    title: r.title,
    notes: r.notes,
    assigneeUserId: r.assignee_user_id,
    kidIds: r.kid_ids ?? [],
  }));

  const kids = (kidRows ?? []).map((k) => ({ id: k.id, name: k.name }));

  const { data: noteRow } = await supabase
    .from("week_notes")
    .select("this_week_note, next_week_note")
    .eq("user_id", user.id)
    .eq("week_start", weekStart)
    .maybeSingle();

  const notes: WeekNotes = {
    weekStart,
    thisWeek: noteRow?.this_week_note ?? "",
    nextWeek: noteRow?.next_week_note ?? "",
  };

  return (
    <>
      <NavBar />
      <PlanView
        currentUserId={user.id}
        people={people}
        kids={kids}
        days={days}
        today={today}
        anchor={anchor}
        initialEvents={events}
        initialNotes={notes}
      />
    </>
  );
}
