"use client";

import { useState } from "react";

type Cal = {
  id: string;
  summary: string | null;
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

export default function CalendarPicker({ accounts }: { accounts: Account[] }) {
  const [state, setState] = useState<Account[]>(accounts);

  async function toggle(accountId: string, cal: Cal) {
    const enabled = !cal.enabled;
    setState((s) =>
      s.map((a) =>
        a.id !== accountId
          ? a
          : {
              ...a,
              calendars: a.calendars.map((c) =>
                c.id === cal.id ? { ...c, enabled } : c,
              ),
            },
      ),
    );
    await fetch("/api/calendars", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ calendarId: cal.id, enabled }),
    }).catch(() => {});
  }

  if (state.length === 0) {
    return (
      <p className="text-sm text-neutral-400">
        No calendars yet — connect an account above, then reload this page.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {state.map((acc) => (
        <div key={acc.id}>
          <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-400">
            {acc.provider} · {acc.account_email}
          </div>
          <ul className="space-y-1">
            {[...acc.calendars]
              .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
              .map((cal) => (
                <li key={cal.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10">
                    <input
                      type="checkbox"
                      checked={cal.enabled}
                      onChange={() => toggle(acc.id, cal)}
                      className="h-4 w-4 accent-teal-600"
                    />
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: cal.color ?? "#9ca3af" }}
                    />
                    <span className="truncate">{cal.summary ?? cal.id}</span>
                    {cal.is_primary && (
                      <span className="text-[10px] text-neutral-400">primary</span>
                    )}
                  </label>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
