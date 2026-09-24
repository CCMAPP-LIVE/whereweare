"use client";

import { useState } from "react";

/** Settings: import school holidays / INSET days from the school's calendar. */
export default function TermDatesImport({
  kids,
  schools,
}: {
  kids: { id: string; name: string }[];
  schools: { name: string; kids: string[] }[];
}) {
  const [url, setUrl] = useState("");
  const [kidIds, setKidIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function refresh() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/term-dates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh: true }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Refresh failed");
      setMsg(
        (j.results as { name: string; added: number; removed: number; error?: string }[])
          .map((r) =>
            r.error ? `${r.name}: ${r.error}` : `${r.name}: ${r.added} added, ${r.removed} removed`,
          )
          .join(" · ") || "No schools set up yet.",
      );
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function run(body: { url?: string; ics?: string }) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/term-dates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, kidIds }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Import failed");
      setMsg(
        j.added
          ? `Added ${j.added} day${j.added > 1 ? "s" : ""} from the school calendar.${j.remaining ? " Press again to add the rest." : ""}`
          : "Nothing new to add — you're up to date.",
      );
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {schools.length > 0 && (
        <div className="rounded-xl bg-sky-50 px-3 py-2 text-sm dark:bg-sky-950/30">
          <div className="font-medium">Kept up to date automatically (every Sunday)</div>
          <ul className="mt-0.5 text-neutral-600 dark:text-neutral-300">
            {schools.map((s) => (
              <li key={s.name}>
                🏫 {s.name} — {s.kids.join(" & ")}
              </li>
            ))}
          </ul>
          <button
            onClick={refresh}
            disabled={busy}
            className="mt-2 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {busy ? "Refreshing…" : "Refresh now"}
          </button>
        </div>
      )}
      <div className="text-xs text-neutral-500">Add another school:</div>
      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        <span className="text-xs text-neutral-500">Which school is it for?</span>
        {kids.map((k) => {
          const on = kidIds.includes(k.id);
          return (
            <button
              key={k.id}
              type="button"
              onClick={() =>
                setKidIds((cur) => (on ? cur.filter((x) => x !== k.id) : [...cur, k.id]))
              }
              className={`rounded-full border px-3 py-1 text-xs ${
                on
                  ? "border-amber-400 bg-amber-200/70 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200"
                  : "border-black/10 dark:border-white/15"
              }`}
            >
              {on ? "✓ " : ""}
              {k.name}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="School calendar link (https:// or webcal://…)"
          className="min-w-0 flex-1 rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/15"
        />
        <button
          onClick={() => run({ url })}
          disabled={busy || !url.trim() || !kidIds.length}
          className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {busy ? "Importing…" : "Import"}
        </button>
      </div>
      <label className="block text-xs text-neutral-500">
        Or choose a downloaded .ics file:{" "}
        <input
          type="file"
          accept=".ics,text/calendar"
          disabled={busy || !kidIds.length}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) run({ ics: await f.text() });
          }}
          className="text-xs"
        />
      </label>
      {msg && <p className="text-sm text-neutral-600 dark:text-neutral-300">{msg}</p>}
    </div>
  );
}
