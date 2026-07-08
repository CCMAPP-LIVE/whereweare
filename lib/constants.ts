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

/**
 * Fixed drop-off / pickup slots the nursery runs on. Used to constrain the
 * time selects on /school so David and Ashley pick from real options rather
 * than typing 08:47 by accident. Values stored as HH:mm; labels are the
 * human-facing 12-hour form.
 */
export const SCHOOL_DROP_TIMES: { value: string; label: string }[] = [
  { value: "08:00", label: "8:00 am" },
  { value: "08:45", label: "8:45 am" },
  { value: "09:15", label: "9:15 am" },
];

export const SCHOOL_PICKUP_TIMES: { value: string; label: string }[] = [
  { value: "15:15", label: "3:15 pm" },
  { value: "16:00", label: "4:00 pm" },
];

/**
 * Columns for the shared to-do kanban (/todos). `value` is stored in
 * `todos.status`; the order here is the left-to-right column order and also
 * defines which way the ‹ › move buttons step.
 */
export type TodoStatus = "todo" | "doing" | "done";

export const TODO_COLUMNS: { value: TodoStatus; label: string }[] = [
  { value: "todo", label: "To do" },
  { value: "doing", label: "In progress" },
  { value: "done", label: "Done" },
];

export const TODO_STATUSES: TodoStatus[] = TODO_COLUMNS.map((c) => c.value);
