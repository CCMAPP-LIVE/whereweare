"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type PendingInvite = {
  id: string;
  email: string | null;
  note: string | null;
  code: string;
  created_at: string;
};

export default function PendingInvites({
  invites,
  origin,
}: {
  invites: PendingInvite[];
  origin: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (invites.length === 0) {
    return (
      <p className="text-sm text-neutral-400">No outstanding invites.</p>
    );
  }

  async function copy(invite: PendingInvite) {
    const link =
      `${origin}/join?code=${invite.code}` +
      (invite.email ? `&email=${encodeURIComponent(invite.email)}` : "");
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(invite.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      /* ignore */
    }
  }

  async function revoke(invite: PendingInvite) {
    if (
      !confirm(`Revoke this invite${invite.email ? ` for ${invite.email}` : ""}?`)
    )
      return;
    setBusy(invite.id);
    const res = await fetch(`/api/invite/${invite.id}`, { method: "DELETE" });
    setBusy(null);
    if (res.ok) router.refresh();
    else alert("Could not revoke invite.");
  }

  return (
    <ul className="space-y-1.5">
      {invites.map((inv) => (
        <li
          key={inv.id}
          className="flex items-center gap-2 rounded-xl border border-black/10 px-3 py-2.5 text-sm dark:border-white/10"
        >
          <div className="min-w-0 flex-1">
            <div className="truncate">
              <span className="font-medium">{inv.email ?? "(no email)"}</span>
              {inv.note && (
                <span className="ml-2 text-neutral-500">· {inv.note}</span>
              )}
            </div>
            <div className="text-[11px] text-neutral-400">
              Created {new Date(inv.created_at).toLocaleDateString()}
            </div>
          </div>
          <button
            onClick={() => copy(inv)}
            className="shrink-0 rounded-lg border border-black/10 px-2.5 py-1 text-xs hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
          >
            {copiedId === inv.id ? "Copied ✓" : "Copy link"}
          </button>
          <button
            onClick={() => revoke(inv)}
            disabled={busy === inv.id}
            className="shrink-0 rounded-lg border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-60 dark:border-red-900/50 dark:hover:bg-red-950/30"
          >
            {busy === inv.id ? "…" : "Revoke"}
          </button>
        </li>
      ))}
    </ul>
  );
}
