import { SLOTS, STATUS_MAP } from "./constants";
import type { Slot, SlotValue } from "./types";

export type DaySlots = Partial<Record<Slot, SlotValue>>;
export type DayTimes = { leave?: string | null; return?: string | null };

/**
 * Collapse a person's AM/PM/Eve statuses and their out/back times for one day
 * into a single calendar event title + description. Returns null when nothing
 * is set (so the syncer deletes any existing event for the day).
 *
 *  - all slots same status      -> "David – Home"
 *  - mixed                      -> "David – AM Office · PM Away"
 *  - with times                 -> "… · Out 08:30, Back 18:00"
 *  - only times set             -> "David – Out 08:30, Back 18:00"
 */
export function buildDaySummary(
  name: string,
  slots: DaySlots,
  times?: DayTimes,
): { title: string; description: string } | null {
  const filled = SLOTS.filter((s) => slots[s.value]?.status);

  const timeBits: string[] = [];
  if (times?.leave) timeBits.push(`Out ${times.leave}`);
  if (times?.return) timeBits.push(`Back ${times.return}`);

  if (filled.length === 0 && timeBits.length === 0) return null;

  let title: string;
  if (filled.length > 0) {
    const statuses = filled.map((s) => slots[s.value]!.status!);
    const allSame = statuses.every((st) => st === statuses[0]);
    if (allSame && filled.length === SLOTS.length) {
      title = `${name} – ${STATUS_MAP[statuses[0]].label}`;
    } else {
      const parts = filled.map(
        (s) => `${s.label} ${STATUS_MAP[slots[s.value]!.status!].label}`,
      );
      title = `${name} – ${parts.join(" · ")}`;
    }
    if (timeBits.length) title += ` · ${timeBits.join(", ")}`;
  } else {
    title = `${name} – ${timeBits.join(", ")}`;
  }

  const notes = SLOTS.flatMap((s) => {
    const note = slots[s.value]?.note?.trim();
    return note ? [`${s.label}: ${note}`] : [];
  });

  return { title, description: notes.join("\n") };
}
