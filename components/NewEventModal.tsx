"use client";

import { useState } from "react";
import { dayLabel } from "@/lib/time";
import { SCHOOL_DROP_TIMES, SCHOOL_PICKUP_TIMES } from "@/lib/constants";

type Person = { id: string; name: string };
type Kid = { id: string; name: string };
type Helper = { id: string; name: string };

type Category = "general" | "school-drop" | "school-pickup";

type Props = {
  defaultDate: string;
  people: Person[];
  kids: Kid[];
  helpers: Helper[];
  currentUserId: string;
  onClose: () => void;
  onCreated: () => void;
};

export default function NewEventModal({
  defaultDate,
  people,
  kids,
  helpers,
  currentUserId,
  onClose,
  onCreated,
}: Props) {
  const [category, setCategory] = useState<Category>("general");

  // General-event fields.
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [notes, setNotes] = useState("");

  // School-event fields.
  const [kidId, setKidId] = useState<string>("");
  const [schoolTime, setSchoolTime] = useState<string>("");
  const [assignee, setAssignee] = useState<string>(`user:${currentUserId}`); // "user:UUID" | "helper:UUID"

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { weekday, date: dateLabel } = dayLabel(date);
  const schoolTimes =
    category === "school-drop" ? SCHOOL_DROP_TIMES : SCHOOL_PICKUP_TIMES;

  function decodeAssignee(v: string): {
    assigneeUserId: string | null;
    helperId: string | null;
  } {
    if (v.startsWith("helper:")) return { assigneeUserId: null, helperId: v.slice(7) };
    if (v.startsWith("user:")) return { assigneeUserId: v.slice(5), helperId: null };
    return { assigneeUserId: null, helperId: null };
  }

  async function handleSave() {
    setError(null);

    if (category === "general") {
      if (!title.trim()) {
        setError("Please enter a title.");
        return;
      }
    } else {
      if (!kidId) {
        setError("Please pick a kid.");
        return;
      }
      if (!schoolTime) {
        setError("Please pick a time.");
        return;
      }
    }

    setSaving(true);
    try {
      let res: Response;
      if (category === "general") {
        res = await fetch("/api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            date,
            startTime: allDay ? null : startTime,
            endTime: allDay ? null : endTime,
            notes: notes.trim() || null,
          }),
        });
      } else {
        const { assigneeUserId, helperId } = decodeAssignee(assignee);
        res = await fetch("/api/school-events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kidId,
            day: date,
            kind: category === "school-drop" ? "drop" : "pickup",
            time: schoolTime,
            assigneeUserId,
            helperId,
            notes: notes.trim() || null,
          }),
        });
      }

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `Error ${res.status}`);
      }
      onCreated();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

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
          <h3 className="font-semibold">New event</h3>
          <button onClick={onClose} className="text-sm text-neutral-400">
            Cancel
          </button>
        </div>

        <div className="mb-4">
          <div className="mb-1 text-xs font-medium uppercase text-neutral-400">
            Category
          </div>
          <div className="flex flex-wrap gap-1.5">
            <CategoryChip
              label="General event"
              active={category === "general"}
              onClick={() => setCategory("general")}
            />
            <CategoryChip
              label="🎒 School drop-off"
              active={category === "school-drop"}
              onClick={() => {
                setCategory("school-drop");
                setSchoolTime("");
              }}
            />
            <CategoryChip
              label="🎒 School pickup"
              active={category === "school-pickup"}
              onClick={() => {
                setCategory("school-pickup");
                setSchoolTime("");
              }}
            />
          </div>
        </div>

        {category === "general" ? (
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase text-neutral-400">
                Title
              </span>
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Dentist, Aquarium, Dinner…"
                className="w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase text-neutral-400">
                Date
              </span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
              />
              {date && (
                <p className="mt-0.5 text-xs text-neutral-400">
                  {weekday}, {dateLabel}
                </p>
              )}
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
                      className="w-full rounded-lg border border-black/10 bg-transparent px-2 py-1.5 text-sm dark:border-white/10"
                    />
                  </label>
                  <label className="flex-1 text-sm">
                    <span className="mb-1 block text-neutral-500">End</span>
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full rounded-lg border border-black/10 bg-transparent px-2 py-1.5 text-sm dark:border-white/10"
                    />
                  </label>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="mb-1 text-xs font-medium uppercase text-neutral-400">
                For which kid
              </div>
              {kids.length === 0 ? (
                <p className="text-xs text-neutral-400">
                  Add a kid on the People page first.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {kids.map((k) => (
                    <CategoryChip
                      key={k.id}
                      label={k.name}
                      active={kidId === k.id}
                      onClick={() => setKidId(k.id)}
                      amber
                    />
                  ))}
                </div>
              )}
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase text-neutral-400">
                Day
              </span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
              />
              {date && (
                <p className="mt-0.5 text-xs text-neutral-400">
                  {weekday}, {dateLabel}
                </p>
              )}
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase text-neutral-400">
                Time
              </span>
              <select
                value={schoolTime}
                onChange={(e) => setSchoolTime(e.target.value)}
                className="w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
              >
                <option value="">Pick a slot…</option>
                {schoolTimes.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase text-neutral-400">
                Who's doing it
              </span>
              <select
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                className="w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
              >
                <option value="">by …</option>
                {people.length > 0 && (
                  <optgroup label="People">
                    {people.map((p) => (
                      <option key={p.id} value={`user:${p.id}`}>
                        {p.name}
                        {p.id === currentUserId ? " (you)" : ""}
                      </option>
                    ))}
                  </optgroup>
                )}
                {helpers.length > 0 && (
                  <optgroup label="Helpers">
                    {helpers.map((h) => (
                      <option key={h.id} value={`helper:${h.id}`}>
                        {h.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </label>
          </div>
        )}

        <div className="mt-4">
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

        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-5 w-full rounded-xl bg-teal-600 px-4 py-2.5 font-medium text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {saving ? "Adding…" : "Add to Life Calendar"}
        </button>

        <p className="mt-2 text-center text-[11px] text-neutral-400">
          Adds to the shared Life Calendar on Google Calendar
        </p>
      </div>
    </div>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
  amber = false,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  amber?: boolean;
}) {
  const activeStyle = amber
    ? "border-amber-500 bg-amber-200/70 text-amber-900 dark:bg-amber-500/30 dark:text-amber-100"
    : "border-teal-600 bg-teal-600 text-white";
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full border px-2.5 py-1 text-xs transition " +
        (active
          ? activeStyle
          : "border-black/15 text-neutral-500 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10")
      }
    >
      {label}
    </button>
  );
}
