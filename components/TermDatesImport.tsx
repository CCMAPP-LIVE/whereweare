"use client";

import { useState } from "react";

/** Settings: import school holidays / INSET days from the school's calendar. */
export default function TermDatesImport() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run(body: { url?: string; ics?: string }) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/term-dates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="School calendar link (https:// or webcal://…)"
          className="min-w-0 flex-1 rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/15"
        />
        <button
          onClick={() => run({ url })}
          disabled={busy || !url.trim()}
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
          disabled={busy}
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
