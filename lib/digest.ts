import { format, parseISO } from "date-fns";
import type { createAdminClient } from "@/lib/supabase/admin";
import { SLOTS, STATUS_MAP } from "@/lib/constants";
import type { Slot, Status } from "@/lib/types";

/**
 * Household look-ahead used by the evening-before notification and the
 * "Heads up" warnings on the calendar: who's doing what, reminders, and gaps
 * or clashes (nobody on a school run, someone away but down for something).
 */

type Admin = ReturnType<typeof createAdminClient>;
type Named = { id: string; name: string };

export type DigestData = {
  people: Named[];
  kids: Named[];
  helpers: Named[];
  availability: { user_id: string; day: string; slot: Slot; status: Status | null }[];
  school: {
    day: string;
    time: string;
    kind: string;
    kid_id: string;
    assignee_user_id: string | null;
    helper_id: string | null;
  }[];
  events: {
    day: string;
    start_time: string | null;
    end_time: string | null;
    title: string;
    kid_ids: string[];
    assignee_user_id: string | null;
    helper_id: string | null;
  }[];
};

export async function loadDigestData(admin: Admin, from: string, to: string): Promise<DigestData> {
  const [p, k, h, a, s, e] = await Promise.all([
    admin.from("profiles").select("id, display_name, created_at").order("created_at"),
    admin.from("kids").select("id, name, sort_order").order("sort_order"),
    admin.from("helpers").select("id, name"),
    admin.from("availability").select("user_id, day, slot, status").gte("day", from).lte("day", to),
    admin
      .from("school_events")
      .select("day, time, kind, kid_id, assignee_user_id, helper_id")
      .gte("day", from)
      .lte("day", to),
    admin
      .from("week_events")
      .select("day, start_time, end_time, title, kid_ids, assignee_user_id, helper_id")
      .gte("day", from)
      .lte("day", to),
  ]);
  return {
    people: (p.data ?? [])
      .filter((x) => x.display_name?.trim())
      .map((x) => ({ id: x.id, name: x.display_name!.trim() })),
    kids: (k.data ?? []).map((x) => ({ id: x.id, name: x.name })),
    helpers: h.data ?? [],
    availability: a.data ?? [],
    school: s.data ?? [],
    events: (e.data ?? []).map((x) => ({ ...x, kid_ids: x.kid_ids ?? [] })),
  };
}

const UNAVAILABLE: Status[] = ["away", "travelling"];
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");
const dayName = (d: string) => format(parseISO(`${d}T12:00:00`), "EEE d MMM");

/** Which AM / PM / Eve slot a time falls in. */
function slotOf(time: string): Slot {
  if (time < "12:00") return "am";
  if (time < "17:00") return "pm";
  return "eve";
}

function statusAt(d: DigestData, userId: string, day: string, slot: Slot): Status | null {
  return (
    d.availability.find((a) => a.user_id === userId && a.day === day && a.slot === slot)?.status ??
    null
  );
}

function names(d: DigestData) {
  const person = new Map(d.people.map((p) => [p.id, p.name]));
  const kid = new Map(d.kids.map((k) => [k.id, k.name]));
  const helper = new Map(d.helpers.map((h) => [h.id, h.name]));
  return { person, kid, helper };
}

export type Issue = { day: string; text: string };

/** Gaps and clashes on the given days. */
export function findIssues(d: DigestData, days: string[]): Issue[] {
  const { person, kid } = names(d);
  const issues: Issue[] = [];
  const daySet = new Set(days);
  const slotLabel = (s: Slot) => SLOTS.find((x) => x.value === s)!.label;

  for (const s of d.school) {
    if (!daySet.has(s.day)) continue;
    const run = `${kid.get(s.kid_id) ?? ""}'s ${s.kind === "drop" ? "drop-off" : "pickup"} ${hhmm(s.time)}`;
    if (!s.assignee_user_id && !s.helper_id) {
      issues.push({ day: s.day, text: `Nobody is down for ${run}` });
      continue;
    }
    if (s.assignee_user_id) {
      const slot = slotOf(hhmm(s.time));
      const st = statusAt(d, s.assignee_user_id, s.day, slot);
      if (st && UNAVAILABLE.includes(st))
        issues.push({
          day: s.day,
          text: `${person.get(s.assignee_user_id)} is ${STATUS_MAP[st].label} ${slotLabel(slot)} but down for ${run}`,
        });
    }
  }

  for (const e of d.events) {
    if (!daySet.has(e.day) || !e.start_time) continue;
    const slot = slotOf(hhmm(e.start_time));
    if (e.assignee_user_id) {
      const st = statusAt(d, e.assignee_user_id, e.day, slot);
      if (st && UNAVAILABLE.includes(st))
        issues.push({
          day: e.day,
          text: `${person.get(e.assignee_user_id)} is ${STATUS_MAP[st].label} ${slotLabel(slot)} but down for ${e.title} ${hhmm(e.start_time)}`,
        });
    } else if (!e.helper_id && e.kid_ids.length) {
      // A kid's thing with no one named: flag if every adult is away then.
      const allAway =
        d.people.length > 0 &&
        d.people.every((p) => {
          const st = statusAt(d, p.id, e.day, slot);
          return st && UNAVAILABLE.includes(st);
        });
      if (allAway) {
        const kidsText = e.kid_ids
          .map((k) => kid.get(k))
          .filter(Boolean)
          .join(" & ");
        issues.push({
          day: e.day,
          text: `You're both away ${slotLabel(slot)} — ${kidsText} has ${e.title} ${hhmm(e.start_time)}`,
        });
      }
    }
  }
  return issues.sort((a, b) => a.day.localeCompare(b.day));
}

/** Short multi-line summary of `day` for one person (evening-before notification). */
export function summaryFor(d: DigestData, userId: string, day: string): string[] {
  const { person, kid, helper } = names(d);
  const lines: string[] = [];

  const myRuns = d.school
    .filter((s) => s.day === day && s.assignee_user_id === userId)
    .sort((a, b) => a.time.localeCompare(b.time))
    .map(
      (s) => `${s.kind === "drop" ? "Drop-off" : "Pickup"} ${hhmm(s.time)} (${kid.get(s.kid_id)})`,
    );
  if (myRuns.length) lines.push(`You're on: ${myRuns.join(", ")}`);

  const otherRuns = d.school
    .filter((s) => s.day === day && s.assignee_user_id !== userId)
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((s) => {
      const who =
        (s.helper_id && helper.get(s.helper_id)) ||
        (s.assignee_user_id && person.get(s.assignee_user_id)) ||
        "nobody yet";
      return `${s.kind === "drop" ? "Drop" : "Pickup"} ${hhmm(s.time)} ${kid.get(s.kid_id)}: ${who}`;
    });
  if (otherRuns.length) lines.push(otherRuns.join(" · "));

  const events = d.events
    .filter(
      (e) =>
        e.day === day &&
        (e.assignee_user_id === userId ||
          (!e.assignee_user_id && !e.helper_id) ||
          e.kid_ids.length > 0),
    )
    .sort((a, b) => (a.start_time ?? "00:00").localeCompare(b.start_time ?? "00:00"));
  const reminders = events.filter((e) => e.title.startsWith("🔔"));
  const plans = events.filter((e) => !e.title.startsWith("🔔"));
  if (plans.length)
    lines.push(
      plans
        .map((e) => {
          const kidsText = e.kid_ids
            .map((k) => kid.get(k))
            .filter(Boolean)
            .join(" & ");
          return `${e.start_time ? hhmm(e.start_time) : "All day"} ${e.title}${kidsText ? ` (${kidsText})` : ""}`;
        })
        .join(" · "),
    );
  if (reminders.length)
    lines.push(
      reminders
        .map((e) => {
          const kidsText = e.kid_ids
            .map((k) => kid.get(k))
            .filter(Boolean)
            .join(" & ");
          return `${e.title}${kidsText ? ` (${kidsText})` : ""}`;
        })
        .join(" · "),
    );

  for (const p of d.people.filter((x) => x.id !== userId)) {
    const statuses = SLOTS.map((s) => statusAt(d, p.id, day, s.value));
    if (!statuses.some(Boolean)) continue;
    const same = statuses.every((s) => s === statuses[0]);
    lines.push(
      `${p.name}: ${
        same
          ? STATUS_MAP[statuses[0]!].label + " all day"
          : SLOTS.flatMap((s, i) =>
              statuses[i] ? [`${s.label} ${STATUS_MAP[statuses[i]!].label}`] : [],
            ).join(", ")
      }`,
    );
  }

  for (const i of findIssues(d, [day])) lines.push(`⚠️ ${i.text}`);
  return lines;
}

export { dayName };
