"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { dayLabel } from "@/lib/time";

/**
 * Tap an in-app ("Added") event on the calendar: delete it (also removes it
 * from the Life calendar) or jump to the Plan page to edit it.
 */
export default function AddedEventSheet({
  eventId,
  title,
  time,
  day,
  onClose,
}: {
  eventId: string;
  title: string;
  time: string;
  day: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function removeOne() {
    if (!confirm(`Delete “${title}”? It will also be removed from the Life calendar.`)) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/week-events/${eventId}`, { method: "DELETE" });
    setBusy(false);
    if (res.status === 403) return setError("Only the person who added this can delete it.");
    if (!res.ok) return setError("Couldn't delete — try again.");
    onClose();
    router.refresh();
  }

  async function removeAllUpcoming() {
    if (!confirm(`Delete every upcoming “${title}”? They'll also be removed from the Life calendar.`))
      return;
    setBusy(true);
    setError(null);
    // Same rule as typing "cancel <title>" in Quick add.
    const res = await fetch("/api/quick-add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `cancel ${title}`, action: "save" }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!json.ok) return setError(json.message ?? "Couldn't delete — try again.");
    onClose();
    router.refresh();
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-t-2xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-xl dark:bg-neutral-900 sm:rounded-2xl sm:pb-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-semibold">{title}</h3>
            <p className="text-sm text-neutral-500">
              {dayLabel(day).weekday} {dayLabel(day).date} · {time}
            </p>
          </div>
          <button onClick={onClose} className="text-sm text-neutral-400">
            Close
          </button>
        </div>

        {error && (
          <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <Link
            href={`/plan?date=${day}`}
            className="rounded-xl border border-black/10 px-4 py-2.5 text-center text-sm font-medium hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
          >
            Edit in Plan
          </Link>
          <button
            onClick={removeOne}
            disabled={busy}
            className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? "Deleting…" : "Delete"}
          </button>
          <button
            onClick={removeAllUpcoming}
            disabled={busy}
            className="rounded-xl px-4 py-2 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950/40"
          >
            Delete every upcoming “{title}” (repeats)
          </button>
        </div>
        <p className="mt-3 text-center text-[11px] text-neutral-400">
          Removes it here and from the shared Life calendar.
        </p>
      </div>
    </div>
  );
}
