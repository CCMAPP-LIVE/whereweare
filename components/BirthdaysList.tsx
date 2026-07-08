"use client";

import { useMemo, useState } from "react";

export type Birthday = {
  id: string;
  name: string;
  month: number;
  day: number;
  year: number | null;
  notes: string | null;
};

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Non-negative days from `todayISO` to the next occurrence of month/day.
 *  If it's today, returns 0. If the birthday has passed this year, returns
 *  the days until it comes round again next year. */
function daysUntilBirthday(month: number, day: number, todayISO: string): number {
  const [ty, tm, td] = todayISO.split("-").map(Number);
  const todayUTC = Date.UTC(ty, tm - 1, td);
  let nextYear = ty;
  const thisYearOccurrence = Date.UTC(ty, month - 1, day);
  if (thisYearOccurrence < todayUTC) nextYear = ty + 1;
  const next = Date.UTC(nextYear, month - 1, day);
  const diff = (next - todayUTC) / (24 * 60 * 60 * 1000);
  return Math.round(diff);
}

/** Age they'll turn on their NEXT birthday (or today's, if today). Null if
 *  the birth year isn't set. */
function ageNextBirthday(
  birthYear: number | null,
  month: number,
  day: number,
  todayISO: string,
): number | null {
  if (!birthYear) return null;
  const [ty, tm, td] = todayISO.split("-").map(Number);
  const todayUTC = Date.UTC(ty, tm - 1, td);
  const thisYearOccurrence = Date.UTC(ty, month - 1, day);
  const nextYear = thisYearOccurrence < todayUTC ? ty + 1 : ty;
  return nextYear - birthYear;
}

/** Current age today. Null if the birth year isn't set. If today is the
 *  birthday, this equals ageNextBirthday. */
function currentAge(
  birthYear: number | null,
  month: number,
  day: number,
  todayISO: string,
): number | null {
  if (!birthYear) return null;
  const [ty, tm, td] = todayISO.split("-").map(Number);
  // If this year's birthday has already happened (or is today), they've
  // reached ty - birthYear; otherwise they're still one below.
  const todayUTC = Date.UTC(ty, tm - 1, td);
  const thisYearOccurrence = Date.UTC(ty, month - 1, day);
  const hadBirthdayThisYear = thisYearOccurrence <= todayUTC;
  return ty - birthYear - (hadBirthdayThisYear ? 0 : 1);
}

function pluralDays(n: number): string {
  if (n === 0) return "today 🎉";
  if (n === 1) return "tomorrow";
  return `in ${n} days`;
}

function chipColour(days: number): string {
  if (days <= 7) return "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300";
  if (days <= 30)
    return "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300";
  return "bg-neutral-100 text-neutral-600 dark:bg-white/10 dark:text-neutral-300";
}

export default function BirthdaysList({
  initialBirthdays,
  today,
}: {
  initialBirthdays: Birthday[];
  today: string;
}) {
  const [birthdays, setBirthdays] = useState<Birthday[]>(initialBirthdays);
  const [editing, setEditing] = useState<Birthday | null>(null);
  const [adding, setAdding] = useState(false);

  const sorted = useMemo(() => {
    return [...birthdays].sort((a, b) => {
      const da = daysUntilBirthday(a.month, a.day, today);
      const db = daysUntilBirthday(b.month, b.day, today);
      return da - db;
    });
  }, [birthdays, today]);

  async function addBirthday(input: Omit<Birthday, "id">) {
    const res = await fetch("/api/birthdays", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const json = await res.json().catch(() => ({}));
    if (json?.ok && json.birthday) {
      setBirthdays((cur) => [...cur, json.birthday as Birthday]);
      setAdding(false);
    } else {
      alert(json?.error ?? "Couldn't add birthday");
    }
  }

  async function updateBirthday(id: string, patch: Omit<Birthday, "id">) {
    setBirthdays((cur) =>
      cur.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    );
    setEditing(null);
    await fetch(`/api/birthdays/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  async function deleteBirthday(id: string) {
    if (!confirm("Delete this birthday?")) return;
    setBirthdays((cur) => cur.filter((b) => b.id !== id));
    setEditing(null);
    await fetch(`/api/birthdays/${id}`, { method: "DELETE" });
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Birthdays</h1>
        <button
          onClick={() => setAdding(true)}
          className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700"
        >
          + Add birthday
        </button>
      </div>

      {sorted.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-black/10 p-6 text-center text-sm text-neutral-500 dark:border-white/10">
          No birthdays yet. Tap <span className="font-medium">Add birthday</span> to start.
        </p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((b) => {
            const days = daysUntilBirthday(b.month, b.day, today);
            const ageNow = currentAge(b.year, b.month, b.day, today);
            const ageNext = ageNextBirthday(b.year, b.month, b.day, today);
            return (
              <li
                key={b.id}
                className="rounded-2xl border border-black/10 p-3 dark:border-white/10"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-base font-semibold">{b.name}</span>
                      {ageNow !== null && (
                        <span className="rounded-full bg-teal-100 px-1.5 py-0.5 text-[10px] font-medium text-teal-800 dark:bg-teal-500/20 dark:text-teal-200">
                          {ageNow}
                        </span>
                      )}
                      <span className="text-sm text-neutral-500">
                        {b.day} {MONTH_SHORT[b.month - 1]}
                      </span>
                      {ageNext !== null && (
                        <span className="text-xs text-neutral-400">
                          {days === 0
                            ? `turns ${ageNext} 🎉`
                            : `turns ${ageNext} on next birthday`}
                        </span>
                      )}
                    </div>
                    {b.notes && (
                      <p className="mt-0.5 text-xs text-neutral-500">{b.notes}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={
                        "rounded-full px-2 py-0.5 text-xs font-medium " +
                        chipColour(days)
                      }
                    >
                      {pluralDays(days)}
                    </span>
                    <button
                      onClick={() => setEditing(b)}
                      className="text-xs text-neutral-400 hover:text-teal-600"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {(adding || editing) && (
        <BirthdayEditor
          initial={editing}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          onSave={(input) => {
            if (editing) return updateBirthday(editing.id, input);
            return addBirthday(input);
          }}
          onDelete={editing ? () => deleteBirthday(editing.id) : undefined}
        />
      )}
    </main>
  );
}

function BirthdayEditor({
  initial,
  onClose,
  onSave,
  onDelete,
}: {
  initial: Birthday | null;
  onClose: () => void;
  onSave: (input: Omit<Birthday, "id">) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [month, setMonth] = useState<number>(initial?.month ?? 1);
  const [day, setDay] = useState<number>(initial?.day ?? 1);
  const [yearStr, setYearStr] = useState<string>(
    initial?.year ? String(initial.year) : "",
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim()) {
      setError("Please enter a name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const yearNum = yearStr.trim() ? Number(yearStr) : null;
      await onSave({
        name: name.trim(),
        month,
        day,
        year: yearNum,
        notes: notes.trim() || null,
      });
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
          <h3 className="font-semibold">
            {initial ? "Edit birthday" : "New birthday"}
          </h3>
          <button onClick={onClose} className="text-sm text-neutral-400">
            Cancel
          </button>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase text-neutral-400">
              Name
            </span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Bernie, Grandma, Sam"
              className="w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase text-neutral-400">
                Month
              </span>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
              >
                {MONTH_LABELS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase text-neutral-400">
                Day
              </span>
              <select
                value={day}
                onChange={(e) => setDay(Number(e.target.value))}
                className="w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
              >
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase text-neutral-400">
              Year <span className="text-neutral-400">(optional — leave blank to skip age)</span>
            </span>
            <input
              type="number"
              inputMode="numeric"
              value={yearStr}
              onChange={(e) => setYearStr(e.target.value)}
              placeholder="e.g. 1985"
              min={1900}
              max={2100}
              className="w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase text-neutral-400">
              Notes (optional)
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. likes chocolate, allergic to nuts, gift ideas…"
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
          {onDelete && (
            <button
              onClick={onDelete}
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
            {saving ? "Saving…" : initial ? "Save changes" : "Add birthday"}
          </button>
        </div>
      </div>
    </div>
  );
}
