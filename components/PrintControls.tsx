"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Person = { id: string; name: string };

const INCLUDES: { key: string; label: string }[] = [
  { key: "school", label: "School runs" },
  { key: "events", label: "Plans" },
  { key: "where", label: "Where we are" },
  { key: "calendars", label: "Work / other calendars" },
];

/** Options for the printable week sheet — hidden when printing. */
export default function PrintControls({
  week,
  thisWeek,
  nextWeek,
  who,
  include,
  people,
  kids,
  shareText,
  view,
}: {
  week: string;
  thisWeek: string;
  nextWeek: string;
  who: string;
  include: string[];
  people: Person[];
  kids: Person[];
  shareText: string;
  view: "week" | "terms";
}) {
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);

  /** Phone share sheet (WhatsApp, Messages…); falls back to WhatsApp web. */
  async function share(data: { title: string; text: string; url?: string }) {
    if (navigator.share) {
      try {
        await navigator.share(data);
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return; // closed the sheet
      }
    }
    const msg = data.url ? `${data.text}\n${data.url}` : data.text;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  }

  async function shareLink() {
    setNote(null);
    const res = await fetch("/api/share-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ who, include }),
    });
    const j = await res.json().catch(() => ({}));
    if (!j.url) return setNote("Couldn't make a link — try again.");
    await share({
      title: "Week ahead",
      text: "Our week ahead (always up to date):",
      url: j.url,
    });
    setNote(
      "Link shared. It shows this week and next, always up to date, for 6 months — no login needed. Work calendars are never included.",
    );
  }

  function go(next: { week?: string; who?: string; include?: string[]; view?: string }) {
    const q = new URLSearchParams({
      view: next.view ?? view,
      week: next.week ?? week,
      who: next.who ?? who,
      include: (next.include ?? include).join(","),
    });
    router.replace(`/print?${q}`);
  }

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-sm transition ${
      active
        ? "border-teal-600 bg-teal-600 text-white"
        : "border-black/10 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
    }`;

  const whoOptions = [
    { key: "all", label: "Everyone" },
    ...people.map((p) => ({ key: `p:${p.id}`, label: p.name })),
    ...kids.map((k) => ({ key: `k:${k.id}`, label: k.name })),
  ];

  return (
    <div className="mb-4 space-y-3 print:hidden">
      <div className="flex items-center justify-between gap-2">
        <div className="flex rounded-xl bg-black/5 p-0.5 text-sm dark:bg-white/10">
          {(
            [
              ["week", "Week sheet"],
              ["terms", "School term dates"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              onClick={() => go({ view: v })}
              className={`rounded-lg px-3 py-1.5 ${
                view === v
                  ? "bg-white font-medium shadow-sm dark:bg-neutral-800"
                  : "text-neutral-500"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={() => window.print()}
          className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
        >
          🖨 Print / Save PDF
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() =>
            share({ title: view === "terms" ? "School days off" : "Week ahead", text: shareText })
          }
          className="rounded-xl border border-teal-600/40 px-3 py-2 text-sm font-medium text-teal-700 hover:bg-teal-600/10 dark:text-teal-300"
        >
          💬 Share as message
        </button>
        <button
          onClick={shareLink}
          className="rounded-xl border border-teal-600/40 px-3 py-2 text-sm font-medium text-teal-700 hover:bg-teal-600/10 dark:text-teal-300"
        >
          🔗 Share live link
        </button>
      </div>
      {note && <p className="text-xs text-neutral-500">{note}</p>}

      {view === "week" && (
        <div>
          <div className="mb-1 text-xs font-medium uppercase text-neutral-400">Week</div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button className={chip(week === thisWeek)} onClick={() => go({ week: thisWeek })}>
              This week
            </button>
            <button className={chip(week === nextWeek)} onClick={() => go({ week: nextWeek })}>
              Next week
            </button>
            <input
              type="date"
              value={week}
              onChange={(e) => e.target.value && go({ week: e.target.value })}
              className="rounded-full border border-black/10 bg-transparent px-3 py-1 text-sm dark:border-white/15"
              aria-label="Week starting"
            />
          </div>
        </div>
      )}

      <div>
        <div className="mb-1 text-xs font-medium uppercase text-neutral-400">Who</div>
        <div className="flex flex-wrap gap-1.5">
          {whoOptions.map((o) => (
            <button key={o.key} className={chip(who === o.key)} onClick={() => go({ who: o.key })}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {view === "week" && (
        <div>
          <div className="mb-1 text-xs font-medium uppercase text-neutral-400">Include</div>
          <div className="flex flex-wrap gap-1.5">
            {INCLUDES.map((o) => {
              const on = include.includes(o.key);
              return (
                <button
                  key={o.key}
                  className={chip(on)}
                  onClick={() =>
                    go({ include: on ? include.filter((k) => k !== o.key) : [...include, o.key] })
                  }
                >
                  {on ? "✓ " : ""}
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-xs text-neutral-500">
        <b>Message</b> sends this week as text (WhatsApp, Messages…). <b>Live link</b> gives Joy or
        grandparents a read-only page that stays up to date. Printing on iPhone: choose your printer
        (AirPrint); for a PDF, pinch outwards on the preview and Share.
      </p>
    </div>
  );
}
