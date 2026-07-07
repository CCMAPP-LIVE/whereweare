"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dayLabel, shiftAnchor } from "@/lib/time";

export type WeekEvent = {
  id: string;
  userId: string;
  day: string;
  startTime: string | null;
  endTime: string | null;
  title: string;
  notes: string | null;
  assigneeUserId: string | null;
  kidIds: string[];
};

export type WeekNotes = {
  weekStart: string;
  thisWeek: string;
  nextWeek: string;
};

type Person = { id: string; name: string };
type Kid = { id: string; name: string };

type Props = {
  currentUserId: string;
  people: Person[];
  kids: Kid[];
  days: string[];
  today: string;
  anchor: string;
  initialEvents: WeekEvent[];
  initialNotes: WeekNotes;
};

export default function PlanView({
  currentUserId,
  people,
  kids,
  days,
  today,
  anchor,
  initialEvents,
  initialNotes,
}: Props) {
  const [events, setEvents] = useState<WeekEvent[]>(initialEvents);
  const [notes, setNotes] = useState<WeekNotes>(initialNotes);
  const [editing, setEditing] = useState<{ day: string; event: WeekEvent | null } | null>(null);
  const [notesSaving, setNotesSaving] = useState(false);
  const router = useRouter();
  const [, startTransition] = useTransition();

  const nameOf = useMemo(() => {
    const map = new Map(people.map((p) => [p.id, p.name] as const));
    return (userId: string | null) => (userId ? map.get(userId) ?? null : null);
  }, [people]);

  const kidNamesOf = useMemo(() => {
    const map = new Map(kids.map((k) => [k.id, k.name] as const));
    return (ids: string[]) =>
      ids.map((id) => map.get(id)).filter((n): n is string => !!n);
  }, [kids]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, WeekEvent[]>();
    for (const ev of events) {
      const list = map.get(ev.day) ?? [];
      list.push(ev);
      map.set(ev.day, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));
    }
    return map;
  }, [events]);

  function navigate(nextAnchor: string) {
    startTransition(() => router.push(`/plan?date=${nextAnchor}`));
  }

  async function saveNotes(next: WeekNotes) {
    setNotes(next);
    setNotesSaving(true);
    try {
      await fetch("/api/week-notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekStart: next.weekStart,
          thisWeek: next.thisWeek,
          nextWeek: next.nextWeek,
        }),
      });
    } finally {
      setNotesSaving(false);
    }
  }

  async function saveEvent(input: {
    id?: string;
    day: string;
    title: string;
    startTime: string | null;
    endTime: string | null;
    assigneeUserId: string | null;
    kidIds: string[];
    notes: string | null;
  }) {
    const body = JSON.stringify({
      day: input.day,
      title: input.title,
      startTime: input.startTime,
      endTime: input.endTime,
      assigneeUserId: input.assigneeUserId,
      kidIds: input.kidIds,
      notes: input.notes,
    });
    if (input.id) {
      await fetch(`/api/week-events/${input.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body,
      });
      setEvents((cur) =>
        cur.map((e) =>
          e.id === input.id
            ? {
                ...e,
                day: input.day,
                title: input.title,
                startTime: input.startTime,
                endTime: input.endTime,
                assigneeUserId: input.assigneeUserId,
                kidIds: input.kidIds,
                notes: input.notes,
              }
            : e,
        ),
      );
    } else {
      const res = await fetch("/api/week-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      const json = await res.json().catch(() => ({}));
      if (json?.ok && json.id) {
        setEvents((cur) => [
          ...cur,
          {
            id: json.id,
            userId: currentUserId,
            day: input.day,
            title: input.title,
            startTime: input.startTime,
            endTime: input.endTime,
            assigneeUserId: input.assigneeUserId,
            kidIds: input.kidIds,
            notes: input.notes,
          },
        ]);
      }
    }
    setEditing(null);
  }

  async function deleteEvent(id: string) {
    if (!confirm("Delete this event? It will also be removed from the Life calendar."))
      return;
    setEvents((cur) => cur.filter((e) => e.id !== id));
    setEditing(null);
    await fetch(`/api/week-events/${id}`, { method: "DELETE" });
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-3 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button
            aria-label="Previous week"
            onClick={() => navigate(shiftAnchor("week", anchor, -1))}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-black/10 text-lg leading-none hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
          >
            ‹
          </button>
          <button
            onClick={() => navigate(today)}
            className="h-8 rounded-lg border border-black/10 px-3 text-sm hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
          >
            This week
          </button>
          <button
            aria-label="Next week"
            onClick={() => navigate(shiftAnchor("week", anchor, 1))}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-black/10 text-lg leading-none hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
          >
            ›
          </button>
        </div>
        <h1 className="text-lg font-semibold sm:text-xl">Plan the week</h1>
      </div>

      <section className="mb-4 rounded-2xl border border-black/10 p-3 dark:border-white/10">
        <label className="block">
          <div className="mb-1 text-xs font-medium uppercase text-neutral-400">
            This week
          </div>
          <textarea
            value={notes.thisWeek}
            onChange={(e) => setNotes((cur) => ({ ...cur, thisWeek: e.target.value }))}
            onBlur={() => saveNotes(notes)}
            rows={2}
            placeholder="e.g. No Forest School · Karolina on holiday"
            className="w-full rounded-lg border border-black/10 bg-transparent px-2 py-1.5 text-sm dark:border-white/10"
          />
        </label>
        <label className="mt-2 block">
          <div className="mb-1 text-xs font-medium uppercase text-neutral-400">
            Reminders for next week
          </div>
          <textarea
            value={notes.nextWeek}
            onChange={(e) => setNotes((cur) => ({ ...cur, nextWeek: e.target.value }))}
            onBlur={() => saveNotes(notes)}
            rows={2}
            placeholder="e.g. Tues DrA gone · Ashley dentist Wed · settling session Thurs"
            className="w-full rounded-lg border border-black/10 bg-transparent px-2 py-1.5 text-sm dark:border-white/10"
          />
        </label>
        <p className="mt-1 text-[11px] text-neutral-400">
          {notesSaving ? "Saving…" : "Auto-saves when you leave the field."}
        </p>
      </section>

      <div className="grid gap-2">
        {days.map((day) => {
          const list = eventsByDay.get(day) ?? [];
          const { weekday, date } = dayLabel(day);
          const isToday = day === today;
          return (
            <section
              key={day}
              className={
                "rounded-2xl border p-3 " +
                (isToday
                  ? "border-teal-500/40 bg-teal-50/40 dark:border-teal-500/30 dark:bg-teal-950/20"
                  : "border-black/10 dark:border-white/10")
              }
            >
              <header className="mb-2 flex items-baseline justify-between">
                <h2 className="text-base font-semibold">
                  {weekday}{" "}
                  <span className="ml-1 text-sm font-normal text-neutral-400">
                    {date}
                  </span>
                  {isToday && (
                    <span className="ml-2 rounded-full bg-teal-600 px-2 py-0.5 text-[10px] font-medium uppercase text-white">
                      Today
                    </span>
                  )}
                </h2>
                <div className="flex gap-1.5">
                  <a
                    href={`/messages?day=${day}`}
                    className="rounded-lg border border-black/10 px-2 py-1 text-xs hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
                  >
                    💬 Message
                  </a>
                  <button
                    onClick={() => setEditing({ day, event: null })}
                    className="rounded-lg border border-black/10 px-2 py-1 text-xs hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
                  >
                    + Add event
                  </button>
                </div>
              </header>

              {list.length === 0 ? (
                <p className="text-xs text-neutral-400">No events yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {list.map((ev) => (
                    <li
                      key={ev.id}
                      className="flex items-start gap-2 rounded-lg bg-black/5 px-2 py-1.5 text-sm dark:bg-white/5"
                    >
                      <span className="min-w-[3.5rem] shrink-0 text-xs font-medium tabular-nums text-neutral-500">
                        {ev.startTime ? ev.startTime.slice(0, 5) : "All day"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <span className="font-medium">{ev.title}</span>
                          {kidNamesOf(ev.kidIds).map((name) => (
                            <span
                              key={name}
                              className="rounded-full bg-amber-200/70 px-1.5 py-0.5 text-[10px] text-amber-900 dark:bg-amber-500/20 dark:text-amber-200"
                            >
                              {name}
                            </span>
                          ))}
                          {ev.assigneeUserId && (
                            <span className="rounded-full bg-white/60 px-1.5 py-0.5 text-[10px] text-neutral-600 dark:bg-white/10 dark:text-neutral-300">
                              by {nameOf(ev.assigneeUserId) ?? "Someone"}
                            </span>
                          )}
                        </div>
                        {ev.notes && (
                          <p className="mt-0.5 text-xs text-neutral-500">{ev.notes}</p>
                        )}
                      </div>
                      {ev.userId === currentUserId && (
                        <button
                          onClick={() => setEditing({ day, event: ev })}
                          className="shrink-0 text-xs text-neutral-400 hover:text-teal-600"
                        >
                          Edit
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {editing && (
        <EventEditor
          day={editing.day}
          event={editing.event}
          people={people}
          kids={kids}
          currentUserId={currentUserId}
          onClose={() => setEditing(null)}
          onSave={saveEvent}
          onDelete={deleteEvent}
        />
      )}
    </main>
  );
}

function EventEditor({
  day,
  event,
  people,
  kids,
  currentUserId,
  onClose,
  onSave,
  onDelete,
}: {
  day: string;
  event: WeekEvent | null;
  people: Person[];
  kids: Kid[];
  currentUserId: string;
  onClose: () => void;
  onSave: (input: {
    id?: string;
    day: string;
    title: string;
    startTime: string | null;
    endTime: string | null;
    assigneeUserId: string | null;
    kidIds: string[];
    notes: string | null;
  }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(event?.title ?? "");
  const [eventDay, setEventDay] = useState(event?.day ?? day);
  const [allDay, setAllDay] = useState(!event?.startTime);
  const [startTime, setStartTime] = useState(event?.startTime?.slice(0, 5) ?? "08:00");
  const [endTime, setEndTime] = useState(event?.endTime?.slice(0, 5) ?? "");
  const [assigneeUserId, setAssigneeUserId] = useState<string>(
    event?.assigneeUserId ?? currentUserId,
  );
  const [kidIds, setKidIds] = useState<string[]>(event?.kidIds ?? []);
  const [notes, setNotes] = useState(event?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleKid(id: string) {
    setKidIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  async function handleSave() {
    if (!title.trim()) {
      setError("Please enter a title.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        id: event?.id,
        day: eventDay,
        title: title.trim(),
        startTime: allDay ? null : startTime,
        endTime: allDay ? null : endTime || null,
        assigneeUserId: assigneeUserId || null,
        kidIds,
        notes: notes.trim() || null,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const { weekday, date: dateLabel } = dayLabel(eventDay);

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
          <h3 className="font-semibold">{event ? "Edit event" : "New event"}</h3>
          <button onClick={onClose} className="text-sm text-neutral-400">
            Cancel
          </button>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase text-neutral-400">
              Title
            </span>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. School drop-off, Dentist, Aquarium…"
              className="w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
            />
          </label>

          <div>
            <span className="mb-1 block text-xs font-medium uppercase text-neutral-400">
              For which kids
            </span>
            {kids.length === 0 ? (
              <p className="text-[11px] text-neutral-400">
                Add kids on the People page first.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {kids.map((k) => {
                  const active = kidIds.includes(k.id);
                  return (
                    <button
                      key={k.id}
                      type="button"
                      onClick={() => toggleKid(k.id)}
                      className={
                        "rounded-full border px-2.5 py-1 text-xs transition " +
                        (active
                          ? "border-amber-500 bg-amber-200/70 text-amber-900 dark:bg-amber-500/30 dark:text-amber-100"
                          : "border-black/15 text-neutral-500 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10")
                      }
                    >
                      {k.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase text-neutral-400">
              Who's doing it
            </span>
            <select
              value={assigneeUserId ?? ""}
              onChange={(e) => setAssigneeUserId(e.target.value)}
              className="w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
            >
              <option value="">Nobody in particular</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.id === currentUserId ? " (you)" : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase text-neutral-400">
              Day
            </span>
            <input
              type="date"
              value={eventDay}
              onChange={(e) => setEventDay(e.target.value)}
              className="w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
            />
            <p className="mt-0.5 text-xs text-neutral-400">
              {weekday}, {dateLabel}
            </p>
          </label>

          <div>
            <label className="mb-2 flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
                className="accent-teal-600"
              />
              All-day event
            </label>
            {!allDay && (
              <div className="flex gap-3">
                <label className="flex-1 text-sm">
                  <span className="mb-1 block text-neutral-500">Start</span>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full rounded-lg border border-black/10 bg-transparent px-2 py-1.5 dark:border-white/10"
                  />
                </label>
                <label className="flex-1 text-sm">
                  <span className="mb-1 block text-neutral-500">
                    End (optional)
                  </span>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full rounded-lg border border-black/10 bg-transparent px-2 py-1.5 dark:border-white/10"
                  />
                </label>
              </div>
            )}
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase text-neutral-400">
              Notes (optional)
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Any extra details…"
              className="w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
            />
          </label>
        </div>

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          {event && (
            <button
              onClick={() => onDelete(event.id)}
              disabled={saving}
              className="rounded-xl border border-red-500/50 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950/40"
            >
              Delete
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-xl bg-teal-600 px-4 py-2.5 font-medium text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : event ? "Save changes" : "Add to Life Calendar"}
          </button>
        </div>

        {!event && (
          <p className="mt-2 text-center text-[11px] text-neutral-400">
            Pushes to the shared Life Calendar on Google Calendar
          </p>
        )}
      </div>
    </div>
  );
}
