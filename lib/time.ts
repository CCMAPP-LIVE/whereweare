import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { APP_TIMEZONE, WEEKS_TO_SHOW } from "./constants";

export type DayKey = string; // YYYY-MM-DD

/** The calendar layouts the interface can switch between. */
export type CalView = "day" | "week" | "month";

/** Today's date in London as a YYYY-MM-DD string. */
export function londonToday(): DayKey {
  return formatInTimeZone(new Date(), APP_TIMEZONE, "yyyy-MM-dd");
}

/**
 * The list of day keys to display: from Monday of the current London week,
 * spanning WEEKS_TO_SHOW weeks. Dates are treated as plain calendar dates
 * (anchored at noon to avoid any DST/midnight rollover).
 */
export function visibleDays(weeks: number = WEEKS_TO_SHOW): DayKey[] {
  const today = parseISO(`${londonToday()}T12:00:00`);
  const monday = startOfWeek(today, { weekStartsOn: 1 });
  const days: DayKey[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    days.push(format(addDays(monday, i), "yyyy-MM-dd"));
  }
  return days;
}

/** Inclusive UTC ISO bounds covering the visible days, in London time. */
export function visibleRange(weeks: number = WEEKS_TO_SHOW): {
  timeMin: string;
  timeMax: string;
} {
  const days = visibleDays(weeks);
  const first = days[0];
  const lastPlusOne = format(
    addDays(parseISO(`${days[days.length - 1]}T12:00:00`), 1),
    "yyyy-MM-dd",
  );
  return {
    timeMin: fromZonedTime(`${first}T00:00:00`, APP_TIMEZONE).toISOString(),
    timeMax: fromZonedTime(`${lastPlusOne}T00:00:00`, APP_TIMEZONE).toISOString(),
  };
}

/** True when the current London wall-clock hour equals `hour` (0–23). */
export function isLondonHour(hour: number): boolean {
  return parseInt(formatInTimeZone(new Date(), APP_TIMEZONE, "H"), 10) === hour;
}

export function dayLabel(day: DayKey): { weekday: string; date: string } {
  const d = parseISO(`${day}T12:00:00`);
  return { weekday: format(d, "EEE"), date: format(d, "d MMM") };
}

/** All-day event end is exclusive in Google Calendar — return day + 1. */
export function nextDay(day: DayKey): DayKey {
  return format(addDays(parseISO(`${day}T12:00:00`), 1), "yyyy-MM-dd");
}

/** Coerce an arbitrary query value into a valid view (defaults to week). */
export function normalizeView(input: string | undefined): CalView {
  return input === "day" || input === "month" ? input : "week";
}

/** Coerce an arbitrary query value into a valid YYYY-MM-DD anchor (defaults to today). */
export function normalizeAnchor(input: string | undefined): DayKey {
  if (input && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const d = parseISO(`${input}T12:00:00`);
    if (!Number.isNaN(d.getTime())) return format(d, "yyyy-MM-dd");
  }
  return londonToday();
}

/**
 * The day keys to render for a given view, anchored on `anchor`:
 * - day: just that day
 * - week: Monday–Sunday of that day's week
 * - month: full Monday–Sunday weeks covering that day's month (35 or 42 days)
 */
export function daysForView(view: CalView, anchor: DayKey): DayKey[] {
  const base = parseISO(`${anchor}T12:00:00`);
  if (view === "day") return [format(base, "yyyy-MM-dd")];
  if (view === "week") {
    const monday = startOfWeek(base, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) =>
      format(addDays(monday, i), "yyyy-MM-dd"),
    );
  }
  const gridStart = startOfWeek(startOfMonth(base), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(base), { weekStartsOn: 1 });
  const days: DayKey[] = [];
  for (let i = 0; ; i++) {
    const d = addDays(gridStart, i);
    if (d > gridEnd) break;
    days.push(format(d, "yyyy-MM-dd"));
  }
  return days;
}

/** Inclusive UTC ISO bounds covering a list of day keys, in London time. */
export function rangeOfDays(days: DayKey[]): { timeMin: string; timeMax: string } {
  const first = days[0];
  const lastPlusOne = nextDay(days[days.length - 1]);
  return {
    timeMin: fromZonedTime(`${first}T00:00:00`, APP_TIMEZONE).toISOString(),
    timeMax: fromZonedTime(`${lastPlusOne}T00:00:00`, APP_TIMEZONE).toISOString(),
  };
}

/** Move the anchor forward (dir +1) or back (dir -1) by one view-sized step. */
export function shiftAnchor(view: CalView, anchor: DayKey, dir: number): DayKey {
  const base = parseISO(`${anchor}T12:00:00`);
  if (view === "day") return format(addDays(base, dir), "yyyy-MM-dd");
  if (view === "week") return format(addDays(base, dir * 7), "yyyy-MM-dd");
  return format(addMonths(base, dir), "yyyy-MM-dd");
}

/** Human label for the current range, e.g. "Mon 29 Jun 2026", "29 Jun – 5 Jul 2026", "June 2026". */
export function viewRangeLabel(
  view: CalView,
  anchor: DayKey,
  days: DayKey[],
): string {
  if (view === "day") {
    return format(parseISO(`${anchor}T12:00:00`), "EEE d MMM yyyy");
  }
  if (view === "month") {
    return format(parseISO(`${anchor}T12:00:00`), "MMMM yyyy");
  }
  const a = parseISO(`${days[0]}T12:00:00`);
  const b = parseISO(`${days[days.length - 1]}T12:00:00`);
  const left = format(a, "MMM") === format(b, "MMM") ? format(a, "d") : format(a, "d MMM");
  return `${left} – ${format(b, "d MMM yyyy")}`;
}
