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

      <div className={pending ? "opacity-60 transition-opacity" : "transition-opacity"}>
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
  onNavigate,
  onNewEvent,
}: {
  view: CalView;
  anchor: string;
  today: string;
  label: string;
  onNavigate: (view: CalView, anchor: string) => void;
  onNewEvent: () => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <button
          aria-label="Previous"
          onClick={() => onNavigate(view, shiftAnchor(view, anchor, -1))}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-black/10 text-lg leading-none hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
        >
          ‹
        </button>
        <button
          onClick={() => onNavigate(view, today)}
          className="h-8 rounded-lg border border-black/10 px-3 text-sm hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
        >
          Today
        </button>
        <button
          aria-label="Next"
          onClick={() => onNavigate(view, shiftAnchor(view, anchor, 1))}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-black/10 text-lg leading-none hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
        >
          ›
        </button>
      </div>

      <h2 className="text-base font-semibold sm:text-lg">{label}</h2>

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={onNewEvent}
          className="flex h-8 items-center gap-1.5 rounded-lg bg-teal-600 px-3 text-sm font-medium text-white hover:bg-teal-700"
        >
          <span className="text-base leading-none">+</span>
          <span>Add event</span>
        </button>

        <div className="inline-flex rounded-lg border border-black/10 p-0.5 dark:border-white/10">
          {VIEWS.map((v) => {
            const active = v.value === view;
            return (
              <button
                key={v.value}
                onClick={() => onNavigate(v.value, anchor)}
                className={`rounded-md px-3 py-1 text-sm transition ${
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
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="mb-3 flex flex-wrap gap-2 px-1 text-xs text-neutral-500">
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
}: {
  day: string;
  isToday: boolean;
  people: { id: string; name: string }[];
  currentUserId: string;
  avail: AvailabilityMap;
  dayTimes: TimesMap;
  events: EventsMap;
  onEdit: () => void;
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
      <div className="mb-2 flex items-baseline gap-2">
        <span className="font-semibold">{weekday}</span>
        <span className="text-sm text-neutral-400">{date}</span>
        {isToday && (
          <span className="rounded-full bg-teal-600 px-2 py-0.5 text-[10px] font-medium text-white">
            Today
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {people.map((p) => {
          const isMe = p.id === currentUserId;
          return (
            <div key={p.id}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-medium">{p.name}</span>
                {isMe && (
                  <button
                    onClick={onEdit}
                    className="text-xs text-teal-600 hover:underline"
                  >
                    Edit
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-1">
                {SLOTS.map((s) => {
                  const val = avail[p.id]?.[day]?.[s.value];
                  const meta = val?.status ? STATUS_MAP[val.status] : null;
                  return (
                    <div key={s.value} className="flex items-center gap-2 text-sm">
                      <span className="w-7 shrink-0 text-[11px] uppercase text-neutral-400">
                        {s.label}
                      </span>
                      {meta ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs"
                          style={{ background: `${meta.color}1a`, color: meta.color }}
                          title={val?.note ?? undefined}
                        >
                          <span>{meta.emoji}</span>
                          {meta.label}
                          {val?.note ? (
                            <span className="opacity-70">· {val.note}</span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-300 dark:text-neutral-600">
                          —
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              <TimesLine t={dayTimes[p.id]?.[day]} />
              <EventList items={events[p.id]?.[day] ?? []} />
            </div>
          );
        })}
      </div>
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
          className="flex items-center gap-1.5 text-[11px] text-neutral-500"
        >
          <span
            className="inline-block h-2 w-2 shrink-0 rounded-full"
            style={{ background: ev.color ?? "#9ca3af" }}
          />
          <span className="shrink-0 tabular-nums">{ev.time}</span>
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
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl dark:bg-neutral-900 sm:rounded-2xl"
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
