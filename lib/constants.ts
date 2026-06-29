import type { Slot, Status } from "./types";

export const STATUSES: {
  value: Status;
  label: string;
  color: string;
  emoji: string;
}[] = [
  { value: "home", label: "Home", color: "#16a34a", emoji: "🏠" },
  { value: "office", label: "Office", color: "#2563eb", emoji: "🏢" },
  { value: "away", label: "Away", color: "#d97706", emoji: "📍" },
  { value: "travelling", label: "Travelling", color: "#7c3aed", emoji: "🧳" },
];

export const STATUS_MAP: Record<Status, (typeof STATUSES)[number]> =
  Object.fromEntries(STATUSES.map((s) => [s.value, s])) as Record<
    Status,
    (typeof STATUSES)[number]
  >;

export const SLOTS: { value: Slot; label: string }[] = [
  { value: "am", label: "AM" },
  { value: "pm", label: "PM" },
  { value: "eve", label: "Eve" },
];

/** How many weeks (starting this Monday) to show and sync. */
export const WEEKS_TO_SHOW = 3;

export const APP_NAME = "Where We Are";
export const APP_TIMEZONE = "Europe/London";
