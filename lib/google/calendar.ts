import { google } from "googleapis";
import type { NormalizedEvent } from "@/lib/types";
import { googleUserAuth } from "./auth";

export type DiscoveredCalendar = {
  externalId: string;
  summary: string;
  color: string | null;
  isPrimary: boolean;
};

/** List the calendars visible to a connected Google account. */
export async function listGoogleCalendars(
  refreshToken: string,
): Promise<DiscoveredCalendar[]> {
  const calendar = google.calendar({ version: "v3", auth: googleUserAuth(refreshToken) });
  const out: DiscoveredCalendar[] = [];
  let pageToken: string | undefined;
  do {
    const res = await calendar.calendarList.list({
      maxResults: 250,
      pageToken,
      showHidden: false,
    });
    for (const item of res.data.items ?? []) {
      if (!item.id) continue;
      out.push({
        externalId: item.id,
        summary: item.summaryOverride ?? item.summary ?? item.id,
        color: item.backgroundColor ?? null,
        isPrimary: Boolean(item.primary),
      });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return out;
}

/** List events from a single Google calendar within [timeMin, timeMax). */
export async function listGoogleEvents(
  refreshToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string,
  color: string | null,
): Promise<NormalizedEvent[]> {
  const calendar = google.calendar({ version: "v3", auth: googleUserAuth(refreshToken) });
  const out: NormalizedEvent[] = [];
  let pageToken: string | undefined;
  do {
    const res = await calendar.events.list({
      calendarId,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 250,
      pageToken,
    });
    for (const ev of res.data.items ?? []) {
      if (ev.status === "cancelled") continue;
      const allDay = Boolean(ev.start?.date);
      const start = ev.start?.dateTime ?? ev.start?.date;
      const end = ev.end?.dateTime ?? ev.end?.date;
      if (!start || !end) continue;
      out.push({
        id: ev.id ?? `${calendarId}:${start}`,
        title: ev.summary ?? "(busy)",
        start,
        end,
        allDay,
        calendarExternalId: calendarId,
        color,
        provider: "google",
      });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return out;
}
