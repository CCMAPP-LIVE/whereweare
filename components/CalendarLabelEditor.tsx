"use client";

import { useState } from "react";

type Cal = {
  id: string;
  summary: string | null;
  label: string | null;
  color: string | null;
  enabled: boolean;
  is_primary: boolean;
};
type Account = {
  id: string;
  provider: "google" | "microsoft";
  account_email: string | null;
  calendars: Cal[];
};

function CalendarRow({ cal }: { cal: Cal }) {
  const [value, setValue] = useState(cal.label ?? "");
  const [saved, setSaved] = useState(true);
  const [enabled, setEnabled] = useState(cal.enabled);

  async function saveLabel() {
    setSaved(true);
    await fetch("/api/calendars", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ calendarId: cal.id, label: value }),
    }).catch(() => {});
  }

  async function toggleEnabled() {
    const next = !enabled;
    setEnabled(next);
    await fetch("/api/calendars", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ calendarId: cal.id, enabled: next }),
    }).catch(() => {});
  }

  return (
    <li className="flex items-center gap-2 rounded-lg px-2 py-1.5">
      <input
        type="checkbox"
        checked={enabled}
        onChange={toggleEnabled}
        className="h-4 w-4 shrink-0 accent-teal-600"
      />
      <span
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: cal.color ?? "#9ca3af" }}
      />
      <span className="w-48 shrink-0 truncate text-sm text-neutral-500">
        {cal.summary ?? cal.id}
        {cal.is_primary && (
          <span className="ml-1 text-[10px] text-neutral-400">primary</span>
        )}
      </span>
      <input
        type="text"
        value={value}
        placeholder="Add a label…"
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        onBlur={saveLabel}
        className="min-w-0 flex-1 rounded-md border border-black/10 bg-transparent px-2 py-1 text-sm outline-none focus:border-teal-600 dark:border-white/10"
      />
      {!saved && <span className="shrink-0 text-[10px] text-neutral-400">Saving…</span>}
    </li>
  );
}

export default function CalendarLabelEditor({ accounts }: { accounts: Account[] }) {
  if (accounts.length === 0) {
    return (
      <p className="text-sm text-neutral-400">
        No calendars yet — connect an account above, then reload this page.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {accounts.map((acc) => (
        <div key={acc.id}>
          <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-400">
            {acc.provider} · {acc.account_email}
          </div>
          <ul className="space-y-1">
            {[...acc.calendars]
              .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
              .map((cal) => (
                <CalendarRow key={cal.id} cal={cal} />
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
