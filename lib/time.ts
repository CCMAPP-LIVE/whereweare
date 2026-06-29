import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { APP_TIMEZONE, WEEKS_TO_SHOW } from "./constants";

export type DayKey = string; // YYYY-MM-DD

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
