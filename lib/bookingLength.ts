/**
 * Meeting-length helpers shared by the server (slot maths) and the browser
 * (link setup form). Kept dependency-free so the client bundle stays small.
 */
export type LengthKind = "minutes" | "half_day" | "full_day";

export function asLengthKind(v: string | null | undefined): LengthKind {
  return v === "half_day" || v === "full_day" ? v : "minutes";
}

/** "30 min", "2 hours", "Half day", "Whole day". */
export function lengthLabel(kind: LengthKind, minutes: number): string {
  if (kind === "full_day") return "Whole day";
  if (kind === "half_day") return "Half day";
  return minutes >= 60 && minutes % 60 === 0
    ? `${minutes / 60} hour${minutes === 60 ? "" : "s"}`
    : `${minutes} min`;
}
