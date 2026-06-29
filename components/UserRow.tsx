"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type ManagedUser = {
  id: string;
  email: string | null;
  name: string;
  providers: string[];
  push: boolean;
};

export default function UserRow({
  user,
  isSelf,
}: {
  user: ManagedUser;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [removing, setRemoving] = useState(false);

  async function remove() {
    if (!confirm(`Remove ${user.name || user.email}? This deletes their data.`))
      return;
    setRemoving(true);
    const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
    if (res.ok) {
      router.refresh();
    } else {
      setRemoving(false);
      const body = await res.json().catch(() => ({}));
      alert(body.error ?? "Could not remove user.");
    }
  }

  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-black/10 px-3 py-2.5 dark:border-white/10">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium">{user.name || "(no name yet)"}</span>
          {isSelf && <span className="text-xs text-neutral-400">you</span>}
        </div>
        <div className="truncate text-sm text-neutral-500">{user.email}</div>
        <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-neutral-500">
          {user.providers.length === 0 && (
            <span className="text-neutral-400">no calendars connected</span>
          )}
          {user.providers.map((p) => (
            <span
              key={p}
              className="rounded-full bg-black/5 px-2 py-0.5 capitalize dark:bg-white/10"
            >
              {p}
            </span>
          ))}
          {user.push && (
            <span className="rounded-full bg-teal-600/10 px-2 py-0.5 text-teal-700 dark:text-teal-300">
              reminders on
            </span>
          )}
        </div>
      </div>
      {!isSelf && (
        <button
          onClick={remove}
          disabled={removing}
          className="shrink-0 rounded-lg border border-red-200 px-2.5 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-60 dark:border-red-900/50 dark:hover:bg-red-950/30"
        >
          {removing ? "Removing…" : "Remove"}
        </button>
      )}
    </li>
  );
}
