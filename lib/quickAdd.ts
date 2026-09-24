import * as chrono from "chrono-node";
import { addDays, differenceInCalendarDays, format, getISODay, parseISO } from "date-fns";

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

/** "Every Tuesday" with no end ("for 6 weeks", "until 18 Dec") runs this many weeks. */
const REPEAT_DEFAULT_WEEKS = 8;
/** Hard cap on how many events one message can create. */
const REPEAT_MAX_EVENTS = 40; // also keeps the Undo button under Slack's 2000-char limit

const HOUR_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12,
};
const HW = "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve";

/**
 * Voice dictation gives words ("four till five", "seven p.m.", "four thirty").
 * Turn hour words into digits where they're clearly times, so the same rules
 * apply as for typed messages. "in two weeks" / "for six weeks" are left alone.
 */
function normaliseSpokenNumbers(text: string): string {
  const d = (w: string) => String(HOUR_WORDS[w.toLowerCase()]);
  return text
    .replace(/\ba\.\s?m\.?/gi, "am")
    .replace(/\bp\.\s?m\.?/gi, "pm")
    .replace(/\bo'?\s?clock\b/gi, "")
    .replace(new RegExp(String.raw`\b(${HW})\s+(thirty|fifteen|forty[\s-]five)\b`, "gi"), (_, h, m) =>
      `${d(h)}:${/thirty/i.test(m) ? "30" : /fifteen/i.test(m) ? "15" : "45"}`,
    )
    .replace(new RegExp(String.raw`\b(at|half|past|from|till|til|until|to|and|between)\s+(${HW})\b`, "gi"), (_, p, h) => `${p} ${d(h)}`)
    .replace(new RegExp(String.raw`\b(${HW})(?=\s*(?:am|pm|-|till|til|until|to\s+\d)\b)`, "gi"), (h) => d(h));
}

/** Spoken times → digits. "half 4" is the British 4:30. */
function normaliseSpokenTimes(text: string): string {
  return normaliseSpokenNumbers(text)
    .replace(/\b(?:at\s+)?(noon|midday)\b/gi, " 12:00 ")
    .replace(/\bhalf\s+(?:past\s+)?(\d{1,2})\b/gi, " $1:30 ")
    .replace(/\bquarter\s+past\s+(\d{1,2})\b/gi, " $1:15 ")
    .replace(/\bquarter\s+to\s+(\d{1,2})\b/gi, (_, h) => {
      const n = Number(h);
      return ` ${n === 1 ? 12 : n - 1}:45 `;
    });
}

/**
 * Time-of-day words set am/pm for bare hours ("tonight at 7" = 19:00).
 * "this morning/afternoon/evening" and "tonight" also mean today.
 */
const DAY_PARTS: { pattern: RegExp; mer: "am" | "pm"; today: boolean }[] = [
  { pattern: /\bthis\s+morning\b/i, mer: "am", today: true },
  { pattern: /\bthis\s+(?:afternoon|evening)\b/i, mer: "pm", today: true },
  { pattern: /\bin\s+the\s+morning\b/i, mer: "am", today: false },
  { pattern: /\bin\s+the\s+(?:afternoon|evening)\b/i, mer: "pm", today: false },
  { pattern: /\btonight\b/i, mer: "pm", today: true },
];

/**
 * Words meaning "both of us" — the event is shared, so it isn't assigned to
 * one person. Naming more than one adult ("me and Ashley") does the same.
 */
const SHARED = /\b(both\s+of\s+us|all\s+of\s+us|the\s+(?:whole\s+)?family|whole\s+family|everyone|everybody|both|us|we're|we'll|we)\b/i;
/** Of those, these also mean all the kids. */
const WHOLE_FAMILY = /^(all\s+of\s+us|the\s+(?:whole\s+)?family|whole\s+family|everyone|everybody)$/i;

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
  | {
      ok: true;
      events: ParsedEvent[];
      seriesNote: string | null;
      /** Set when one event spans several days: "Sat 10 Oct 18:00 → Sun 11 Oct 09:00". */
      spanLabel: string | null;
    }
  | { ok: false; message: string };

// ─── Helpers ──────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");
const toHHmm = (mins: number) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function addMinutes(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  return toHHmm(Math.min(h * 60 + m + mins, 23 * 60 + 59));
}

/**
 * Remove a matched span from the working text, leaving a gap marker so
 * tidyTitle knows a date/time/name used to be there.
 */
const GAP = "¦";
function cut(text: string, index: number, length: number): string {
  return `${text.slice(0, index)} ${GAP} ${text.slice(index + length)}`;
}

/** Slack formatting (*bold*, _italic_, ~strike~, `code`) isn't part of the words. */
const stripFormatting = (text: string) => text.replace(/[*_~`]/g, "");

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
function extractTimes(text: string, dayPart: "am" | "pm" | null = null): {
  rest: string;
  start: string | null;
  end: string | null;
} {
  const notDate = String.raw`(?!\s*(?:st|nd|rd|th)\b)(?!\s*\/)(?!\s*(?:${MONTHS}))`;

  // Ranges: "4-5", "4pm-5:30", "9 to 11am", "2 till 4"
  const range = new RegExp(
    String.raw`(?<!\/)\b${TIME}\s*(?:-|to|till|til|until)\s*${TIME}\b${notDate}`,
    "gi",
  );
  const monthBefore = new RegExp(String.raw`(?:\/|\b(?:${MONTHS})[a-z]*\s+)$`, "i");
  let r: RegExpExecArray | null;
  while ((r = range.exec(text))) {
    if (Number(r[1]) > 23 || Number(r[4]) > 23) continue;
    const a = tok(r[1], r[2], r[3]);
    const b = tok(r[4], r[5], r[6]);
    // "14 Oct 2-4pm" is fine, but "Oct 2-4" alone is a date range, not times.
    const explicit = !!(r[2] || r[3] || r[5] || r[6]);
    if (!explicit && monthBefore.test(text.slice(0, r.index))) continue;
    // "2-4pm": the end's am/pm applies to the start too.
    const startMin = resolveTime(a, a.mer ?? b.mer ?? dayPart);
    let endMin = resolveTime(b, b.mer ?? dayPart);
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
    return { rest: cut(text, s.index, s[0].length), start: toHHmm(resolveTime(t, dayPart)), end: null };
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

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12,
};
const num = (s: string) => NUMBER_WORDS[s.toLowerCase()] ?? Number(s);
const NUM = String.raw`(\d{1,2}|a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve)`;

type Repeat = { interval: number; weeks: number | null; until: string | null; on: boolean };

/**
 * Relative-date and repeat phrases. Runs BEFORE time extraction so numbers
 * like "in 2 weeks" / "for 6 weeks" aren't mistaken for times.
 */
function extractRelative(text: string, today: string) {
  const base = parseISO(`${today}T12:00:00`);
  const days: string[] = [];
  const repeat: Repeat = { interval: 1, weeks: null, until: null, on: false };
  let rest = text;
  let m: RegExpExecArray | null;

  // "in 3 days", "in two weeks", "in a week's time"
  if ((m = new RegExp(String.raw`\bin\s+${NUM}\s+(day|week)s?(?:'?s?\s+time)?\b`, "i").exec(rest))) {
    days.push(format(addDays(base, num(m[1]) * (m[2].toLowerCase() === "week" ? 7 : 1)), "yyyy-MM-dd"));
    rest = cut(rest, m.index, m[0].length);
  }
  // "a week today", "a week tomorrow"
  if ((m = /\ba\s+week\s+(today|tomorrow)\b/i.exec(rest))) {
    days.push(format(addDays(base, m[1].toLowerCase() === "today" ? 7 : 8), "yyyy-MM-dd"));
    rest = cut(rest, m.index, m[0].length);
  }
  // Repeats: "every other", "fortnightly", "every", "weekly"
  if ((m = /\b(every\s+other|every\s+second|fortnightly|biweekly)(\s+weeks?)?\b/i.exec(rest))) {
    repeat.on = true;
    repeat.interval = 2;
    rest = cut(rest, m.index, m[0].length);
  } else if ((m = /\b(every|weekly|each)(\s+weeks?)?\b/i.exec(rest))) {
    repeat.on = true;
    rest = cut(rest, m.index, m[0].length);
  }
  // "for 6 weeks"
  if ((m = new RegExp(String.raw`\bfor\s+(?:the\s+next\s+)?${NUM}\s+weeks?\b`, "i").exec(rest))) {
    repeat.weeks = num(m[1]);
    rest = cut(rest, m.index, m[0].length);
  }
  // "until 18 Dec", "till Christmas", "until end of term" (dates only)
  if ((m = /\b(?:until|till|til|up\s+to)\s+(christmas|xmas|[^,.;]*?\d{1,2}(?:st|nd|rd|th)?(?:\s*[/\s]\s*(?:\d{1,2}|[a-z]{3,9}))?)(?=\s|$|[,.;])/i.exec(rest))) {
    const phrase = /^(christmas|xmas)$/i.test(m[1].trim()) ? "25 Dec" : m[1];
    const d = chrono.en.GB.parseDate(phrase, base, { forwardDate: true });
    if (d) {
      repeat.until = format(d, "yyyy-MM-dd");
      repeat.on = true;
      rest = cut(rest, m.index, m[0].length);
    }
  }
  return { rest, days, repeat };
}

/**
 * Pull out day(s). Handles today/tomorrow, weekdays (incl. "Thu and Fri",
 * "next Tues", "Friday week", "Saturday after next", "Tuesdays" = repeating),
 * then explicit dates via chrono ("14 Oct", "4/10", "Sat 3rd"). A bare
 * weekday is the next occurrence, today included.
 */
function extractDays(
  text: string,
  today: string,
  repeat: Repeat,
): { rest: string; days: string[]; seriesNote: string | null } {
  const base = parseISO(`${today}T12:00:00`);
  const firsts: string[] = [];
  let rest = text;
  let recurring = repeat.on;

  const rel = /\b(today|tomorrow|tmrw|tmr)\b/i.exec(rest);
  if (rel) {
    firsts.push(format(addDays(base, /^today$/i.test(rel[1]) ? 0 : 1), "yyyy-MM-dd"));
    rest = cut(rest, rel.index, rel[0].length);
  }

  for (const [pattern, iso] of WEEKDAYS) {
    const re = new RegExp(
      String.raw`\b(?:the\s+)?(next\s+|this\s+)?(${pattern.source})(s)?\b(\s+after\s+next|\s+week)?`,
      "i",
    );
    const m = re.exec(rest);
    if (!m) continue;
    // "Tuesdays" (full name + s) means every Tuesday; "Tues" is just an abbreviation.
    if (m[3] && m[2].length > 4) recurring = true;
    let offset = (iso - getISODay(base) + 7) % 7; // 0 = today
    if (m[1]?.toLowerCase().startsWith("next")) {
      // "next Tues" = the one in next week (Mon–Sun), never this week.
      offset = 8 - getISODay(base) + (iso - 1);
    }
    if (m[4] && /after\s+next/i.test(m[4])) {
      // "Saturday after next" = skip the coming one.
      offset = (offset === 0 ? 7 : offset) + 7;
    } else if (m[4]) {
      offset += 7; // "Friday week"
    }
    firsts.push(format(addDays(base, offset), "yyyy-MM-dd"));
    rest = cut(rest, m.index, m[0].length);
  }

  if (firsts.length === 0) {
    const results = chrono.en.GB.parse(rest, base, { forwardDate: true });
    for (const res of results) {
      firsts.push(format(res.start.date(), "yyyy-MM-dd"));
      rest = cut(rest, res.index, res.text.length);
    }
  }

  const unique = [...new Set(firsts)].sort();
  if (!recurring || unique.length === 0) return { rest, days: unique, seriesNote: null };

  // Expand repeats: weekly (or fortnightly) from each first date.
  const step = 7 * repeat.interval;
  const days: string[] = [];
  for (const first of unique) {
    const start = parseISO(`${first}T12:00:00`);
    const lastByWeeks = addDays(start, (repeat.weeks ?? REPEAT_DEFAULT_WEEKS) * 7 - 1);
    const last = repeat.until ? parseISO(`${repeat.until}T12:00:00`) : lastByWeeks;
    for (let d = start; d <= last && days.length < REPEAT_MAX_EVENTS; d = addDays(d, step)) {
      days.push(format(d, "yyyy-MM-dd"));
    }
  }
  days.sort();
  const lastDay = days[days.length - 1];
  const seriesNote = `${repeat.interval === 2 ? "every other week" : "weekly"} ×${days.length}, until ${format(parseISO(`${lastDay}T12:00:00`), "EEE d MMM")}`;
  return { rest, days, seriesNote };
}

/** Shared front half of both parsers: spoken times, day parts, relative dates, times, days. */
function extractWhen(text: string, today: string) {
  let rest = ` ${normaliseSpokenTimes(stripFormatting(text).replace(/[–—]/g, "-"))} `;
  let dayPart: "am" | "pm" | null = null;
  let impliesToday = false;
  for (const dp of DAY_PARTS) {
    const m = dp.pattern.exec(rest);
    if (m) {
      dayPart = dp.mer;
      impliesToday = dp.today;
      rest = cut(rest, m.index, m[0].length);
      break;
    }
  }
  const allDay = /\ball[\s-]?day\b/i.exec(rest);
  if (allDay) rest = cut(rest, allDay.index, allDay[0].length);
  const relative = extractRelative(rest, today);
  rest = relative.rest;
  const times = allDay ? { rest, start: null, end: null } : extractTimes(rest, dayPart);
  rest = times.rest;
  const dates = extractDays(rest, today, relative.repeat);
  rest = dates.rest;
  let days = [...new Set([...relative.days, ...dates.days])].sort();
  if (!days.length && impliesToday) days = [today];
  return { rest, times, days, seriesNote: dates.seriesNote };
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
  let parts = words
    .replace(/[,;:!?()"“”]+/g, " ")
    .replace(/\s+&\s+|\s+\+\s+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  // Drop linking words whose object was pulled out: "meeting for ¦me at ¦7pm
  // on ¦monday at scout hut" → "meeting at scout hut". Repeat until stable.
  for (let changed = true; changed; ) {
    changed = false;
    parts = parts.filter((w, i) => {
      const next = parts[i + 1];
      if (FILLER.has(w.toLowerCase()) && (next === undefined || next === GAP)) {
        changed = true;
        return false;
      }
      return true;
    });
  }
  parts = parts.filter((w) => w !== GAP);
  while (parts.length && FILLER.has(parts[0].toLowerCase())) parts.shift();
  while (parts.length && FILLER.has(parts[parts.length - 1].toLowerCase())) parts.pop();
  const s = parts.join(" ").replace(/^[-–.\s]+|[-–.\s]+$/g, "");
  return s ? s[0].toUpperCase() + s.slice(1) : "";
}

// ─── Public API ───────────────────────────────────────────────────────────

/** Longest span one message can create (one entry per day). */
const SPAN_MAX_DAYS = 31;

/**
 * A start and finish on different days ("from 6pm on 10 Oct to 9am on 11 Oct",
 * "Sat 6pm to Sun 9am", "Cornwall 20-24 Oct"). The planner stores one day per
 * entry, so this becomes one entry per day: first day from the start time,
 * middle days all day, last day until the finish time.
 */
function extractSpan(text: string, today: string) {
  const clean = normaliseSpokenTimes(stripFormatting(text).replace(/[–—]/g, "-"));
  // Repeats ("Tuesdays 4-5 until 15 Dec") are handled elsewhere.
  if (/\b(every|each|weekly|fortnightly|biweekly)\b|\b(mon|tues|wednes|thurs|fri|satur|sun)days\b/i.test(clean))
    return null;
  const base = parseISO(`${today}T12:00:00`);

  // "Fri 6 until Sat 10", "Sat 6pm to Sun 9am", "tonight 7 till tomorrow 11":
  // weekday + time → weekday + time, with the house am/pm rule on bare hours.
  const DAYW = String.raw`(today|tonight|tomorrow|(?:next\s+)?(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*)`;
  const T = String.raw`(\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?)`;
  const wk = new RegExp(
    String.raw`\b(?:from\s+)?${DAYW}\s+(?:at\s+)?${T}\s*(?:-|to|until|till|til)\s*${DAYW}\s+(?:at\s+)?${T}\b`,
    "i",
  ).exec(clean);
  if (wk) {
    const noRepeat: Repeat = { interval: 1, weeks: null, until: null, on: false };
    const startDay = extractDays(` ${wk[1].replace(/tonight/i, "today")} `, today, noRepeat).days[0];
    // The finish weekday is the first one on/after the start day.
    const endFromStart = extractDays(` ${wk[3].replace(/tonight/i, "today")} `, startDay ?? today, noRepeat).days[0];
    const startTime = extractTimes(` ${wk[2]} `, /tonight/i.test(wk[1]) ? "pm" : null).start;
    const endTime = extractTimes(` ${wk[4]} `).start;
    if (startDay && endFromStart && endFromStart > startDay && startTime && endTime) {
      const days = differenceInCalendarDays(parseISO(endFromStart), parseISO(startDay));
      if (days <= SPAN_MAX_DAYS) {
        return {
          rest: cut(clean, wk.index, wk[0].length),
          startDay,
          endDay: endFromStart,
          startTime,
          endTime,
        };
      }
    }
  }

  for (const r of chrono.en.GB.parse(clean, base, { forwardDate: true })) {
    if (!r.end) continue;
    // "Sat 10 until 13 Dec" means Saturdays at 10 until 13 Dec, not 10–13 Dec.
    if (/^(?:from\s+)?(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\s+\d{1,2}\b(?!\s*(?:st|nd|rd|th|\/|:|am|pm|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))/i.test(r.text))
      continue;
    const ymd = (c: typeof r.start) =>
      `${c.get("year")}-${pad(c.get("month")!)}-${pad(c.get("day")!)}`;
    const startDay = ymd(r.start);
    const endDay = ymd(r.end);
    const days = differenceInCalendarDays(parseISO(endDay), parseISO(startDay));
    if (days < 1 || days > SPAN_MAX_DAYS) continue;
    const hhmm = (c: typeof r.start) =>
      c.isCertain("hour") ? `${pad(c.get("hour")!)}:${pad(c.get("minute") ?? 0)}` : null;
    // chrono reads bare hours literally; apply the house am/pm rule to those.
    const houseRule = (c: typeof r.start) => {
      const t = hhmm(c);
      if (!t || c.isCertain("meridiem") || c.get("hour")! > 12) return t;
      const [h, m] = t.split(":").map(Number);
      return `${pad(bareHourTo24(h))}:${pad(m)}`;
    };
    // Strip "from"/"between" just before the matched text so it doesn't end up in the title.
    const before = clean.slice(0, r.index).replace(/\b(from|between)\s*$/i, "");
    return {
      rest: ` ${before} ${GAP} ${clean.slice(r.index + r.text.length)} `,
      startDay,
      endDay,
      startTime: houseRule(r.start),
      endTime: houseRule(r.end),
    };
  }
  return null;
}

/** Expand a span into one entry per day. */
function spanDays(span: NonNullable<ReturnType<typeof extractSpan>>) {
  const out: { day: string; startTime: string | null; endTime: string | null }[] = [];
  const total = differenceInCalendarDays(parseISO(span.endDay), parseISO(span.startDay));
  for (let i = 0; i <= total; i++) {
    const day = format(addDays(parseISO(`${span.startDay}T12:00:00`), i), "yyyy-MM-dd");
    if (i === 0 && span.startTime) out.push({ day, startTime: span.startTime, endTime: "23:59" });
    else if (i === total && span.endTime) out.push({ day, startTime: "00:00", endTime: span.endTime });
    else out.push({ day, startTime: null, endTime: null });
  }
  return out;
}

/** Parse a new-event message. `today` is YYYY-MM-DD in London. */
export function parseNewEvent(text: string, dir: Directory, today: string): ParseResult {
  const span = extractSpan(text, today);
  const when = span
    ? {
        rest: span.rest,
        times: { start: null, end: null },
        days: [span.startDay],
        seriesNote: null,
      }
    : extractWhen(text, today);
  let rest = when.rest;
  const times = when.times;
  if (when.days.length === 0) {
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
  const sharedWord = SHARED.exec(rest);
  if (sharedWord) rest = cut(rest, sharedWord.index, sharedWord[0].length);

  // Assignee: shared if "us"/"everyone" or more than one adult is named;
  // else a named helper, else a named person, else whoever posted it.
  const adults = new Set([...peopleRes.found.map((p) => p.id), ...(me ? [dir.senderId] : [])]);
  const shared = !!sharedWord || adults.size > 1;
  const helper = shared ? null : (helperRes.found[0] ?? null);
  const person = helper || shared ? null : (peopleRes.found[0] ?? null);
  const assigneeUserId = helper || shared ? null : (person?.id ?? dir.senderId);

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

  const fmt = (day: string, time: string | null) =>
    `${format(parseISO(`${day}T12:00:00`), "EEE d MMM")}${time ? ` ${time}` : ""}`;
  const spanLabel = span
    ? `${fmt(span.startDay, span.startTime)} → ${fmt(span.endDay, span.endTime)}`
    : null;
  const slots = span
    ? spanDays(span)
    : when.days.map((day) => ({ day, startTime, endTime }));

  return {
    ok: true,
    seriesNote: when.seriesNote,
    spanLabel,
    events: slots.map(({ day, startTime, endTime }) => ({
      title: title.slice(0, 200),
      day,
      startTime,
      endTime,
      notes: spanLabel ? [spanLabel, notes].filter(Boolean).join(" · ") : notes,
      kidIds: (sharedWord && WHOLE_FAMILY.test(sharedWord[1]) ? dir.kids : kidsRes.found).map(
        (k) => k.id,
      ),
      assigneeUserId,
      helperId: helper?.id ?? null,
    })),
  };
}

export type ThreadCommand =
  | { kind: "cancel" }
  | {
      kind: "change";
      title: string | null;
      shared: boolean;
      day: string | null;
      startTime: string | null;
      endTime: string | null;
      assigneeUserId: string | null;
      helperId: string | null;
    }
  | { kind: "unknown" };

/**
 * Parse a reply in a confirmation thread: "cancel", "5pm", "move to Fri",
 * "Ashley's doing it", "rename to Beavers meeting".
 */
export function parseThreadReply(text: string, dir: Directory, today: string): ThreadCommand {
  // Rename: "change to X", "rename it X", "call it X" — when X has no day/time in it.
  const rn =
    /^\s*(?:(?:can|could)\s+you\s+|please\s+)?(?:rename(?:\s+it)?|change(?:\s+(?:it|the\s+(?:name|title)|name|title))?|call\s+it|name\s+it)\s+(?:to\s+)?(.+?)[?.!\s]*$/i.exec(
      stripFormatting(text),
    );
  if (rn) {
    const w = extractWhen(rn[1], today);
    const title = tidyTitle(rn[1]);
    if (!w.times.start && !w.days.length && title) {
      return {
        kind: "change",
        title: title.slice(0, 200),
        shared: false,
        day: null,
        startTime: null,
        endTime: null,
        assigneeUserId: null,
        helperId: null,
      };
    }
  }

  if (/\b(cancel(?:led)?|delete|remove|scrap|not happening|called off)\b/i.test(text))
    return { kind: "cancel" };

  const when = extractWhen(text, today);
  const rest = when.rest;
  const times = when.times;
  const dates = { days: when.days };
  const peopleFound = findNames(rest, dir.people).found;
  const meFound = /\b(I'm|I'll|I|me)\b/i.test(rest);
  const shared =
    SHARED.test(rest) ||
    new Set([...peopleFound.map((p) => p.id), ...(meFound ? [dir.senderId] : [])]).size > 1;
  const helper = shared ? null : (findNames(rest, dir.helpers).found[0] ?? null);
  const person = helper || shared ? null : (peopleFound[0] ?? null);
  const me = !helper && !person && !shared && meFound;

  if (!times.start && !dates.days.length && !helper && !person && !me && !shared)
    return { kind: "unknown" };
  return {
    kind: "change",
    title: null,
    shared,
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
