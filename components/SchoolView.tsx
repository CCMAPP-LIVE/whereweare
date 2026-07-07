"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { shiftAnchor } from "@/lib/time";

export type SchoolEvent = {
  id: string;
  kidId: string;
  day: string;
  kind: "drop" | "pickup";
  time: string; // "HH:mm"
  assigneeUserId: string | null;
  notes: string | null;
};

export type SchoolDefault = {
  kidId: string;
  weekday: number; // 0=Mon..6=Sun
  kind: "drop" | "pickup";
  time: string; // "HH:mm"
  defaultAssigneeUserId: string | null;
  active: boolean;
};

type Person = { id: string; name: string };
type Kid = { id: string; name: string };

type DayLabel = { day: string; label: string; weekday: number };

const KIND_LABEL: Record<"drop" | "pickup", string> = {
  drop: "Drop-off",
  pickup: "Pickup",
};

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Props = {
  currentUserId: string;
  people: Person[];
  kids: Kid[];
  anchor: string;
  today: string;
  weekStart: string;
  dayLabels: DayLabel[];
  initialEvents: SchoolEvent[];
  initialDefaults: SchoolDefault[];
  initialIsSchoolWeek: boolean;
  initialNotes: string;
};

export default function SchoolView({
  people,
  kids,
  anchor,
  today,
  weekStart,
  dayLabels,
  initialEvents,
  initialDefaults,
  initialIsSchoolWeek,
  initialNotes,
}: Props) {
  const [events, setEvents] = useState<SchoolEvent[]>(initialEvents);
  const [defaults, setDefaults] = useState<SchoolDefault[]>(initialDefaults);
  const [notes, setNotes] = useState(initialNotes);
  const [isSchoolWeek, setIsSchoolWeek] = useState(initialIsSchoolWeek);
  const [generating, setGenerating] = useState(false);
  const [notesSaving, setNotesSaving] = useState(false);
  const [defaultsOpen, setDefaultsOpen] = useState(false);
  const router = useRouter();
  const [, startTransition] = useTransition();

  const nameOf = useMemo(() => {
    const map = new Map(people.map((p) => [p.id, p.name] as const));
    return (id: string | null) => (id ? map.get(id) ?? null : null);
  }, [people]);

  const kidNameOf = useMemo(() => {
    const map = new Map(kids.map((k) => [k.id, k.name] as const));
    return (id: string) => map.get(id) ?? "Kid";
  }, [kids]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, SchoolEvent[]>();
    for (const ev of events) {
      const list = map.get(ev.day) ?? [];
      list.push(ev);
      map.set(ev.day, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) =>
        a.time !== b.time ? a.time.localeCompare(b.time) : a.kind.localeCompare(b.kind),
      );
    }
    return map;
  }, [events]);

  function navigate(nextAnchor: string) {
    startTransition(() => router.push(`/school?date=${nextAnchor}`));
  }

  async function saveWeek(next: { isSchoolWeek: boolean; notes: string }) {
    setNotesSaving(true);
    try {
      await fetch(`/api/school-weeks/${weekStart}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isSchoolWeek: next.isSchoolWeek,
          notes: next.notes,
        }),
      });
    } finally {
      setNotesSaving(false);
    }
  }

  async function generate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/school-events/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart }),
      });
      const json = await res.json().catch(() => ({}));
      if (json?.ok) router.refresh();
    } finally {
      setGenerating(false);
    }
  }

  async function updateEvent(
    id: string,
    patch: Partial<Pick<SchoolEvent, "time" | "assigneeUserId" | "notes">>,
  ) {
    setEvents((cur) =>
      cur.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    );
    const existing = events.find((e) => e.id === id);
    if (!existing) return;
    await fetch(`/api/school-events/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        time: patch.time ?? existing.time,
        assigneeUserId:
          patch.assigneeUserId !== undefined
            ? patch.assigneeUserId
            : existing.assigneeUserId,
        notes: patch.notes !== undefined ? patch.notes : existing.notes,
      }),
    });
  }

  async function deleteEvent(id: string) {
    if (!confirm("Skip this drop-off/pickup? It will also be removed from the Life calendar."))
      return;
    setEvents((cur) => cur.filter((e) => e.id !== id));
    await fetch(`/api/school-events/${id}`, { method: "DELETE" });
  }

  async function skipWholeDay(day: string) {
    const list = eventsByDay.get(day) ?? [];
    if (list.length === 0) return;
    if (
      !confirm(
        `Skip all ${list.length} school event${list.length === 1 ? "" : "s"} on this day? They'll also be removed from the Life calendar.`,
      )
    )
      return;
    setEvents((cur) => cur.filter((e) => e.day !== day));
    await Promise.all(
      list.map((ev) => fetch(`/api/school-events/${ev.id}`, { method: "DELETE" })),
    );
  }

  async function upsertDefault(patch: SchoolDefault) {
    setDefaults((cur) => {
      const rest = cur.filter(
        (d) =>
          !(
            d.kidId === patch.kidId &&
            d.weekday === patch.weekday &&
            d.kind === patch.kind
          ),
      );
      return [...rest, patch];
    });
    await fetch("/api/school-defaults", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kidId: patch.kidId,
        weekday: patch.weekday,
        kind: patch.kind,
        time: patch.time,
        assigneeUserId: patch.defaultAssigneeUserId,
        active: patch.active,
      }),
    });
  }

  async function deleteDefault(kidId: string, weekday: number, kind: "drop" | "pickup") {
    setDefaults((cur) =>
      cur.filter(
        (d) => !(d.kidId === kidId && d.weekday === weekday && d.kind === kind),
      ),
    );
    await fetch(
      `/api/school-defaults?kidId=${kidId}&weekday=${weekday}&kind=${kind}`,
      { method: "DELETE" },
    );
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
        <h1 className="text-lg font-semibold sm:text-xl">School routine</h1>
      </div>

      <section className="mb-4 rounded-2xl border border-black/10 p-3 dark:border-white/10">
        <label className="mb-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isSchoolWeek}
            onChange={(e) => {
              setIsSchoolWeek(e.target.checked);
              saveWeek({ isSchoolWeek: e.target.checked, notes });
            }}
            className="accent-teal-600"
          />
          School week
        </label>
        <label className="block">
          <div className="mb-1 text-xs font-medium uppercase text-neutral-400">
            Notes for this week
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => saveWeek({ isSchoolWeek, notes })}
            rows={2}
            placeholder="e.g. No Forest School Tuesday, Ashley dentist Wed"
            className="w-full rounded-lg border border-black/10 bg-transparent px-2 py-1.5 text-sm dark:border-white/10"
          />
        </label>
        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={generate}
            disabled={generating || kids.length === 0}
            className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {generating ? "Generating…" : "Fill this week from Pickups"}
          </button>
          <p className="text-[11px] text-neutral-400">
            {notesSaving ? "Saving…" : "Only adds missing rows — your edits are safe."}
          </p>
        </div>
      </section>

      <div className="mb-4 grid gap-2">
        {dayLabels.map(({ day, label }) => {
          const list = eventsByDay.get(day) ?? [];
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
                  {label}
                  {isToday && (
                    <span className="ml-2 rounded-full bg-teal-600 px-2 py-0.5 text-[10px] font-medium uppercase text-white">
                      Today
                    </span>
                  )}
                </h2>
                {list.length > 0 && (
                  <button
                    onClick={() => skipWholeDay(day)}
                    className="text-xs text-neutral-400 hover:text-red-600"
                  >
                    Skip whole day
                  </button>
                )}
              </header>
              {list.length === 0 ? (
                <p className="text-xs text-neutral-400">Nothing yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {list.map((ev) => (
                    <SchoolRow
                      key={ev.id}
                      ev={ev}
                      kidName={kidNameOf(ev.kidId)}
                      people={people}
                      assigneeName={nameOf(ev.assigneeUserId)}
                      onUpdate={(patch) => updateEvent(ev.id, patch)}
                      onDelete={() => deleteEvent(ev.id)}
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <section className="rounded-2xl border border-black/10 dark:border-white/10">
        <button
          onClick={() => setDefaultsOpen((x) => !x)}
          className="flex w-full items-center justify-between px-3 py-2 text-sm font-semibold"
        >
          <span>Pickups ({defaults.length} rows)</span>
          <span className="text-neutral-400">{defaultsOpen ? "▲" : "▼"}</span>
        </button>
        {defaultsOpen && (
          <div className="border-t border-black/10 p-3 dark:border-white/10">
            {kids.length === 0 ? (
              <p className="text-xs text-neutral-400">
                Add kids on the People page first.
              </p>
            ) : (
              <DefaultsGrid
                kids={kids}
                people={people}
                defaults={defaults}
                onUpsert={upsertDefault}
                onDelete={deleteDefault}
              />
            )}
          </div>
        )}
      </section>
    </main>
  );
}

function SchoolRow({
  ev,
  kidName,
  people,
  assigneeName,
  onUpdate,
  onDelete,
}: {
  ev: SchoolEvent;
  kidName: string;
  people: Person[];
  assigneeName: string | null;
  onUpdate: (patch: Partial<Pick<SchoolEvent, "time" | "assigneeUserId" | "notes">>) => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg bg-black/5 px-2 py-1.5 text-sm dark:bg-white/5">
      <input
        type="time"
        value={ev.time}
        onChange={(e) => onUpdate({ time: e.target.value })}
        className="w-[5.5rem] shrink-0 rounded-md bg-transparent px-1 py-0.5 text-xs tabular-nums text-neutral-700 focus:bg-white dark:text-neutral-200 dark:focus:bg-neutral-800"
      />
      <span className="rounded-full bg-amber-200/70 px-1.5 py-0.5 text-[10px] text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">
        {kidName}
      </span>
      <span className="font-medium">{KIND_LABEL[ev.kind]}</span>
      <select
        value={ev.assigneeUserId ?? ""}
        onChange={(e) => onUpdate({ assigneeUserId: e.target.value || null })}
        className="rounded-md bg-transparent px-1 py-0.5 text-xs text-neutral-500 focus:bg-white dark:focus:bg-neutral-800"
      >
        <option value="">by …</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {assigneeName && (
        <span className="rounded-full bg-white/60 px-1.5 py-0.5 text-[10px] text-neutral-600 dark:bg-white/10 dark:text-neutral-300">
          by {assigneeName}
        </span>
      )}
      <button
        onClick={onDelete}
        className="ml-auto text-xs text-neutral-400 hover:text-red-600"
      >
        Skip
      </button>
    </li>
  );
}

function DefaultsGrid({
  kids,
  people,
  defaults,
  onUpsert,
  onDelete,
}: {
  kids: Kid[];
  people: Person[];
  defaults: SchoolDefault[];
  onUpsert: (d: SchoolDefault) => void;
  onDelete: (kidId: string, weekday: number, kind: "drop" | "pickup") => void;
}) {
  const map = new Map<string, SchoolDefault>(
    defaults.map((d) => [`${d.kidId}|${d.weekday}|${d.kind}`, d]),
  );

  // "Both" is a shortcut editor while all kids run on the same schedule. It
  // reads the shared value (blank when the kids differ) and dispatches writes
  // to every real kid in parallel. Only meaningful with 2+ kids.
  const showBoth = kids.length >= 2;

  function bothTime(weekday: number, kind: "drop" | "pickup"): string {
    const times = kids.map((k) => map.get(`${k.id}|${weekday}|${kind}`)?.time ?? "");
    return times.every((t) => t === times[0]) ? times[0] : "";
  }
  function bothAssignee(weekday: number, kind: "drop" | "pickup"): string {
    const assigns = kids.map(
      (k) => map.get(`${k.id}|${weekday}|${kind}`)?.defaultAssigneeUserId ?? "",
    );
    return assigns.every((a) => a === assigns[0]) ? assigns[0] : "";
  }
  function bothPresent(weekday: number, kind: "drop" | "pickup"): boolean {
    return kids.every((k) => map.has(`${k.id}|${weekday}|${kind}`));
  }

  function setBothTime(weekday: number, kind: "drop" | "pickup", time: string) {
    for (const kid of kids) {
      const d = map.get(`${kid.id}|${weekday}|${kind}`);
      onUpsert({
        kidId: kid.id,
        weekday,
        kind,
        time,
        defaultAssigneeUserId: d?.defaultAssigneeUserId ?? null,
        active: true,
      });
    }
  }
  function setBothAssignee(
    weekday: number,
    kind: "drop" | "pickup",
    assignee: string | null,
  ) {
    for (const kid of kids) {
      const d = map.get(`${kid.id}|${weekday}|${kind}`);
      onUpsert({
        kidId: kid.id,
        weekday,
        kind,
        time: d?.time ?? "08:00",
        defaultAssigneeUserId: assignee,
        active: true,
      });
    }
  }
  function clearBoth(weekday: number, kind: "drop" | "pickup") {
    for (const kid of kids) {
      if (map.has(`${kid.id}|${weekday}|${kind}`)) {
        onDelete(kid.id, weekday, kind);
      }
    }
  }

  return (
    <div className="space-y-4">
      {showBoth && (
        <div className="rounded-lg bg-amber-50/60 p-2 dark:bg-amber-950/20">
          <h3 className="mb-1 text-sm font-semibold">
            Both{" "}
            <span className="text-[11px] font-normal text-neutral-500">
              — fills every kid; blank if they differ
            </span>
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-left text-neutral-500">
                  <th className="pr-3 font-medium">Day</th>
                  <th className="pr-3 font-medium">Drop-off</th>
                  <th className="font-medium">Pickup</th>
                </tr>
              </thead>
              <tbody>
                {WEEKDAY_SHORT.slice(0, 5).map((label, weekday) => (
                  <tr key={weekday} className="border-t border-amber-500/10">
                    <td className="py-1 pr-3 font-medium">{label}</td>
                    {(["drop", "pickup"] as const).map((kind) => (
                      <td key={kind} className="py-1 pr-3">
                        <div className="flex items-center gap-1">
                          <input
                            type="time"
                            value={bothTime(weekday, kind)}
                            placeholder="--:--"
                            onChange={(e) => setBothTime(weekday, kind, e.target.value)}
                            className="w-[5.5rem] rounded-md bg-transparent px-1 py-0.5 text-neutral-700 focus:bg-white dark:text-neutral-200 dark:focus:bg-neutral-800"
                          />
                          <select
                            value={bothAssignee(weekday, kind)}
                            onChange={(e) =>
                              setBothAssignee(weekday, kind, e.target.value || null)
                            }
                            className="rounded-md bg-transparent px-1 py-0.5 text-neutral-500 focus:bg-white dark:focus:bg-neutral-800"
                          >
                            <option value="">by …</option>
                            {people.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                          {bothPresent(weekday, kind) && (
                            <button
                              onClick={() => clearBoth(weekday, kind)}
                              className="text-neutral-400 hover:text-red-600"
                              title="Remove for all kids"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {kids.map((kid) => (
        <div key={kid.id}>
          <h3 className="mb-1 text-sm font-semibold">{kid.name}</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-left text-neutral-500">
                  <th className="pr-3 font-medium">Day</th>
                  <th className="pr-3 font-medium">Drop-off</th>
                  <th className="font-medium">Pickup</th>
                </tr>
              </thead>
              <tbody>
                {WEEKDAY_SHORT.slice(0, 5).map((label, weekday) => (
                  <tr key={weekday} className="border-t border-black/5 dark:border-white/5">
                    <td className="py-1 pr-3 font-medium">{label}</td>
                    {(["drop", "pickup"] as const).map((kind) => {
                      const key = `${kid.id}|${weekday}|${kind}`;
                      const d = map.get(key);
                      return (
                        <td key={kind} className="py-1 pr-3">
                          <div className="flex items-center gap-1">
                            <input
                              type="time"
                              value={d?.time ?? ""}
                              placeholder="--:--"
                              onChange={(e) =>
                                onUpsert({
                                  kidId: kid.id,
                                  weekday,
                                  kind,
                                  time: e.target.value,
                                  defaultAssigneeUserId:
                                    d?.defaultAssigneeUserId ?? null,
                                  active: true,
                                })
                              }
                              className="w-[5.5rem] rounded-md bg-transparent px-1 py-0.5 text-neutral-700 focus:bg-white dark:text-neutral-200 dark:focus:bg-neutral-800"
                            />
                            <select
                              value={d?.defaultAssigneeUserId ?? ""}
                              onChange={(e) =>
                                onUpsert({
                                  kidId: kid.id,
                                  weekday,
                                  kind,
                                  time: d?.time ?? "08:00",
                                  defaultAssigneeUserId: e.target.value || null,
                                  active: true,
                                })
                              }
                              className="rounded-md bg-transparent px-1 py-0.5 text-neutral-500 focus:bg-white dark:focus:bg-neutral-800"
                            >
                              <option value="">by …</option>
                              {people.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                            {d && (
                              <button
                                onClick={() => onDelete(kid.id, weekday, kind)}
                                className="text-neutral-400 hover:text-red-600"
                                title="Remove"
                              >
                                ×
                              </button>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
