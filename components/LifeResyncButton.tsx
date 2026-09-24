"use client";

import { useState } from "react";

type Counts = { ok: number; failed: number };

/** Settings: push everything in the app to the shared Life calendar again. */
export default function LifeResyncButton() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/life-resync", { method: "POST" });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error ?? "failed");
      const line = (label: string, c: Counts) =>
        `${c.ok} ${label}${c.failed ? ` (${c.failed} failed)` : ""}`;
      setResult(
        `Done: ${line("events", j.events)}, ${line("school runs", j.school)}, ${line("availability days", j.availability)}.` +
          (j.partial ? " Ran out of time — press again to finish." : ""),
      );
    } catch {
      setResult("Couldn't re-sync — try again in a minute.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        onClick={run}
        disabled={busy}
        className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
      >
        {busy ? "Re-syncing… (up to a minute)" : "Re-sync Life calendar"}
      </button>
      {result && <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">{result}</p>}
    </div>
  );
}
