import { SLOTS, STATUS_MAP } from "./constants";
import type { Slot, SlotValue } from "./types";

export type DaySlots = Partial<Record<Slot, SlotValue>>;

/**
 * Collapse a person's AM/PM/Eve statuses for one day into a single calendar
 * event title + description. Returns null when nothing is set (so the syncer
 * deletes any existing event for the day).
 *
 *  - all slots same status  -> "David – Home"
 *  - mixed                  -> "David – AM Office · PM Away"
 *  - notes (if any)         -> collected into the description
 */
export function buildDaySummary(
  name: string,
  slots: DaySlots,
): { title: string; description: string } | null {
  const filled = SLOTS.filter((s) => slots[s.value]?.status);
  if (filled.length === 0) return null;

  const statuses = filled.map((s) => slots[s.value]!.status!);
  const allSame = statuses.every((st) => st === statuses[0]);

  let title: string;
  if (allSame && filled.length === SLOTS.length) {
    title = `${name} – ${STATUS_MAP[statuses[0]].label}`;
  } else {
    const parts = filled.map(
      (s) => `${s.label} ${STATUS_MAP[slots[s.value]!.status!].label}`,
    );
    title = `${name} – ${parts.join(" · ")}`;
  }

  const notes = SLOTS.flatMap((s) => {
    const note = slots[s.value]?.note?.trim();
    return note ? [`${s.label}: ${note}`] : [];
  });

  return { title, description: notes.join("\n") };
}
