import type { Enums } from "./database.types";

export type Slot = Enums<"availability_slot">; // 'am' | 'pm' | 'eve'
export type Status = Enums<"availability_status">; // 'home' | 'office' | 'away' | 'travelling'
export type Provider = Enums<"calendar_provider">; // 'google' | 'microsoft'

/** A calendar event normalised across Google and Microsoft. */
export type NormalizedEvent = {
  id: string;
  title: string;
  /** ISO timestamp (or YYYY-MM-DD for all-day). */
  start: string;
  end: string;
  allDay: boolean;
  calendarExternalId: string;
  color: string | null;
  /** User-facing name for the source calendar (custom label, or its own title). */
  calendarLabel: string;
  provider: Provider;
};

export type SlotValue = {
  status: Status | null;
  note: string | null;
};

export type PersonLite = {
  id: string;
  name: string;
};
