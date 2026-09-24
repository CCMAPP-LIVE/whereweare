import { addDays, differenceInCalendarDays, format, getISODay, parseISO } from "date-fns";
import type { createAdminClient } from "@/lib/supabase/admin";
import {
  extractWhen,
  parseNewEvent,
  moveBase,
  notInPast,
  parseThreadReply,
  shiftEnd,
  tidyTitle,
  type Directory,
  type ParsedEvent,
} from "@/lib/quickAdd";
import {
  createWeekEvent,
  deleteWeekEvent,
  updateWeekEvent,
  type WeekEventInput,
} from "@/lib/weekEvents";

/**
 * The in-app assistant on top of the quick-add rules: works out whether a
 * message ADDS an event, CHANGES an existing one ("move swimming to Friday",
 * "cancel Legoland") or ASKS a question ("what's on tomorrow?", "who's doing
 * pickup Friday?"), and previews / applies it.
 */

type Admin = ReturnType<typeof createAdminClient>;

export type Summary = {
  title: string;
  when: string;
  kids: string[];
  who: string;
  count: number;
  notes: string | null;
};

/** Chips on the preview: override who's doing it and which kids. */
export type Overrides = {
  who?: string; // "me" | "p:<id>" | "h:<id>" | "shared"
  kids?: string[];
  flip?: boolean; // swap am/pm on the times
};

/** Move "07:30" ↔ "19:30" (keeping within the day). */
function flip12(t: string | null, toPm: boolean): string | null {
  if (!t) return t;
  const [h, m] = t.split(":").map(Number);
  const nh = toPm ? (h < 12 ? h + 12 : h) : h >= 12 ? h - 12 : h;
  return `${String(nh).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export type PreviewResult =
  | { ok: false; message: string }
  | {
      ok: true;
      kind: "add";
      summary: Summary;
      who: string;
      kids: string[];
      /** Whether the start is am/pm (null for all-day), for the am↔pm chip. */
      meridiem: "am" | "pm" | null;
      flipped: boolean;
    }
  | {
      ok: true;
      kind: "change";
      action: "move" | "cancel" | "update";
      title: string;
      before: string;
      after: string;
      count: number;
      note: string | null;
    }
  | { ok: true; kind: "answer"; heading: string; lines: string[] };

export type Snapshot = { id: string; input: WeekEventInput };

const QUESTION =
  /^\s*(what|what's|whats|who|who's|whos|when|when's|anything|is\s+there|are\s+we|do\s+we|have\s+we|show\s+me|list)\b|\?\s*$/i;
const CHANGE = /^\s*(cancel|delete|remove|scrap|move|reschedule|push|shift|change|rename|make)\b/i;

export function intentOf(text: string): "question" | "change" | "add" {
  if (CHANGE.test(text)) return "change";
  if (QUESTION.test(text)) return "question";
  return "add";
}

// ─── Shared formatting ────────────────────────────────────────────────────

const dayLabel = (day: string) => format(parseISO(`${day}T12:00:00`), "EEE d MMM");
const timeLabel = (s: string | null, e: string | null) =>
  s ? `${s.slice(0, 5)}${e ? `–${e.slice(0, 5)}` : ""}` : "all day";

function whoLabel(dir: Directory, ev: { assigneeUserId: string | null; helperId: string | null }) {
  return (
    dir.helpers.find((h) => h.id === ev.helperId)?.name ??
    dir.people.find((p) => p.id === ev.assigneeUserId)?.name ??
    dir.people.map((p) => p.name).join(" & ")
  );
}

function whoKey(ev: { assigneeUserId: string | null; helperId: string | null }, senderId: string) {
  if (ev.helperId) return `h:${ev.helperId}`;
  if (!ev.assigneeUserId) return "shared";
  return ev.assigneeUserId === senderId ? "me" : `p:${ev.assigneeUserId}`;
}

// ─── ADD ──────────────────────────────────────────────────────────────────

function applyOverrides(events: ParsedEvent[], o: Overrides | undefined, dir: Directory) {
  if (!o) return events;
  return events.map((ev) => {
    const out = { ...ev };
    if (o.who === "me") {
      out.assigneeUserId = dir.senderId;
      out.helperId = null;
    } else if (o.who === "shared") {
      out.assigneeUserId = null;
      out.helperId = null;
    } else if (o.who?.startsWith("p:") && dir.people.some((p) => p.id === o.who!.slice(2))) {
      out.assigneeUserId = o.who.slice(2);
      out.helperId = null;
    } else if (o.who?.startsWith("h:") && dir.helpers.some((h) => h.id === o.who!.slice(2))) {
      out.assigneeUserId = null;
      out.helperId = o.who.slice(2);
    }
    if (Array.isArray(o.kids))
      out.kidIds = dir.kids.filter((k) => o.kids!.includes(k.id)).map((k) => k.id);
    // am↔pm swap for timed single-day events (not the 00:00/23:59 parts of a span).
    if (o.flip && out.startTime && out.startTime !== "00:00" && out.endTime !== "23:59") {
      const toPm = Number(out.startTime.slice(0, 2)) < 12;
      out.startTime = flip12(out.startTime, toPm);
      out.endTime = flip12(out.endTime, toPm);
      if (out.endTime && out.startTime && out.endTime <= out.startTime) out.endTime = "23:59";
    }
    return out;
  });
}

function planAdd(text: string, dir: Directory, today: string, o?: Overrides) {
  const parsed = parseNewEvent(text, dir, today);
  if (!parsed.ok) return { error: parsed.message } as const;
  const events = applyOverrides(parsed.events, o, dir);
  const first = events[0];
  let when =
    parsed.spanLabel ?? `${dayLabel(first.day)}, ${timeLabel(first.startTime, first.endTime)}`;
  if (parsed.seriesNote) when += ` · repeats ${parsed.seriesNote}`;
  else if (!parsed.spanLabel && events.length > 1)
    when = `${events.map((e) => dayLabel(e.day)).join(" & ")}, ${timeLabel(first.startTime, first.endTime)}`;
  const summary: Summary = {
    title: first.title,
    when,
    kids: dir.kids.filter((k) => first.kidIds.includes(k.id)).map((k) => k.name),
    who: whoLabel(dir, first),
    count: events.length,
    notes: parsed.spanLabel ? null : first.notes,
  };
  const meridiem =
    first.startTime && !parsed.spanLabel
      ? Number(first.startTime.slice(0, 2)) < 12
        ? "am"
        : "pm"
      : null;
  return {
    events,
    summary,
    who: whoKey(first, dir.senderId),
    kids: first.kidIds,
    meridiem,
    flipped: !!o?.flip,
  } as const;
}

// ─── CHANGE ───────────────────────────────────────────────────────────────

type Row = {
  id: string;
  user_id: string;
  day: string;
  start_time: string | null;
  end_time: string | null;
  title: string;
  notes: string | null;
  kid_ids: string[];
  assignee_user_id: string | null;
  helper_id: string | null;
  google_event_id: string | null;
};

const toInput = (r: Row): WeekEventInput => ({
  title: r.title,
  day: r.day,
  startTime: r.start_time?.slice(0, 5) ?? null,
  endTime: r.end_time?.slice(0, 5) ?? null,
  notes: r.notes,
  kidIds: r.kid_ids,
  assigneeUserId: r.assignee_user_id,
  helperId: r.helper_id,
});

const STOP = new Set(
  "the a an my our on at for to of in with and event events thing appointment".split(" "),
);

/**
 * Work out a change request: which upcoming events it targets and what to do.
 * Target = words before " to " (or all the words for cancel / "make ..."),
 * matched against upcoming titles plus kid names. A day in the target part
 * narrows to that day ("cancel swimming on Tue").
 */
async function planChange(admin: Admin, text: string, dir: Directory, today: string) {
  const m = CHANGE.exec(text)!;
  const verb = m[1].toLowerCase();
  const rest = text.slice(m.index + m[0].length).trim();
  const isCancel = /^(cancel|delete|remove|scrap)$/.test(verb);

  // Split "swimming to Friday" into target / destination.
  let targetText = rest;
  let destText = "";
  if (!isCancel) {
    const idx = rest.toLowerCase().lastIndexOf(" to ");
    if (idx > 0) {
      targetText = rest.slice(0, idx);
      destText = rest.slice(idx + 4);
    } else if (verb === "make") {
      destText = rest; // "make swimming 5pm": target words + change in one
    }
  }

  const target = extractWhen(targetText, today);
  const narrowDay = target.days.length === 1 ? target.days[0] : null;
  const words = tidyTitle(target.rest)
    .toLowerCase()
    .replace(/'s\b/g, "")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w));
  if (!words.length)
    return { error: "Which event? e.g. “move swimming to Friday” or “cancel Legoland”." } as const;

  const { data } = await admin
    .from("week_events")
    .select(
      "id, user_id, day, start_time, end_time, title, notes, kid_ids, assignee_user_id, helper_id, google_event_id",
    )
    .gte("day", today)
    .lte("day", format(addDays(parseISO(`${today}T12:00:00`), 180), "yyyy-MM-dd"))
    .order("day");
  const rows = ((data ?? []) as Row[]).filter((r) => {
    const hay = [r.title, ...dir.kids.filter((k) => r.kid_ids.includes(k.id)).map((k) => k.name)]
      .join(" ")
      .toLowerCase();
    return words.every((w) => hay.includes(w)) && (!narrowDay || r.day === narrowDay);
  });
  if (!rows.length)
    return {
      error: `I couldn't find an upcoming event matching “${words.join(" ")}”.`,
      notFound: true,
    } as const;

  // One title only — otherwise ask which.
  const titles = [...new Set(rows.map((r) => r.title.toLowerCase()))];
  if (titles.length > 1) {
    const names = [...new Set(rows.map((r) => `${r.title} (${dayLabel(r.day)})`))].slice(0, 4);
    return {
      error: `Which one? ${names.join(", ")}. Add a word or the day to narrow it down.`,
    } as const;
  }

  const mine = rows.filter((r) => r.user_id === dir.senderId);
  const notMine = rows.length - mine.length;
  if (!mine.length) {
    const owner =
      dir.people.find((p) => p.id === rows[0].user_id)?.name ?? "the person who added it";
    return { error: `Only ${owner} can change “${rows[0].title}”.` } as const;
  }

  const first = mine[0];
  const before = `${dayLabel(first.day)}, ${timeLabel(first.start_time, first.end_time)}`;

  if (isCancel) {
    return {
      action: "cancel" as const,
      rows: mine,
      updates: [] as Snapshot[],
      preview: { title: first.title, before, after: "Removed", count: mine.length, notMine },
    };
  }

  // Rename vs. time/day/person change.
  const reply =
    verb === "rename"
      ? null
      : parseThreadReply(destText, dir, moveBase(destText, first.day, today));
  if (reply?.kind === "change") reply.day = notInPast(reply.day, today);
  const newTitle =
    verb === "rename" ||
    (reply?.kind === "unknown" && destText && !extractWhen(destText, today).days.length)
      ? tidyTitle(destText)
      : null;
  if (!newTitle && (!reply || reply.kind !== "change"))
    return {
      error: "What should change? e.g. “to Friday”, “to 5pm”, “to Ashley”, or “rename … to …”.",
    } as const;

  const shift =
    reply?.kind === "change" && reply.day
      ? differenceInCalendarDays(parseISO(reply.day), parseISO(first.day))
      : null;
  const updates: Snapshot[] = mine.map((r) => {
    const input = toInput(r);
    if (newTitle) input.title = newTitle.slice(0, 200);
    if (reply?.kind === "change") {
      if (shift !== null)
        input.day = format(addDays(parseISO(`${r.day}T12:00:00`), shift), "yyyy-MM-dd");
      if (reply.startTime) {
        input.endTime = reply.endTime ?? shiftEnd(input.startTime, input.endTime, reply.startTime);
        input.startTime = reply.startTime;
      }
      if (reply.shared) {
        input.assigneeUserId = null;
        input.helperId = null;
      } else if (reply.helperId || reply.assigneeUserId) {
        input.helperId = reply.helperId;
        input.assigneeUserId = reply.helperId ? null : reply.assigneeUserId;
      }
      if (reply.title) input.title = reply.title;
    }
    return { id: r.id, input };
  });
  const u = updates[0].input;
  const after = `${newTitle ? `“${u.title}” · ` : ""}${dayLabel(u.day)}, ${timeLabel(u.startTime, u.endTime)}${
    reply?.kind === "change" && (reply.shared || reply.helperId || reply.assigneeUserId)
      ? ` · ${whoLabel(dir, u)}`
      : ""
  }`;
  return {
    action: (shift !== null ? "move" : "update") as "move" | "update",
    rows: mine,
    updates,
    preview: { title: first.title, before, after, count: mine.length, notMine },
  };
}

// ─── ANSWER ───────────────────────────────────────────────────────────────

function rangeFor(text: string, today: string): { from: string; to: string; label: string } {
  const base = parseISO(`${today}T12:00:00`);
  const monday = addDays(base, 1 - getISODay(base));
  const f = (d: Date) => format(d, "yyyy-MM-dd");
  if (/\bnext\s+week\b/i.test(text))
    return { from: f(addDays(monday, 7)), to: f(addDays(monday, 13)), label: "Next week" };
  if (/\b(this\s+)?week\b/i.test(text))
    return { from: today, to: f(addDays(monday, 6)), label: "This week" };
  if (/\b(this\s+)?weekend\b/i.test(text)) {
    const sat = addDays(monday, getISODay(base) === 7 ? -1 : 5);
    return { from: f(sat), to: f(addDays(sat, 1)), label: "This weekend" };
  }
  const days = extractWhen(text, today).days;
  if (days.length)
    return { from: days[0], to: days[days.length - 1], label: days.map(dayLabel).join(" & ") };
  return { from: today, to: today, label: "Today" };
}

async function answer(admin: Admin, text: string, dir: Directory, today: string) {
  const range = rangeFor(text, today);
  const kidFilter = dir.kids.filter((k) => new RegExp(`\\b${k.name}`, "i").test(text));
  const schoolOnly = /\b(pick[\s-]?ups?|drop[\s-]?offs?|drops?|school\s+run|collect)/i.test(text);

  const [weekRes, schoolRes] = await Promise.all([
    schoolOnly
      ? Promise.resolve({ data: [] as Row[] })
      : admin
          .from("week_events")
          .select(
            "id, user_id, day, start_time, end_time, title, notes, kid_ids, assignee_user_id, helper_id, google_event_id",
          )
          .gte("day", range.from)
          .lte("day", range.to),
    admin
      .from("school_events")
      .select("day, time, kind, kid_id, assignee_user_id, helper_id")
      .gte("day", range.from)
      .lte("day", range.to),
  ]);

  type Line = { day: string; sort: string; text: string };
  const lines: Line[] = [];
  for (const r of (weekRes.data ?? []) as Row[]) {
    if (kidFilter.length && !kidFilter.some((k) => r.kid_ids.includes(k.id))) continue;
    const kids = dir.kids.filter((k) => r.kid_ids.includes(k.id)).map((k) => k.name);
    lines.push({
      day: r.day,
      sort: r.start_time ?? "00:00",
      text: `${timeLabel(r.start_time, r.end_time)} · ${r.title}${kids.length ? ` · ${kids.join(" & ")}` : ""} · ${whoLabel(dir, { assigneeUserId: r.assignee_user_id, helperId: r.helper_id })}`,
    });
  }
  for (const s of schoolRes.data ?? []) {
    if (kidFilter.length && !kidFilter.some((k) => k.id === s.kid_id)) continue;
    if (schoolOnly && /drop/i.test(text) && !/pick|collect/i.test(text) && s.kind !== "drop")
      continue;
    if (schoolOnly && /pick|collect/i.test(text) && !/drop/i.test(text) && s.kind !== "pickup")
      continue;
    const kid = dir.kids.find((k) => k.id === s.kid_id)?.name ?? "";
    const who =
      dir.helpers.find((h) => h.id === s.helper_id)?.name ??
      dir.people.find((p) => p.id === s.assignee_user_id)?.name ??
      "nobody yet";
    lines.push({
      day: s.day,
      sort: s.time,
      text: `${s.time.slice(0, 5)} · ${s.kind === "drop" ? "Drop-off" : "Pickup"} · ${kid} · ${who}`,
    });
  }
  lines.sort((a, b) => (a.day + a.sort).localeCompare(b.day + b.sort));

  const out: string[] = [];
  let lastDay = "";
  for (const l of lines) {
    if (l.day !== lastDay) {
      out.push(`**${dayLabel(l.day)}**`);
      lastDay = l.day;
    }
    out.push(l.text);
  }
  return {
    heading: range.label,
    lines: out.length ? out : ["Nothing planned."],
  };
}

// ─── Entry points ─────────────────────────────────────────────────────────

/**
 * "Make cakes for the school fair Fri" starts like a change but is an add:
 * if nothing matched and the verb is make/change, treat it as a new event.
 */
function addFallback(c: { error?: string; notFound?: boolean }, text: string) {
  return !!c.notFound && /^\s*(make|change)\b/i.test(text);
}

export async function preview(
  admin: Admin,
  text: string,
  dir: Directory,
  today: string,
  overrides?: Overrides,
): Promise<PreviewResult> {
  const intent = intentOf(text);
  if (intent === "question") {
    const a = await answer(admin, text, dir, today);
    return { ok: true, kind: "answer", ...a };
  }
  if (intent === "change") {
    const c = await planChange(admin, text, dir, today);
    if (c.error !== undefined && !addFallback(c, text)) return { ok: false, message: c.error };
    if (c.error === undefined)
      return {
        ok: true,
        kind: "change",
        action: c.action,
        title: c.preview.title,
        before: c.preview.before,
        after: c.preview.after,
        count: c.preview.count,
        note: c.preview.notMine ? `${c.preview.notMine} added by someone else won't change.` : null,
      };
  }
  const a = planAdd(text, dir, today, overrides);
  if ("error" in a) return { ok: false, message: a.error! };
  return {
    ok: true,
    kind: "add",
    summary: a.summary,
    who: a.who,
    kids: a.kids,
    meridiem: a.meridiem,
    flipped: a.flipped,
  };
}

/**
 * Apply. Returns what's needed to undo: `created` ids to delete, and
 * `restore` snapshots (previous versions of changed/deleted events).
 */
export async function apply(
  admin: Admin,
  text: string,
  dir: Directory,
  today: string,
  overrides?: Overrides,
): Promise<
  | { ok: false; message: string }
  | {
      ok: true;
      message: string;
      created: string[];
      restore: Snapshot[];
      removed: Snapshot[];
      lifeSynced: boolean;
    }
> {
  const intent = intentOf(text);
  if (intent === "question") return { ok: false, message: "That's a question — press Ask." };

  const c = intent === "change" ? await planChange(admin, text, dir, today) : null;
  if (c && c.error !== undefined && !addFallback(c, text)) return { ok: false, message: c.error };
  if (c && c.error === undefined) {
    const snapshots = c.rows.map((r) => ({ id: r.id, input: toInput(r) }));
    let lifeSynced = true;
    if (c.action === "cancel") {
      for (const r of c.rows) await deleteWeekEvent(admin, r.id, r.google_event_id);
      return {
        ok: true,
        message: `Removed ${c.preview.title}${c.rows.length > 1 ? ` (${c.rows.length} entries)` : ""}`,
        created: [],
        restore: [],
        removed: snapshots,
        lifeSynced,
      };
    }
    for (const u of c.updates) {
      const row = c.rows.find((r) => r.id === u.id)!;
      const res = await updateWeekEvent(admin, u.id, u.input, row.google_event_id);
      if (!res.lifeSynced) lifeSynced = false;
    }
    return {
      ok: true,
      message: `Changed ${c.preview.title} → ${c.preview.after}${c.rows.length > 1 ? ` (${c.rows.length} entries)` : ""}`,
      created: [],
      restore: snapshots,
      removed: [],
      lifeSynced,
    };
  }

  const a = planAdd(text, dir, today, overrides);
  if ("error" in a) return { ok: false, message: a.error! };
  const created: string[] = [];
  let lifeSynced = true;
  try {
    for (const ev of a.events) {
      const res = await createWeekEvent(admin, dir.senderId, ev);
      created.push(res.id);
      if (!res.lifeSynced) lifeSynced = false;
    }
  } catch (e) {
    for (const id of created) await deleteWeekEvent(admin, id, null).catch(() => {});
    return { ok: false, message: (e as Error).message };
  }
  return {
    ok: true,
    message: `Added ${a.summary.title} · ${a.summary.when}`,
    created,
    restore: [],
    removed: [],
    lifeSynced,
  };
}

/** Snapshots come back from the browser on undo, so re-check their shape. */
function clean(input: WeekEventInput): WeekEventInput | null {
  const T = /^\d{2}:\d{2}$/;
  if (typeof input?.title !== "string" || !input.title.trim()) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.day ?? "")) return null;
  return {
    title: input.title.trim().slice(0, 200),
    day: input.day,
    startTime: input.startTime && T.test(input.startTime) ? input.startTime : null,
    endTime: input.endTime && T.test(input.endTime) ? input.endTime : null,
    notes: typeof input.notes === "string" ? input.notes.slice(0, 2000) : null,
    kidIds: Array.isArray(input.kidIds) ? input.kidIds.filter((k) => typeof k === "string") : [],
    assigneeUserId: typeof input.assigneeUserId === "string" ? input.assigneeUserId : null,
    helperId: typeof input.helperId === "string" ? input.helperId : null,
  };
}

/** Undo: delete what was created, put changed events back, re-create removed ones. */
export async function undo(
  admin: Admin,
  userId: string,
  payload: { created?: string[]; restore?: Snapshot[]; removed?: Snapshot[] },
) {
  const created = (payload.created ?? []).slice(0, 60);
  if (created.length) {
    const { data } = await admin
      .from("week_events")
      .select("id, user_id, google_event_id")
      .in("id", created);
    for (const r of data ?? [])
      if (r.user_id === userId) await deleteWeekEvent(admin, r.id, r.google_event_id);
  }
  const restore = (payload.restore ?? []).slice(0, 60);
  if (restore.length) {
    const { data } = await admin
      .from("week_events")
      .select("id, user_id, google_event_id")
      .in(
        "id",
        restore.map((s) => s.id),
      );
    for (const s of restore) {
      const row = (data ?? []).find((r) => r.id === s.id);
      const input = clean(s.input);
      if (row && input && row.user_id === userId)
        await updateWeekEvent(admin, s.id, input, row.google_event_id);
    }
  }
  for (const s of (payload.removed ?? []).slice(0, 60)) {
    const input = clean(s.input);
    if (input) await createWeekEvent(admin, userId, input);
  }
}
