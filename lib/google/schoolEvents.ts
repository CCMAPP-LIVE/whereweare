import { google } from "googleapis";
import { googleServiceAccountAuth } from "./auth";
import { requireEnv } from "@/lib/env";
import { APP_TIMEZONE } from "@/lib/constants";

/**
 * A resolved school event ready to sync to the Life Calendar. Title is
 * fixed by kind ("School drop-off" / "School pickup"), so callers only
 * hand us the resolved names + time.
 */
export type SchoolEventForSync = {
  id: string;
  day: string;
  kind: "drop" | "pickup";
  time: string; // "HH:mm"
  kidName: string;
  assigneeName: string | null;
  notes: string | null;
  googleEventId: string | null;
};

const KIND_LABEL: Record<SchoolEventForSync["kind"], string> = {
  drop: "School drop-off",
  pickup: "School pickup",
};

function calendarClient() {
  return google.calendar({ version: "v3", auth: googleServiceAccountAuth() });
}

function buildEventBody(ev: SchoolEventForSync) {
  // "School drop-off — Bernie (Ashley)". Kid always present (school events
  // require one); assignee optional.
  let summary = `${KIND_LABEL[ev.kind]} — ${ev.kidName}`;
  if (ev.assigneeName) summary += ` (${ev.assigneeName})`;

  // Give it a small default duration so it renders as a visible timed block
  // in Google Calendar; 15 minutes for drop, 15 for pickup.
  const [h, m] = ev.time.split(":").map(Number);
  const endMinutes = m + 15;
  const endH = (h + Math.floor(endMinutes / 60)) % 24;
  const endM = endMinutes % 60;
  const start = `${ev.day}T${ev.time}:00`;
  const end = `${ev.day}T${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}:00`;

  return {
    summary,
    description: ev.notes || undefined,
    start: { dateTime: start, timeZone: APP_TIMEZONE },
    end: { dateTime: end, timeZone: APP_TIMEZONE },
  };
}

export async function upsertSchoolEventOnLifeCalendar(
  ev: SchoolEventForSync,
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
      // upstream deleted — fall through to insert
    }
  }

  const created = await calendar.events.insert({ calendarId, requestBody });
  return created.data.id ?? null;
}

export async function deleteSchoolEventOnLifeCalendar(
  googleEventId: string,
): Promise<void> {
  const calendarId = requireEnv("LIFE_CALENDAR_ID");
  const calendar = calendarClient();
  await calendar.events
    .delete({ calendarId, eventId: googleEventId })
    .catch(() => {});
}
