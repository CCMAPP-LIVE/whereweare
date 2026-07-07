"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SLOTS, STATUSES, STATUS_MAP } from "@/lib/constants";
import { dayLabel, shiftAnchor, viewRangeLabel, type CalView } from "@/lib/time";
import type { Slot, Status } from "@/lib/types";
import NewEventModal from "@/components/NewEventModal";

export type EventLite = {
  id: string;
  title: string;
  time: string;
  color: string | null;
  calendarLabel: string;
  provider: "google" | "microsoft";
};

type SlotVal = { status: Status | null; note: string | null };
type DaySlots = Partial<Record<Slot, SlotVal>>;
type DayTimes = { leave: string | null; return: string | null };
type AvailabilityMap = Record<string, Record<string, DaySlots>>;
type TimesMap = Record<string, Record<string, DayTimes>>;
type EventsMap = Record<string, Record<string, EventLite[]>>;

type Props = {
  currentUserId: string;
  people: { id: string; name: string }[];
  days: string[];
  today: string;
  view: CalView;
  anchor: string;
  availability: AvailabilityMap;
  times: TimesMap;
  events: EventsMap;
  calendarsConfigured: boolean;
};

const VIEWS: { value: CalView; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

export default function CalendarView({
  currentUserId,
  people,
  days,
  today,
  view,
  anchor,
  availability,
  times,
  events,
  calendarsConfigured,
}: Props) {
  const [avail, setAvail] = useState<AvailabilityMap>(availability);
  const [dayTimes, setDayTimes] = useState<TimesMap>(times);
  const [editing, setEditing] = useState<string | null>(null);
  const [addingEvent, setAddingEvent] = useState(false);
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const orderedPeople = useMemo(() => {
    const me = people.find((p) => p.id === currentUserId);
    const others = people.filter((p) => p.id !== currentUserId);
    return me ? [me, ...others] : people;
  }, [people, currentUserId]);

  function navigate(nextView: CalView, nextAnchor: string) {
    startTransition(() => {
      router.push(`/?view=${nextView}&date=${nextAnchor}`);
    });
  }

  /** Order to cycle through when a status chip is tapped on the day card. */
  const CYCLE: (Status | null)[] = [null, "home", "office", "away", "travelling"];

  /** Tap-to-cycle a single slot on the current user's row — home → office →
   *  away → travelling → clear → home. Persists optimistically. */
  async function cycleSlot(day: string, slot: Slot) {
    const current = avail[currentUserId]?.[day]?.[slot]?.status ?? null;
    const idx = CYCLE.indexOf(current);
    const next = CYCLE[(idx + 1) % CYCLE.length];
    const note = avail[currentUserId]?.[day]?.[slot]?.note ?? null;

    setAvail((cur) => {
      const dayMap = { ...(cur[currentUserId]?.[day] ?? {}) };
      dayMap[slot] = { status: next, note };
      return {
        ...cur,
        [currentUserId]: { ...(cur[currentUserId] ?? {}), [day]: dayMap },
      };
    });

    await fetch("/api/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ day, slot, status: next, note }),
    }).catch(() => {});
  }

  async function saveDay(day: string, slots: DaySlots, t: DayTimes) {
    const prevSlots = avail[currentUserId]?.[day] ?? {};
    const prevTimes = dayTimes[currentUserId]?.[day] ?? { leave: null, return: null };

    setAvail((cur) => ({
      ...cur,
      [currentUserId]: { ...cur[currentUserId], [day]: slots },
    }));
    setDayTimes((cur) => ({
      ...cur,
      [currentUserId]: { ...cur[currentUserId], [day]: t },
    }));
    setEditing(null);

    for (const { value: slot } of SLOTS) {
      const before = prevSlots[slot];
      const after = slots[slot];
      const changed =
        (before?.status ?? null) !== (after?.status ?? null) ||
        (before?.note ?? null) !== (after?.note ?? null);
      if (!changed) continue;
      await fetch("/api/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          day,
          slot,
          status: after?.status ?? null,
          note: after?.note ?? null,
        }),
      }).catch(() => {});
    }

    if (prevTimes.leave !== t.leave || prevTimes.return !== t.return) {
      await fetch("/api/day-times", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day, leaveTime: t.leave, returnTime: t.return }),
      }).catch(() => {});
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-3 sm:p-5">
      <Toolbar
        view={view}
        anchor={anchor}
        today={today}
        label={viewRangeLabel(view, anchor, days)}
        busy={pending}
        onNavigate={navigate}
        onNewEvent={() => setAddingEvent(true)}
      />
      <Legend />
      {!calendarsConfigured && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          Calendar sync isn’t configured yet — showing availability only. Connect
          calendars in Settings once setup is complete.
        </p>
      )}

      <div
        className={
          pending
            ? "pointer-events-none opacity-50 transition-opacity"
            : "transition-opacity"
        }
      >
        {view === "month" ? (
          <MonthGrid
            days={days}
            anchor={anchor}
            today={today}
            people={orderedPeople}
            avail={avail}
            events={events}
            onPickDay={(day) => navigate("day", day)}
          />
        ) : (
          <div className="grid gap-2">
            {days.map((day) => (
              <DayCard
                key={day}
                day={day}
                isToday={day === today}
                people={orderedPeople}
                currentUserId={currentUserId}
                avail={avail}
                dayTimes={dayTimes}
                events={events}
                onEdit={() => setEditing(day)}
                onCycleSlot={(slot) => cycleSlot(day, slot)}
              />
            ))}
          </div>
        )}
      </div>

      {editing && (
        <DayEditor
          day={editing}
          initialSlots={avail[currentUserId]?.[editing] ?? {}}
          initialTimes={
            dayTimes[currentUserId]?.[editing] ?? { leave: null, return: null }
          }
          onClose={() => setEditing(null)}
          onSave={(slots, t) => saveDay(editing, slots, t)}
        />
      )}

      {addingEvent && (
        <NewEventModal
          defaultDate={view === "day" ? anchor : today >= days[0] && today <= days[days.length - 1] ? today : days[0]}
          onClose={() => setAddingEvent(false)}
          onCreated={() => router.refresh()}
        />
      )}
    </main>
  );
}

function Toolbar({
  view,
  anchor,
  today,
  label,
  busy,
  onNavigate,
  onNewEvent,
}: {
  view: CalView;
  anchor: string;
  today: string;
  label: string;
  busy: boolean;
  onNavigate: (view: CalView, anchor: string) => void;
  onNewEvent: () => void;
}) {
  return (
    // Two rows on phone (nav+label, then view+add), one row on tablet up.
    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      {/* Row 1: prev / today / next + range label. Buttons big enough to tap. */}
      <div className="flex items-center gap-1.5">
        <button
          aria-label="Previous"
          onClick={() => onNavigate(view, shiftAnchor(view, anchor, -1))}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-black/10 text-xl leading-none hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10 sm:h-8 sm:w-8 sm:text-lg"
        >
          ‹
        </button>
        <button
          onClick={() => onNavigate(view, today)}
          className="h-10 shrink-0 rounded-lg border border-black/10 px-3 text-sm hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10 sm:h-8"
        >
          Today
        </button>
        <button
          aria-label="Next"
          onClick={() => onNavigate(view, shiftAnchor(view, anchor, 1))}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-black/10 text-xl leading-none hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10 sm:h-8 sm:w-8 sm:text-lg"
        >
          ›
        </button>
        <h2 className="ml-1 flex min-w-0 items-center gap-2 truncate text-base font-semibold sm:text-lg">
          <span className="truncate">{label}</span>
          {busy && (
            <svg
              className="h-4 w-4 shrink-0 animate-spin text-teal-600"
              viewBox="0 0 24 24"
              fill="none"
              aria-label="Loading"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-90"
                fill="currentColor"
                d="M4 12a8 8 0 0 1 8-8V0C5.4 0 0 5.4 0 12h4z"
              />
            </svg>
          )}
        </h2>
      </div>

      {/* Row 2: view switcher + add event. Full width on phone so the buttons
          are wide and easy to hit; compact + right-aligned on tablet up. */}
      <div className="flex items-center gap-2 sm:ml-auto">
        <div className="inline-flex flex-1 rounded-lg border border-black/10 p-0.5 dark:border-white/10 sm:flex-none">
          {VIEWS.map((v) => {
            const active = v.value === view;
            return (
              <button
                key={v.value}
                onClick={() => onNavigate(v.value, anchor)}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm transition sm:flex-none sm:py-1 ${
                  active
                    ? "bg-teal-600 text-white"
                    : "text-neutral-500 hover:bg-black/5 dark:hover:bg-white/10"
                }`}
              >
                {v.label}
              </button>
            );
          })}
        </div>
        <button
          onClick={onNewEvent}
          aria-label="Add event"
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-teal-600 px-3 text-sm font-medium text-white hover:bg-teal-700 sm:h-8"
        >
          <span className="text-base leading-none">+</span>
          <span>Add</span>
        </button>
      </div>
    </div>
  );
}

function Legend() {
  // Hidden on phones — the emoji + colour on each chip already conveys this,
  // and every row saved is another day visible without scrolling.
  return (
    <div className="mb-3 hidden flex-wrap gap-2 px-1 text-xs text-neutral-500 sm:flex">
      {STATUSES.map((s) => (
        <span key={s.value} className="inline-flex items-center gap-1">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: s.color }}
          />
          {s.label}
        </span>
      ))}
    </div>
  );
}

function TimesLine({ t }: { t?: DayTimes }) {
  if (!t || (!t.leave && !t.return)) return null;
  return (
    <div className="mt-1 text-[11px] text-neutral-500">
      {t.leave && <span>🚪 Out {t.leave}</span>}
      {t.leave && t.return && <span> · </span>}
      {t.return && <span>🏡 Back {t.return}</span>}
    </div>
  );
}

function DayCard({
  day,
  isToday,
  people,
  currentUserId,
  avail,
  dayTimes,
  events,
  onEdit,
  onCycleSlot,
}: {
  day: string;
  isToday: boolean;
  people: { id: string; name: string }[];
  currentUserId: string;
  avail: AvailabilityMap;
  dayTimes: TimesMap;
  events: EventsMap;
  onEdit: () => void;
  onCycleSlot: (slot: Slot) => void;
}) {
  const { weekday, date } = dayLabel(day);
  return (
    <div
      className={`rounded-2xl border p-3 ${
        isToday
          ? "border-teal-500 bg-teal-50/50 dark:bg-teal-950/20"
          : "border-black/10 dark:border-white/10"
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="font-semibold">{weekday}</span>
          <span className="text-sm text-neutral-400">{date}</span>
          {isToday && (
            <span className="rounded-full bg-teal-600 px-2 py-0.5 text-[10px] font-medium text-white">
              Today
            </span>
          )}
        </div>
        {/* Details/Notes button — bigger tap target than the old text link, and
            only surfaces the sheet when you need notes or out/back times. */}
        <button
          onClick={onEdit}
          aria-label="Edit day details"
          className="rounded-lg px-2 py-1 text-xs text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-950/30"
        >
          Notes …
        </button>
      </div>

      {/* One row per person on phones: [name] [AM] [PM] [EVE]. Two-column
          grid on tablet+ preserves the roomier desktop layout. */}
      <div className="flex flex-col gap-2 sm:grid sm:grid-cols-2 sm:gap-3">
        {people.map((p) => {
          const isMe = p.id === currentUserId;
          const t = dayTimes[p.id]?.[day];
          const evs = events[p.id]?.[day] ?? [];
          return (
            <div key={p.id} className="min-w-0">
              {/* Phone: name inline with chips (single tall row).
                  Tablet+: name above chips (looks like the old card). */}
              <div className="flex items-center gap-2 sm:mb-1 sm:flex-col sm:items-start">
                <span className="w-16 shrink-0 truncate text-sm font-medium sm:w-auto">
                  {p.name}
                </span>
                <div className="grid flex-1 grid-cols-3 gap-1.5">
                  {SLOTS.map((s) => {
                    const val = avail[p.id]?.[day]?.[s.value];
                    return (
                      <SlotChip
                        key={s.value}
                        slotLabel={s.label}
                        status={val?.status ?? null}
                        note={val?.note ?? null}
                        editable={isMe}
                        onTap={isMe ? () => onCycleSlot(s.value) : undefined}
                      />
                    );
                  })}
                </div>
              </div>
              <TimesLine t={t} />
              <EventList items={evs} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** A single AM / PM / EVE status chip. Tap to cycle when it's your row. */
function SlotChip({
  slotLabel,
  status,
  note,
  editable,
  onTap,
}: {
  slotLabel: string;
  status: Status | null;
  note: string | null;
  editable: boolean;
  onTap?: () => void;
}) {
  const meta = status ? STATUS_MAP[status] : null;
  const bg = meta ? `${meta.color}1a` : "transparent";
  const fg = meta ? meta.color : undefined;
  const border = meta ? `${meta.color}55` : undefined;

  const content = (
    <>
      <span className="text-[10px] font-medium uppercase tracking-wide opacity-60">
        {slotLabel}
      </span>
      <span className="flex min-h-6 items-center justify-center gap-1 text-sm">
        {meta ? (
          <>
            <span aria-hidden>{meta.emoji}</span>
            <span className="truncate">{meta.label}</span>
          </>
        ) : (
          <span className="text-neutral-300 dark:text-neutral-600">—</span>
        )}
      </span>
      {note && (
        <span className="truncate text-[10px] opacity-60" title={note}>
          {note}
        </span>
      )}
    </>
  );

  // 44px keeps the tap target above the iOS HIG minimum without ballooning
  // vertical space; content stays centred if there's no note.
  const commonClasses =
    "flex min-h-[44px] flex-col items-center justify-center rounded-lg border px-1 py-0.5 text-center transition";

  if (editable && onTap) {
    return (
      <button
        type="button"
        onClick={onTap}
        aria-label={`${slotLabel}: ${meta?.label ?? "not set"} — tap to change`}
        className={`${commonClasses} active:scale-[0.98]`}
        style={{
          background: bg,
          color: fg,
          borderColor: border ?? "rgba(0,0,0,0.08)",
        }}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className={commonClasses}
      style={{
        background: bg,
        color: fg,
        borderColor: border ?? "rgba(0,0,0,0.08)",
      }}
    >
      {content}
    </div>
  );
}

function EventList({ items }: { items: EventLite[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-2 space-y-0.5 border-t border-black/5 pt-2 dark:border-white/5">
      {items.map((ev) => (
        <li
          key={ev.id}
          title={ev.calendarLabel}
          className="flex items-center gap-1.5 text-[11px] text-neutral-500"
        >
          <span
            className="inline-block h-2 w-2 shrink-0 rounded-full"
            style={{ background: ev.color ?? "#9ca3af" }}
          />
          <span className="shrink-0 tabular-nums">{ev.time}</span>
          <span className="max-w-[72px] shrink-0 truncate rounded bg-black/5 px-1 text-[9px] uppercase tracking-wide text-neutral-400 dark:bg-white/10">
            {ev.calendarLabel}
          </span>
          <span className="truncate">{ev.title}</span>
        </li>
      ))}
    </ul>
  );
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function MonthGrid({
  days,
  anchor,
  today,
  people,
  avail,
  events,
  onPickDay,
}: {
  days: string[];
  anchor: string;
  today: string;
  people: { id: string; name: string }[];
  avail: AvailabilityMap;
  events: EventsMap;
  onPickDay: (day: string) => void;
}) {
  const anchorMonth = anchor.slice(0, 7);
  return (
    <div>
      <div className="mb-1 grid grid-cols-7 gap-1 px-0.5 text-center text-[11px] font-medium uppercase tracking-wide text-neutral-400">
        {WEEKDAY_LABELS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const inMonth = day.slice(0, 7) === anchorMonth;
          const isToday = day === today;
          return (
            <button
              key={day}
              onClick={() => onPickDay(day)}
              className={`flex min-h-[68px] flex-col gap-1 rounded-lg border p-1 text-left transition hover:bg-black/5 dark:hover:bg-white/10 ${
                isToday
                  ? "border-teal-500 bg-teal-50/50 dark:bg-teal-950/20"
                  : "border-black/10 dark:border-white/10"
              } ${inMonth ? "" : "opacity-40"}`}
            >
              <span
                className={`text-xs ${
                  isToday ? "font-semibold text-teal-600" : "text-neutral-500"
                }`}
              >
                {Number(day.slice(8, 10))}
              </span>
              <div className="flex flex-col gap-0.5">
                {people.map((p) => {
                  const hasEvents = (events[p.id]?.[day]?.length ?? 0) > 0;
                  return (
                    <div
                      key={p.id}
                      className="flex items-center gap-1"
                      title={p.name}
                    >
                      <span className="w-2.5 shrink-0 text-[8px] font-medium uppercase text-neutral-400">
                        {p.name.slice(0, 1)}
                      </span>
                      <SlotDots slots={avail[p.id]?.[day]} />
                      {hasEvents && (
                        <span className="ml-auto h-1 w-1 shrink-0 rounded-full bg-neutral-400" />
                      )}
                    </div>
                  );
                })}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SlotDots({ slots }: { slots?: DaySlots }) {
  return (
    <div className="flex gap-0.5">
      {SLOTS.map((s) => {
        const status = slots?.[s.value]?.status;
        const meta = status ? STATUS_MAP[status] : null;
        return (
          <span
            key={s.value}
            title={`${s.label}${meta ? `: ${meta.label}` : ""}`}
            className="h-1.5 w-1.5 rounded-full"
            style={
              meta
                ? { background: meta.color }
                : { boxShadow: "inset 0 0 0 1px rgba(120,120,120,0.35)" }
            }
          />
        );
      })}
    </div>
  );
}

function DayEditor({
  day,
  initialSlots,
  initialTimes,
  onClose,
  onSave,
}: {
  day: string;
  initialSlots: DaySlots;
  initialTimes: DayTimes;
  onClose: () => void;
  onSave: (slots: DaySlots, times: DayTimes) => void;
}) {
  const [draft, setDraft] = useState<DaySlots>(() => ({ ...initialSlots }));
  const [leave, setLeave] = useState<string>(initialTimes.leave ?? "");
  const [back, setBack] = useState<string>(initialTimes.return ?? "");
  const { weekday, date } = dayLabel(day);

  function setSlot(slot: Slot, status: Status | null) {
    setDraft((d) => ({ ...d, [slot]: { status, note: d[slot]?.note ?? null } }));
  }
  function setNote(slot: Slot, note: string) {
    setDraft((d) => ({
      ...d,
      [slot]: { status: d[slot]?.status ?? null, note: note || null },
    }));
  }
  function setAllDay(status: Status | null) {
    setDraft((d) => {
      const next: DaySlots = { ...d };
      for (const { value: slot } of SLOTS) {
        next[slot] = { status, note: d[slot]?.note ?? null };
      }
      return next;
    });
  }
  const allDayStatus: Status | null | undefined = (() => {
    const first = draft[SLOTS[0].value]?.status ?? null;
    return SLOTS.every((s) => (draft[s.value]?.status ?? null) === first)
      ? first
      : undefined;
  })();

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="pb-safe max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl dark:bg-neutral-900 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">
            {weekday} <span className="text-neutral-400">{date}</span>
          </h3>
          <button onClick={onClose} className="text-sm text-neutral-400">
            Cancel
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <div className="mb-1 text-xs font-medium uppercase text-neutral-400">
              All day
            </div>
            <div className="flex flex-wrap gap-1.5">
              <OptionButton
                active={allDayStatus === null}
                label="—"
                color="#9ca3af"
                onClick={() => setAllDay(null)}
              />
              {STATUSES.map((st) => (
                <OptionButton
                  key={st.value}
                  active={allDayStatus === st.value}
                  label={`${st.emoji} ${st.label}`}
                  color={st.color}
                  onClick={() => setAllDay(st.value)}
                />
              ))}
            </div>
            <div className="mt-2 border-t border-black/10 pt-3 dark:border-white/10" />
          </div>
          {SLOTS.map((s) => {
            const cur = draft[s.value]?.status ?? null;
            return (
              <div key={s.value}>
                <div className="mb-1 text-xs font-medium uppercase text-neutral-400">
                  {s.label}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <OptionButton
                    active={cur === null}
                    label="—"
                    color="#9ca3af"
                    onClick={() => setSlot(s.value, null)}
                  />
                  {STATUSES.map((st) => (
                    <OptionButton
                      key={st.value}
                      active={cur === st.value}
                      label={`${st.emoji} ${st.label}`}
                      color={st.color}
                      onClick={() => setSlot(s.value, st.value)}
                    />
                  ))}
                </div>
                <input
                  value={draft[s.value]?.note ?? ""}
                  onChange={(e) => setNote(s.value, e.target.value)}
                  placeholder="Add a note (optional)"
                  className="mt-1.5 w-full rounded-lg border border-black/10 bg-transparent px-2 py-1 text-sm dark:border-white/10"
                />
              </div>
            );
          })}

          <div className="border-t border-black/10 pt-3 dark:border-white/10">
            <div className="mb-1.5 text-xs font-medium uppercase text-neutral-400">
              Out &amp; back times
            </div>
            <div className="flex gap-3">
              <label className="flex-1 text-sm">
                <span className="mb-1 block text-neutral-500">🚪 Out at</span>
                <input
                  type="time"
                  value={leave}
                  onChange={(e) => setLeave(e.target.value)}
                  className="w-full rounded-lg border border-black/10 bg-transparent px-2 py-1.5 dark:border-white/10"
                />
              </label>
              <label className="flex-1 text-sm">
                <span className="mb-1 block text-neutral-500">🏡 Back at</span>
                <input
                  type="time"
                  value={back}
                  onChange={(e) => setBack(e.target.value)}
                  className="w-full rounded-lg border border-black/10 bg-transparent px-2 py-1.5 dark:border-white/10"
                />
              </label>
            </div>
          </div>
        </div>

        <button
          onClick={() =>
            onSave(draft, { leave: leave || null, return: back || null })
          }
          className="mt-5 w-full rounded-xl bg-teal-600 px-4 py-2.5 font-medium text-white hover:bg-teal-700"
        >
          Save
        </button>
      </div>
    </div>
  );
}

function OptionButton({
  active,
  label,
  color,
  onClick,
}: {
  active: boolean;
  label: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border px-2.5 py-1 text-sm transition"
      style={
        active
          ? { background: color, borderColor: color, color: "white" }
          : { borderColor: `${color}55`, color }
      }
    >
      {label}
    </button>
  );
}
