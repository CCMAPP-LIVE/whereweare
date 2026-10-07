import { google } from "googleapis";
import { addDays, format, parseISO } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { googleUserAuth } from "@/lib/google/auth";
import { APP_TIMEZONE } from "@/lib/constants";
import { londonToday } from "@/lib/time";
import { asLengthKind, lengthLabel, type LengthKind } from "@/lib/bookingLength";

type Admin = SupabaseClient<Database>;
export type BookingLink = Database["public"]["Tables"]["booking_links"]["Row"];

/** Scope that lets the app create events (and so send invites) on an account. */
export const WRITE_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const FULL_SCOPE = "https://www.googleapis.com/auth/calendar";

const BUSY_TIMEOUT_MS = 8000;

/** A busy span in epoch milliseconds, half-open [start, end). */
export type Interval = { start: number; end: number };

/** Supabase/PostgREST error codes meaning "the booking tables aren't there yet". */
export function isMissingTable(error: { code?: string } | null | undefined): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

type GoogleAccount = {
  id: string;
  email: string | null;
  logoUrl: string | null;
  refreshToken: string;
};

async function googleAccountsForUser(admin: Admin, userId: string): Promise<GoogleAccount[]> {
  const { data: accounts } = await admin
    .from("calendar_accounts")
    .select("id, account_email, logo_url")
    .eq("user_id", userId)
    .eq("provider", "google");
  if (!accounts?.length) return [];
  const { data: tokens } = await admin
    .from("calendar_oauth_tokens")
    .select("calendar_account_id, refresh_token")
    .in(
      "calendar_account_id",
      accounts.map((a) => a.id),
    );
  const tokenOf = new Map((tokens ?? []).map((t) => [t.calendar_account_id, t.refresh_token]));
  return accounts.flatMap((a) => {
    const refreshToken = tokenOf.get(a.id);
    return refreshToken
      ? [{ id: a.id, email: a.account_email, logoUrl: a.logo_url, refreshToken }]
      : [];
  });
}

/** The account a link sends invites from, with its token. */
export async function hostAccountFor(
  admin: Admin,
  link: Pick<BookingLink, "user_id" | "calendar_account_id">,
): Promise<GoogleAccount | null> {
  const accounts = await googleAccountsForUser(admin, link.user_id);
  return accounts.find((a) => a.id === link.calendar_account_id) ?? null;
}

/** Whether an account's stored grant includes permission to create events. */
export async function canSendInvites(refreshToken: string): Promise<boolean> {
  try {
    const auth = googleUserAuth(refreshToken);
    const { token } = await auth.getAccessToken();
    if (!token) return false;
    const info = await auth.getTokenInfo(token);
    return info.scopes.includes(WRITE_SCOPE) || info.scopes.includes(FULL_SCOPE);
  } catch {
    return false;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

async function busyForAccount(
  admin: Admin,
  account: GoogleAccount,
  timeMin: string,
  timeMax: string,
): Promise<Interval[]> {
  // The calendars you've chosen to show, plus each account's primary. The
  // shared Life calendar is excluded: it carries both people's summaries.
  const lifeId = process.env.LIFE_CALENDAR_ID;
  const { data: cals } = await admin
    .from("calendars")
    .select("external_id, enabled, is_primary")
    .eq("calendar_account_id", account.id);
  const ids = [
    ...new Set(
      (cals ?? [])
        .filter((c) => (c.enabled || c.is_primary) && c.external_id !== lifeId)
        .map((c) => c.external_id),
    ),
  ];
  if (ids.length === 0) ids.push("primary");

  const calendar = google.calendar({ version: "v3", auth: googleUserAuth(account.refreshToken) });
  const res = await calendar.freebusy.query({
    requestBody: { timeMin, timeMax, items: ids.slice(0, 50).map((id) => ({ id })) },
  });
  const out: Interval[] = [];
  for (const entry of Object.values(res.data.calendars ?? {})) {
    for (const b of entry.busy ?? []) {
      if (b.start && b.end) out.push({ start: Date.parse(b.start), end: Date.parse(b.end) });
    }
  }
  return out;
}

/**
 * Busy time across ALL of a user's connected Google accounts, so a dmsco
 * meeting also blocks brainshed slots. The host account must answer (we'd
 * rather show no slots than risk a double-booking on the calendar the invite
 * comes from); other accounts are best-effort so one stale connection can't
 * take every booking page down.
 */
export async function busyForUser(
  admin: Admin,
  userId: string,
  hostAccountId: string,
  timeMin: string,
  timeMax: string,
): Promise<Interval[]> {
  const accounts = await googleAccountsForUser(admin, userId);
  const results = await Promise.all(
    accounts.map(async (account) => {
      try {
        return await withTimeout(busyForAccount(admin, account, timeMin, timeMax), BUSY_TIMEOUT_MS);
      } catch (err) {
        if (account.id === hostAccountId) throw err;
        return [];
      }
    }),
  );

  // Bookings already confirmed through ANY of this user's links count as busy
  // even before Google has them (or if they're on another account).
  const { data: links } = await admin.from("booking_links").select("id").eq("user_id", userId);
  const linkIds = (links ?? []).map((l) => l.id);
  if (linkIds.length) {
    const { data: booked } = await admin
      .from("bookings")
      .select("start_at, end_at")
      .eq("status", "confirmed")
      .in("link_id", linkIds)
      .lt("start_at", timeMax)
      .gt("end_at", timeMin);
    for (const b of booked ?? []) {
      results.push([{ start: Date.parse(b.start_at), end: Date.parse(b.end_at) }]);
    }
  }
  return results.flat();
}

/** The window a link can offer slots in, as ISO bounds. */
export function linkWindow(link: Pick<BookingLink, "max_days_ahead">, nowMs: number) {
  const lastDay = format(
    addDays(parseISO(`${londonToday()}T12:00:00`), link.max_days_ahead + 1),
    "yyyy-MM-dd",
  );
  return {
    timeMin: new Date(nowMs).toISOString(),
    timeMax: fromZonedTime(`${lastDay}T00:00:00`, APP_TIMEZONE).toISOString(),
  };
}

type LengthFields = Pick<BookingLink, "duration_min" | "day_start" | "day_end"> & {
  length_kind?: string | null;
};

function hmToMinutes(hm: string): number {
  const [h, m] = hm.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

/**
 * Meeting length in minutes. "Half day" is half the link's hours (9–5 → 4h)
 * and "whole day" the full window, so they follow the hours you set.
 */
export function linkDurationMin(link: LengthFields): number {
  const span = hmToMinutes(link.day_end) - hmToMinutes(link.day_start);
  if (link.length_kind === "full_day") return span;
  if (link.length_kind === "half_day") return Math.floor(span / 2);
  return link.duration_min;
}

/** Human label for the length, e.g. "30 min", "Half day", "Whole day". */
export function linkLengthLabel(link: LengthFields): string {
  return lengthLabel(asLengthKind(link.length_kind), link.duration_min);
}

/**
 * Free start times (ISO, UTC) for a link: its weekdays and hours in London
 * time, past the minimum notice, clear of busy time plus the buffer on both
 * sides. Minute-length meetings start every 30 minutes (or the meeting length
 * if shorter); half days offer only the morning and afternoon halves, and a
 * whole day only the start of the window.
 */
export function computeSlots(
  link: LengthFields &
    Pick<BookingLink, "weekdays" | "min_notice_hours" | "max_days_ahead" | "buffer_min">,
  busy: Interval[],
  nowMs: number,
): string[] {
  const durMin = linkDurationMin(link);
  const dur = durMin * 60_000;
  const buf = link.buffer_min * 60_000;
  const cutoff = nowMs + link.min_notice_hours * 3_600_000;
  const today = parseISO(`${londonToday()}T12:00:00`);
  const startHm = link.day_start.slice(0, 5);
  const endHm = link.day_end.slice(0, 5);
  if (dur <= 0) return [];

  const slots: string[] = [];
  for (let d = 0; d <= link.max_days_ahead; d++) {
    const date = addDays(today, d);
    const weekday = (date.getDay() + 6) % 7; // 0=Mon
    if (!link.weekdays.includes(weekday)) continue;
    const key = format(date, "yyyy-MM-dd");
    const dayStart = fromZonedTime(`${key}T${startHm}:00`, APP_TIMEZONE).getTime();
    const dayEnd = fromZonedTime(`${key}T${endHm}:00`, APP_TIMEZONE).getTime();

    let starts: number[];
    if (link.length_kind === "full_day") starts = [dayStart];
    else if (link.length_kind === "half_day") starts = [dayStart, dayStart + dur];
    else {
      const step = Math.min(durMin, 30) * 60_000;
      starts = [];
      for (let t = dayStart; t + dur <= dayEnd; t += step) starts.push(t);
    }

    for (const t of starts) {
      if (t < cutoff || t + dur > dayEnd) continue;
      const clash = busy.some((b) => b.start < t + dur + buf && b.end > t - buf);
      if (!clash) slots.push(new Date(t).toISOString());
    }
  }
  return slots;
}

/** Every free start time for a link right now (throws if the host can't be checked). */
export async function freeSlotsForLink(admin: Admin, link: BookingLink): Promise<string[]> {
  const now = Date.now();
  const { timeMin, timeMax } = linkWindow(link, now);
  const busy = await busyForUser(admin, link.user_id, link.calendar_account_id, timeMin, timeMax);
  return computeSlots(link, busy, now);
}

/**
 * Put the meeting on the host account's own calendar with the guest invited.
 * Because the event lives on that account, Google sends the invite (and hosts
 * the Meet) from that address — e.g. it arrives from brainshed, not the app.
 */
export async function createBookingEvent(opts: {
  refreshToken: string;
  link: Pick<BookingLink, "title" | "add_meet" | "description" | "in_person" | "location">;
  /** Overrides the link's address, e.g. the client's own address. */
  location?: string | null;
  startIso: string;
  endIso: string;
  guestName: string;
  guestEmail: string;
  notes: string | null;
  requestId: string;
}): Promise<{ eventId: string | null; meetUrl: string | null }> {
  const calendar = google.calendar({ version: "v3", auth: googleUserAuth(opts.refreshToken) });
  const description = [
    opts.notes ? `Notes from ${opts.guestName}:\n${opts.notes}` : null,
    opts.link.description,
  ]
    .filter(Boolean)
    .join("\n\n");
  const res = await calendar.events.insert({
    calendarId: "primary",
    sendUpdates: "all",
    conferenceDataVersion: opts.link.add_meet ? 1 : 0,
    requestBody: {
      summary: `${opts.link.title} with ${opts.guestName}`,
      description: description || undefined,
      // In person: the address becomes the event location (Google shows a map link).
      location: opts.link.in_person ? (opts.location ?? opts.link.location ?? undefined) : undefined,
      start: { dateTime: opts.startIso, timeZone: APP_TIMEZONE },
      end: { dateTime: opts.endIso, timeZone: APP_TIMEZONE },
      attendees: [{ email: opts.guestEmail, displayName: opts.guestName }],
      reminders: { useDefault: true },
      conferenceData: opts.link.add_meet
        ? {
            createRequest: {
              requestId: opts.requestId,
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          }
        : undefined,
    },
  });
  const meetUrl =
    res.data.hangoutLink ??
    res.data.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri ??
    null;
  return { eventId: res.data.id ?? null, meetUrl };
}

/** Cancel a booked meeting; Google emails the guest the cancellation. */
export async function cancelBookingEvent(refreshToken: string, eventId: string): Promise<void> {
  const calendar = google.calendar({ version: "v3", auth: googleUserAuth(refreshToken) });
  await calendar.events.delete({ calendarId: "primary", eventId, sendUpdates: "all" });
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;
/** Paths meyouwhen.com uses itself, so they can't be booking link names. */
const RESERVED_SLUGS = new Set(["privacy", "terms", "about", "pricing", "login", "signup", "waitlist"]);

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

export type LinkInput = {
  calendar_account_id?: string;
  slug?: string;
  title?: string;
  description?: string | null;
  host_name?: string | null;
  duration_min?: number;
  length_kind?: LengthKind;
  weekdays?: number[];
  day_start?: string;
  day_end?: string;
  min_notice_hours?: number;
  max_days_ahead?: number;
  buffer_min?: number;
  add_meet?: boolean;
  in_person?: boolean;
  location?: string | null;
  location_mode?: "host" | "client";
  active?: boolean;
};

function intIn(v: unknown, min: number, max: number): number | undefined {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
}

/**
 * Validate a create/update payload. Returns only the fields that were present
 * and valid, plus an error string for the first invalid one.
 */
export function parseLinkInput(body: unknown): { input: LinkInput; error: string | null } {
  const b = (body ?? {}) as Record<string, unknown>;
  const input: LinkInput = {};
  const fail = (error: string) => ({ input, error });

  if ("calendar_account_id" in b) {
    if (typeof b.calendar_account_id !== "string" || !b.calendar_account_id)
      return fail("Pick the account invites should come from.");
    input.calendar_account_id = b.calendar_account_id;
  }
  if ("slug" in b) {
    const slug = typeof b.slug === "string" ? b.slug.trim().toLowerCase() : "";
    if (!SLUG_RE.test(slug))
      return fail("Link name must be 3–50 lowercase letters, numbers or dashes.");
    if (RESERVED_SLUGS.has(slug)) return fail("That link name is reserved — try another.");
    input.slug = slug;
  }
  if ("title" in b) {
    const title = typeof b.title === "string" ? b.title.trim().slice(0, 100) : "";
    if (!title) return fail("Give the meeting a title.");
    input.title = title;
  }
  if ("description" in b)
    input.description =
      typeof b.description === "string" ? b.description.trim().slice(0, 1000) || null : null;
  if ("host_name" in b)
    input.host_name =
      typeof b.host_name === "string" ? b.host_name.trim().slice(0, 80) || null : null;
  if ("duration_min" in b) {
    const v = intIn(b.duration_min, 10, 240);
    if (v === undefined) return fail("Meeting length must be 10–240 minutes.");
    input.duration_min = v;
  }
  if ("length_kind" in b) {
    if (b.length_kind !== "minutes" && b.length_kind !== "half_day" && b.length_kind !== "full_day")
      return fail("Unknown meeting length.");
    input.length_kind = b.length_kind;
  }
  if ("weekdays" in b) {
    const days = Array.isArray(b.weekdays)
      ? [...new Set(b.weekdays.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))]
      : [];
    if (days.length === 0) return fail("Pick at least one day.");
    input.weekdays = days.sort();
  }
  for (const key of ["day_start", "day_end"] as const) {
    if (key in b) {
      const v = typeof b[key] === "string" ? (b[key] as string).slice(0, 5) : "";
      if (!TIME_RE.test(v)) return fail("Times must be HH:MM.");
      input[key] = v;
    }
  }
  if (input.day_start && input.day_end && input.day_start >= input.day_end)
    return fail("The day must end after it starts.");
  if ("min_notice_hours" in b) {
    const v = intIn(b.min_notice_hours, 0, 720);
    if (v === undefined) return fail("Notice must be 0–720 hours.");
    input.min_notice_hours = v;
  }
  if ("max_days_ahead" in b) {
    const v = intIn(b.max_days_ahead, 1, 180);
    if (v === undefined) return fail("Booking window must be 1–180 days.");
    input.max_days_ahead = v;
  }
  if ("buffer_min" in b) {
    const v = intIn(b.buffer_min, 0, 120);
    if (v === undefined) return fail("Gap between meetings must be 0–120 minutes.");
    input.buffer_min = v;
  }
  if ("add_meet" in b) input.add_meet = Boolean(b.add_meet);
  if ("in_person" in b) input.in_person = Boolean(b.in_person);
  if ("location" in b)
    input.location =
      typeof b.location === "string" ? b.location.trim().slice(0, 300) || null : null;
  if ("location_mode" in b) {
    if (b.location_mode !== "host" && b.location_mode !== "client")
      return fail("Unknown meeting location.");
    input.location_mode = b.location_mode;
  }
  // Your own address is needed unless the client gives theirs when booking.
  if (input.in_person && input.location_mode !== "client" && "location" in b && !input.location)
    return fail("Add the address for in-person meetings.");
  if ("active" in b) input.active = Boolean(b.active);
  return { input, error: null };
}
