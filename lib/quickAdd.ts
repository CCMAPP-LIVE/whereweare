import * as chrono from "chrono-node";
import { addDays, format, getISODay, parseISO } from "date-fns";

/**
 * Rule-based parser that turns a short chat message ("Percy swimming Thu 4-5")
 * into week_event fields. No AI — just the house rules below, so behaviour is
 * predictable and it's cheap. Tweak the RULES section as phrasing needs grow.
 *
 * Used by the Slack bot; kept channel-agnostic so another front door could
 * reuse it.
 */

// ─── RULES ────────────────────────────────────────────────────────────────

/** Bare hours (no am/pm) from 7–11 are mornings; 12 and 1–6 are afternoons. */
function bareHourTo24(h: number): number {
  if (h >= 7 && h <= 11) return h;
  if (h === 12) return 12;
  if (h >= 1 && h <= 6) return h + 12;
  return h; // 0, 13–23 already 24h
}

/** When only a start time is given, the event lasts this long. */
const DEFAULT_DURATION_MIN = 60;

/** Keywords that become a standard title (so they line up with /school). */
const TITLE_KEYWORDS: { pattern: RegExp; title: string }[] = [
  { pattern: /\b(drop[\s-]?offs?|drops?)\b/i, title: "Drop-off" },
  { pattern: /\b(pick[\s-]?ups?|collect(?:ion|ing)?)\b/i, title: "Pickup" },
];

/** Words stripped from the edges of what's left when building a title. */
const FILLER = new Set(
  "a an the at on for to is are has have got with and from by in of my our please pls taking take doing do going go gets get needs need will be".split(
    " ",
  ),
);

// ─── Types ────────────────────────────────────────────────────────────────

export type Directory = {
  senderId: string;
  people: { id: string; name: string }[];
  helpers: { id: string; name: string }[];
  kids: { id: string; name: string }[];
};

export type ParsedEvent = {
  title: string;
  day: string; // YYYY-MM-DD
  startTime: string | null; // HH:mm
  endTime: string | null;
  notes: string | null;
  kidIds: string[];
  assigneeUserId: string | null;
  helperId: string | null;
};

export type ParseResult =
  | { ok: true; events: ParsedEvent[] }
  | { ok: false; message: string };

// ─── Helpers ──────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");
const toHHmm = (mins: number) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function addMinutes(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  return toHHmm(Math.min(h * 60 + m + mins, 23 * 60 + 59));
}

/** Remove a matched span from the working text, leaving a space. */
function cut(text: string, index: number, length: number): string {
  return `${text.slice(0, index)} ${text.slice(index + length)}`;
}

const MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec";

type TimeToken = { h: number; m: number; mer: "am" | "pm" | null };

function resolveTime(t: TimeToken, fallbackMer: "am" | "pm" | null): number {
  let h = t.h;
  const mer = t.mer ?? fallbackMer;
  if (mer === "am") h = h === 12 ? 0 : h;
  else if (mer === "pm") h = h === 12 ? 12 : h + 12;
  else h = bareHourTo24(h);
  return h * 60 + t.m;
}

const TIME = String.raw`(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?`;
const tok = (h?: string, m?: string, mer?: string): TimeToken => ({
  h: Number(h),
  m: m ? Number(m) : 0,
  mer: mer ? (mer.startsWith("a") ? "am" : "pm") : null,
});

/**
 * Pull the time (or time range) out of the text. Returns the remaining text.
 * A bare number only counts as a time when it isn't part of a date
 * ("14 Oct", "4/10", "3rd").
 */
function extractTimes(text: string): {
  rest: string;
  start: string | null;
  end: string | null;
} {
  const notDate = String.raw`(?!\s*(?:st|nd|rd|th)\b)(?!\s*\/)(?!\s*(?:${MONTHS}))`;
  const notAfterDate = String.raw`(?<!\/)(?<!(?:${MONTHS})[a-z]*\s)`;

  // Ranges: "4-5", "4pm-5:30", "9 to 11am", "2 till 4"
  const range = new RegExp(
    String.raw`${notAfterDate}\b${TIME}\s*(?:-|to|till|til|until)\s*${TIME}\b${notDate}`,
    "i",
  );
  const r = range.exec(text);
  if (r && Number(r[1]) <= 23 && Number(r[4]) <= 23) {
    const a = tok(r[1], r[2], r[3]);
    const b = tok(r[4], r[5], r[6]);
    // "2-4pm": the end's am/pm applies to the start too.
    const startMin = resolveTime(a, a.mer ?? b.mer);
    let endMin = resolveTime(b, b.mer);
    if (endMin <= startMin && !b.mer) endMin += 12 * 60;
    return {
      rest: cut(text, r.index, r[0].length),
      start: toHHmm(startMin),
      end: endMin > startMin && endMin < 24 * 60 ? toHHmm(endMin) : null,
    };
  }

  // Single time: needs am/pm, a colon, "at"/"@", or be a bare 1–12.
  const re = new RegExp(String.raw`(?:\b(?:at|@)\s*)?\b${TIME}\b${notDate}`, "gi");
  const afterMonth = new RegExp(String.raw`(?:\/|\b(?:${MONTHS})[a-z]*\s+)$`, "i");
  let s: RegExpExecArray | null;
  while ((s = re.exec(text))) {
    const t = tok(s[1], s[2], s[3]);
    const explicit = !!s[2] || !!s[3] || /^(at|@)/i.test(s[0].trim());
    if (t.h > 23 || t.m > 59) continue;
    if (!explicit && (t.h < 1 || t.h > 12)) continue;
    // A bare number straight after a month ("Oct 3") is a date, not a time.
    if (!explicit && afterMonth.test(text.slice(0, s.index))) continue;
    return { rest: cut(text, s.index, s[0].length), start: toHHmm(resolveTime(t, null)), end: null };
  }
  return { rest: text, start: null, end: null };
}

const WEEKDAYS: [RegExp, number][] = [
  [/mon(?:day)?/, 1],
  [/tue(?:s|sday)?/, 2],
  [/wed(?:s|nesday)?/, 3],
  [/thu(?:r|rs|rsday)?/, 4],
  [/fri(?:day)?/, 5],
  [/sat(?:urday)?/, 6],
  [/sun(?:day)?/, 7],
];

/**
 * Pull out day(s). Handles today/tomorrow, weekdays (incl. "Thu and Fri",
 * "next Tues", "Friday week"), then explicit dates via chrono ("14 Oct",
 * "4/10", "Sat 3rd"). A bare weekday is the next occurrence, today included.
 */
function extractDays(text: string, today: string): { rest: string; days: string[] } {
  const base = parseISO(`${today}T12:00:00`);
  const days: string[] = [];
  let rest = text;

  const rel = /\b(today|tonight|tomorrow|tmrw|tmr)\b/i.exec(rest);
  if (rel) {
    const isToday = /^(today|tonight)$/i.test(rel[1]);
    days.push(format(addDays(base, isToday ? 0 : 1), "yyyy-MM-dd"));
    rest = cut(rest, rel.index, rel[0].length);
  }

  for (const [pattern, iso] of WEEKDAYS) {
    const re = new RegExp(String.raw`\b(next\s+|this\s+)?${pattern.source}\b(\s+week)?`, "i");
    const m = re.exec(rest);
    if (!m) continue;
    let offset = (iso - getISODay(base) + 7) % 7; // 0 = today
    if (m[1]?.toLowerCase().startsWith("next")) {
      // "next Tues" = the one in next week (Mon–Sun), never this week.
      const daysToNextMonday = 8 - getISODay(base);
      offset = daysToNextMonday + (iso - 1);
    }
    if (m[2]) offset += 7; // "Friday week"
    days.push(format(addDays(base, offset), "yyyy-MM-dd"));
    rest = cut(rest, m.index, m[0].length);
  }

  if (days.length === 0) {
    const results = chrono.en.GB.parse(rest, base, { forwardDate: true });
    for (const res of results) {
      days.push(format(res.start.date(), "yyyy-MM-dd"));
      rest = cut(rest, res.index, res.text.length);
    }
  }

  return { rest, days: [...new Set(days)].sort() };
}

function findNames<T extends { id: string; name: string }>(text: string, list: T[]) {
  const found: T[] = [];
  let rest = text;
  for (const item of list) {
    const re = new RegExp(String.raw`\b${escapeRe(item.name)}(?:'s|s')?\b`, "i");
    const m = re.exec(rest);
    if (m) {
      found.push(item);
      rest = cut(rest, m.index, m[0].length);
    }
  }
  return { rest, found };
}

function tidyTitle(words: string): string {
  const parts = words
    .replace(/[,;:!?()"“”]+/g, " ")
    .replace(/\s+&\s+|\s+\+\s+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  while (parts.length && FILLER.has(parts[0].toLowerCase())) parts.shift();
  while (parts.length && FILLER.has(parts[parts.length - 1].toLowerCase())) parts.pop();
  const s = parts.join(" ").replace(/^[-–.\s]+|[-–.\s]+$/g, "");
  return s ? s[0].toUpperCase() + s.slice(1) : "";
}

// ─── Public API ───────────────────────────────────────────────────────────

/** Parse a new-event message. `today` is YYYY-MM-DD in London. */
export function parseNewEvent(text: string, dir: Directory, today: string): ParseResult {
  let rest = ` ${text.replace(/[–—]/g, "-")} `;

  const times = extractTimes(rest);
  rest = times.rest;
  const dates = extractDays(rest, today);
  rest = dates.rest;
  if (dates.days.length === 0) {
    return {
      ok: false,
      message:
        "Which day is that? Try e.g. “Percy swimming Thu 4-5”, “dentist 14 Oct 3pm”, or use `/event` for a form.",
    };
  }

  const kidsRes = findNames(rest, dir.kids);
  rest = kidsRes.rest;
  const helperRes = findNames(rest, dir.helpers);
  rest = helperRes.rest;
  const peopleRes = findNames(rest, dir.people);
  rest = peopleRes.rest;
  const me = /\b(I'm|I'll|I|me|myself)\b/i.exec(rest);
  if (me) rest = cut(rest, me.index, me[0].length);

  // Assignee: a named helper, else a named person, else whoever posted it.
  const helper = helperRes.found[0] ?? null;
  const person = helper ? null : (peopleRes.found[0] ?? null);
  const assigneeUserId = helper ? null : (person?.id ?? dir.senderId);

  let title = "";
  let notes: string | null = null;
  for (const k of TITLE_KEYWORDS) {
    const m = k.pattern.exec(rest);
    if (m) {
      title = k.title;
      rest = cut(rest, m.index, m[0].length);
      notes = tidyTitle(rest) || null;
      break;
    }
  }
  if (!title) title = tidyTitle(rest) || "Event";

  const startTime = times.start;
  const endTime = startTime ? (times.end ?? addMinutes(startTime, DEFAULT_DURATION_MIN)) : null;

  return {
    ok: true,
    events: dates.days.map((day) => ({
      title: title.slice(0, 200),
      day,
      startTime,
      endTime,
      notes,
      kidIds: kidsRes.found.map((k) => k.id),
      assigneeUserId,
      helperId: helper?.id ?? null,
    })),
  };
}

export type ThreadCommand =
  | { kind: "cancel" }
  | {
      kind: "change";
      day: string | null;
      startTime: string | null;
      endTime: string | null;
      assigneeUserId: string | null;
      helperId: string | null;
    }
  | { kind: "unknown" };

/** Parse a reply in a confirmation thread: "cancel", "5pm", "move to Fri", "Ashley's doing it". */
export function parseThreadReply(text: string, dir: Directory, today: string): ThreadCommand {
  if (/\b(cancel(?:led)?|delete|remove|scrap|not happening|called off)\b/i.test(text))
    return { kind: "cancel" };

  let rest = ` ${text.replace(/[–—]/g, "-")} `;
  const times = extractTimes(rest);
  rest = times.rest;
  const dates = extractDays(rest, today);
  rest = dates.rest;
  const helper = findNames(rest, dir.helpers).found[0] ?? null;
  const person = helper ? null : (findNames(rest, dir.people).found[0] ?? null);
  const me = !helper && !person && /\b(I'm|I'll|I|me)\b/i.test(rest);

  if (!times.start && !dates.days.length && !helper && !person && !me) return { kind: "unknown" };
  return {
    kind: "change",
    day: dates.days[0] ?? null,
    startTime: times.start,
    endTime: times.start ? (times.end ?? null) : null,
    assigneeUserId: person?.id ?? (me ? dir.senderId : null),
    helperId: helper?.id ?? null,
  };
}

/** Keep an event's duration when only its start time moves. */
export function shiftEnd(oldStart: string | null, oldEnd: string | null, newStart: string): string {
  if (oldStart && oldEnd) {
    const [sh, sm] = oldStart.split(":").map(Number);
    const [eh, em] = oldEnd.split(":").map(Number);
    const dur = eh * 60 + em - (sh * 60 + sm);
    if (dur > 0) return addMinutes(newStart, dur);
  }
  return addMinutes(newStart, DEFAULT_DURATION_MIN);
}
