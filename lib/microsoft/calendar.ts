import type { NormalizedEvent } from "@/lib/types";
import { requireEnv } from "@/lib/env";
import type { DiscoveredCalendar } from "@/lib/google/calendar";

const GRAPH = "https://graph.microsoft.com/v1.0";

/**
 * Exchange a stored Microsoft refresh token for a fresh access token.
 * Uses the OAuth2 token endpoint directly (no extra SDK needed).
 */
export async function microsoftAccessToken(refreshToken: string): Promise<string> {
  const tenant = process.env.MICROSOFT_TENANT_ID || "organizations";
  const res = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: requireEnv("MICROSOFT_CLIENT_ID"),
        client_secret: requireEnv("MICROSOFT_CLIENT_SECRET"),
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        scope: "openid email offline_access Calendars.Read",
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`Microsoft token refresh failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

async function graphGet<T>(accessToken: string, url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Prefer: 'outlook.timezone="Europe/London"',
    },
  });
  if (!res.ok) {
    throw new Error(`Graph GET failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

export async function listMicrosoftCalendars(
  accessToken: string,
): Promise<DiscoveredCalendar[]> {
  type GraphCal = {
    id: string;
    name: string;
    isDefaultCalendar?: boolean;
    hexColor?: string;
  };
  type CalPage = { value: GraphCal[]; "@odata.nextLink"?: string };
  const out: DiscoveredCalendar[] = [];
  let url: string | undefined =
    `${GRAPH}/me/calendars?$select=id,name,isDefaultCalendar,hexColor&$top=100`;
  while (url) {
    const page: CalPage = await graphGet<CalPage>(accessToken, url);
    for (const c of page.value) {
      out.push({
        externalId: c.id,
        summary: c.name,
        color: c.hexColor && c.hexColor !== "auto" ? c.hexColor : null,
        isPrimary: Boolean(c.isDefaultCalendar),
      });
    }
    url = page["@odata.nextLink"];
  }
  return out;
}

/** List events from one Microsoft calendar within [timeMin, timeMax). */
export async function listMicrosoftEvents(
  accessToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string,
  color: string | null,
): Promise<NormalizedEvent[]> {
  type GraphEvent = {
    id: string;
    subject?: string;
    isAllDay?: boolean;
    start: { dateTime: string; timeZone: string };
    end: { dateTime: string; timeZone: string };
  };
  type EventPage = { value: GraphEvent[]; "@odata.nextLink"?: string };
  const out: NormalizedEvent[] = [];
  const params = new URLSearchParams({
    startDateTime: timeMin,
    endDateTime: timeMax,
    $select: "id,subject,isAllDay,start,end",
    $orderby: "start/dateTime",
    $top: "200",
  });
  let url: string | undefined =
    `${GRAPH}/me/calendars/${encodeURIComponent(calendarId)}/calendarView?${params}`;
  while (url) {
    const page: EventPage = await graphGet<EventPage>(accessToken, url);
    for (const ev of page.value) {
      out.push({
        id: ev.id,
        title: ev.subject ?? "(busy)",
        // Graph returns local datetime (per the Prefer header) without a zone
        // suffix; tag it as Europe/London so the client renders it correctly.
        start: ev.isAllDay ? ev.start.dateTime.slice(0, 10) : `${ev.start.dateTime}`,
        end: ev.isAllDay ? ev.end.dateTime.slice(0, 10) : `${ev.end.dateTime}`,
        allDay: Boolean(ev.isAllDay),
        calendarExternalId: calendarId,
        color,
        provider: "microsoft",
      });
    }
    url = page["@odata.nextLink"];
  }
  return out;
}
