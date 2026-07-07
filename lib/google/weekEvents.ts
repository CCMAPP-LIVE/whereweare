import { google } from "googleapis";
import { googleServiceAccountAuth } from "./auth";
import { requireEnv } from "@/lib/env";
import { APP_TIMEZONE } from "@/lib/constants";
import { nextDay } from "@/lib/time";

/**
 * Shape of a single week-plan event as we round-trip it through the Life
 * Calendar. This is a projection of the `week_events` row + resolved
 * assignee name (looked up separately by the caller).
 */
export type WeekEventForSync = {
  id: string;
  day: string;
  startTime: string | null; // "HH:mm" or null for all-day
  endTime: string | null;
  title: string;
  notes: string | null;
  assigneeName: string | null;
  googleEventId: string | null;
};

function calendarClient() {
  return google.calendar({ version: "v3", auth: googleServiceAccountAuth() });
}

function buildEventBody(ev: WeekEventForSync) {
  const summary = ev.assigneeName ? `${ev.title} — ${ev.assigneeName}` : ev.title;
  const description = ev.notes || undefined;

  let start: { date: string } | { dateTime: string; timeZone: string };
  let end: { date: string } | { dateTime: string; timeZone: string };

  if (ev.startTime) {
    const effectiveEnd = ev.endTime ?? ev.startTime;
    start = { dateTime: `${ev.day}T${ev.startTime}:00`, timeZone: APP_TIMEZONE };
    end = { dateTime: `${ev.day}T${effectiveEnd}:00`, timeZone: APP_TIMEZONE };
  } else {
    start = { date: ev.day };
    end = { date: nextDay(ev.day) };
  }

  return { summary, description, start, end };
}

/**
 * Insert or update the Life Calendar event backing this week_event.
 * Returns the Google event id (existing or freshly created). Idempotent per
 * `googleEventId`; if the row on Google has been removed, a fresh insert is
 * done and the new id returned so the caller can persist it.
 */
export async function upsertWeekEventOnLifeCalendar(
  ev: WeekEventForSync,
): Promise<string | null> {
  const calendarId = requireEnv("LIFE_CALENDAR_ID");
  const calendar = calendarClient();
  const requestBody = buildEventBody(ev);

  if (ev.googleEventId) {
    try {
      const updated = await calendar.events.update({
        calendarId,
        eventId: ev.googleEventId,
        requestBody,
      });
      return updated.data.id ?? ev.googleEventId;
    } catch {
      // Event was deleted upstream — fall through to insert.
    }
  }

  const created = await calendar.events.insert({ calendarId, requestBody });
  return created.data.id ?? null;
}

/** Delete the Life Calendar event; swallows 404s so callers can retry safely. */
export async function deleteWeekEventOnLifeCalendar(
  googleEventId: string,
): Promise<void> {
  const calendarId = requireEnv("LIFE_CALENDAR_ID");
  const calendar = calendarClient();
  await calendar.events
    .delete({ calendarId, eventId: googleEventId })
    .catch(() => {});
}
