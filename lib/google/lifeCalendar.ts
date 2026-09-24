import crypto from "node:crypto";
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
 * Deterministic Google event id for (user, day). Google accepts client ids
 * made of base32hex characters (0-9, a-v). A fixed id means rapid status taps
 * (each firing a sync) all write the same event instead of each inserting a
 * new one and leaving stale duplicates behind.
 */
function lifeEventId(userId: string, day: string): string {
  const hex = crypto.createHash("sha1").update(`wwa-avail:${userId}:${day}`).digest("hex");
  // hex digits 0-9a-f are all valid base32hex characters.
  return `wwa${hex}`;
}

async function buildSummary(admin: Admin, userId: string, day: string, name: string) {
  const [{ data: rows }, { data: dt }] = await Promise.all([
    admin.from("availability").select("slot, status, note").eq("user_id", userId).eq("day", day),
    admin
      .from("day_times")
      .select("leave_time, return_time")
      .eq("user_id", userId)
      .eq("day", day)
      .maybeSingle(),
  ]);
  const slots: DaySlots = {};
  for (const r of rows ?? []) slots[r.slot] = { status: r.status, note: r.note };
  return buildDaySummary(name, slots, {
    leave: dt?.leave_time ?? null,
    return: dt?.return_time ?? null,
  });
}

/**
 * Reconcile the single summary all-day event for (user, day) on the shared
 * Life calendar with the user's current availability. Creates, updates, or
 * deletes the event and keeps `life_calendar_sync` in step. Idempotent, and
 * safe when several syncs for the same day overlap.
 */
export async function syncDayToLifeCalendar(
  admin: Admin,
  userId: string,
  day: string,
): Promise<void> {
  const calendarId = requireEnv("LIFE_CALENDAR_ID");
  const calendar = lifeCalendarClient();
  const eventId = lifeEventId(userId, day);

  // Display name for the event title.
  const { data: profile } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();
  const name = profile?.display_name?.trim() || "Someone";

  // Remove stale duplicates for this person/day: events from before ids were
  // fixed, or left behind by overlapping syncs. Matched by the "Name – " title.
  const { data: sync } = await admin
    .from("life_calendar_sync")
    .select("google_event_id")
    .eq("user_id", userId)
    .eq("day", day)
    .maybeSingle();
  try {
    const listed = await calendar.events.list({
      calendarId,
      timeMin: `${day}T00:00:00Z`,
      timeMax: `${nextDay(day)}T23:59:59Z`,
      q: name,
      singleEvents: true,
      maxResults: 50,
    });
    const stale = (listed.data.items ?? []).filter(
      (e) =>
        e.id !== eventId &&
        e.start?.date === day &&
        (e.id === sync?.google_event_id || (e.summary ?? "").startsWith(`${name} – `)),
    );
    await Promise.all(
      stale.map((e) => calendar.events.delete({ calendarId, eventId: e.id! }).catch(() => {})),
    );
  } catch {
    // Listing is housekeeping only.
  }

  // Write the current state; re-check afterwards in case a newer tap landed
  // while we were writing, so the calendar ends up matching the app.
  let written: string | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const summary = await buildSummary(admin, userId, day, name);
    const key = summary ? `${summary.title}\n${summary.description}` : "";
    if (key === written) break;

    if (!summary) {
      await calendar.events.delete({ calendarId, eventId }).catch(() => {});
      await admin.from("life_calendar_sync").delete().eq("user_id", userId).eq("day", day);
    } else {
      const requestBody = {
        summary: summary.title,
        description: summary.description || undefined,
        start: { date: day },
        end: { date: nextDay(day) },
        transparency: "transparent" as const, // shows as free, it's informational
        status: "confirmed" as const, // revives the event if it was deleted earlier
      };
      try {
        await calendar.events.update({ calendarId, eventId, requestBody });
      } catch {
        try {
          await calendar.events.insert({ calendarId, requestBody: { ...requestBody, id: eventId } });
        } catch {
          // Inserted concurrently by another sync (409) — update that one.
          await calendar.events.update({ calendarId, eventId, requestBody });
        }
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
    written = key;
  }
}
