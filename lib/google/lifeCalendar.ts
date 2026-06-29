import { google } from "googleapis";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { requireEnv } from "@/lib/env";
import { buildDaySummary, type DaySlots } from "@/lib/availabilitySummary";
import { nextDay } from "@/lib/time";
import { googleServiceAccountAuth } from "./auth";

type Admin = SupabaseClient<Database>;

function lifeCalendarClient() {
  return google.calendar({ version: "v3", auth: googleServiceAccountAuth() });
}

/**
 * Reconcile the single summary all-day event for (user, day) on the shared
 * Life calendar with the user's current availability. Creates, updates, or
 * deletes the event and keeps `life_calendar_sync` in step. Idempotent.
 */
export async function syncDayToLifeCalendar(
  admin: Admin,
  userId: string,
  day: string,
): Promise<void> {
  const calendarId = requireEnv("LIFE_CALENDAR_ID");
  const calendar = lifeCalendarClient();

  // Display name for the event title.
  const { data: profile } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();
  const name = profile?.display_name?.trim() || "Someone";

  // Current availability for the day.
  const { data: rows } = await admin
    .from("availability")
    .select("slot, status, note")
    .eq("user_id", userId)
    .eq("day", day);

  const slots: DaySlots = {};
  for (const r of rows ?? []) {
    slots[r.slot] = { status: r.status, note: r.note };
  }

  // Out/back times for the day.
  const { data: dt } = await admin
    .from("day_times")
    .select("leave_time, return_time")
    .eq("user_id", userId)
    .eq("day", day)
    .maybeSingle();

  const summary = buildDaySummary(name, slots, {
    leave: dt?.leave_time ?? null,
    return: dt?.return_time ?? null,
  });

  // Existing sync record (if any).
  const { data: sync } = await admin
    .from("life_calendar_sync")
    .select("google_event_id")
    .eq("user_id", userId)
    .eq("day", day)
    .maybeSingle();
  const existingEventId = sync?.google_event_id ?? null;

  // Nothing to show -> delete any existing event and clear the record.
  if (!summary) {
    if (existingEventId) {
      await calendar.events
        .delete({ calendarId, eventId: existingEventId })
        .catch(() => {});
    }
    await admin
      .from("life_calendar_sync")
      .delete()
      .eq("user_id", userId)
      .eq("day", day);
    return;
  }

  const eventBody = {
    summary: summary.title,
    description: summary.description || undefined,
    start: { date: day },
    end: { date: nextDay(day) },
    transparency: "transparent" as const, // shows as free, it's informational
  };

  let eventId = existingEventId;
  if (eventId) {
    try {
      await calendar.events.update({ calendarId, eventId, requestBody: eventBody });
    } catch {
      // Event was deleted upstream — recreate.
      eventId = null;
    }
  }
  if (!eventId) {
    const created = await calendar.events.insert({
      calendarId,
      requestBody: eventBody,
    });
    eventId = created.data.id ?? null;
  }

  await admin.from("life_calendar_sync").upsert(
    {
      user_id: userId,
      day,
      google_event_id: eventId,
      last_synced_at: new Date().toISOString(),
    },
    { onConflict: "user_id,day" },
  );
}
