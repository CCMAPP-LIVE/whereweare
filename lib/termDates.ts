import { addDays, format, parseISO } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Imported school calendar days ("🏫 Half Term" entries) grouped back into
 * ranges for the print / share views: "Half Term · Percy · Mon 26 – Fri 30 Oct".
 */
export type TermRange = { title: string; kids: string[]; start: string; end: string; days: number };

export async function loadTermRanges(
  db: SupabaseClient<Database>,
  from: string,
  to: string,
  kidFilter: string | null = null,
): Promise<TermRange[]> {
  const [{ data: rows }, { data: kids }] = await Promise.all([
    db
      .from("week_events")
      .select("title, day, kid_ids")
      .like("title", "🏫 %")
      .gte("day", from)
      .lte("day", to)
      .order("day"),
    db.from("kids").select("id, name, sort_order").order("sort_order"),
  ]);
  const kidName = new Map((kids ?? []).map((k) => [k.id, k.name]));
  const out: TermRange[] = [];
  const open = new Map<string, TermRange>(); // title|kids → current range
  for (const r of rows ?? []) {
    const ids: string[] = r.kid_ids ?? [];
    if (kidFilter && ids.length && !ids.includes(kidFilter)) continue;
    const title = r.title.replace(/^🏫\s*/, "");
    const names = ids.map((k) => kidName.get(k)).filter((n): n is string => !!n);
    const key = `${title}|${names.join(",")}`;
    const cur = open.get(key);
    // Continue a range across weekends (holidays skip Sat/Sun on import).
    const gap = cur
      ? (parseISO(`${r.day}T12:00:00`).getTime() - parseISO(`${cur.end}T12:00:00`).getTime()) /
        864e5
      : Infinity;
    if (cur && gap <= 3) {
      cur.end = r.day;
      cur.days++;
    } else {
      const next = { title, kids: names, start: r.day, end: r.day, days: 1 };
      out.push(next);
      open.set(key, next);
    }
  }
  return out;
}

export function rangeLabel(r: TermRange): string {
  const s = parseISO(`${r.start}T12:00:00`);
  const e = parseISO(`${r.end}T12:00:00`);
  if (r.start === r.end) return format(s, "EEE d MMM yyyy");
  const sameMonth = format(s, "MMM yyyy") === format(e, "MMM yyyy");
  return `${format(s, sameMonth ? "EEE d" : "EEE d MMM")} – ${format(e, "EEE d MMM yyyy")}`;
}

export function termText(ranges: TermRange[], heading: string): string {
  const lines = [`*${heading}*`, ""];
  for (const r of ranges)
    lines.push(`🏫 ${r.title}${r.kids.length ? ` (${r.kids.join(" & ")})` : ""}: ${rangeLabel(r)}`);
  if (ranges.length === 0) lines.push("No school days off found — import term dates in Settings.");
  return lines.join("\n");
}

export const termWindow = (today: string, days = 400) => ({
  from: today,
  to: format(addDays(parseISO(`${today}T12:00:00`), days), "yyyy-MM-dd"),
});
