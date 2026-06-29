"use client";

import { useState } from "react";

export default function InviteForm() {
  const [note, setNote] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function create() {
    setLoading(true);
    setCopied(false);
    setLink(null);
    const res = await fetch("/api/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
    const body = await res.json().catch(() => ({}));
    setLoading(false);
    if (res.ok) setLink(body.link);
    else alert(body.error ?? "Could not create invite.");
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      /* clipboard may be blocked; the link is still selectable */
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Who's it for? (optional, e.g. Sarah)"
          className="flex-1 rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
        />
        <button
          onClick={create}
          disabled={loading}
          className="shrink-0 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60"
        >
          {loading ? "Creating…" : "Create invite link"}
        </button>
      </div>

      {link && (
        <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm dark:border-teal-900/50 dark:bg-teal-950/30">
          <p className="mb-1 text-xs text-neutral-500">
            Send this single-use link to the person you’re inviting:
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-black/5 px-2 py-1 text-xs dark:bg-white/10">
              {link}
            </code>
            <button
              onClick={copy}
              className="shrink-0 rounded-lg border border-black/10 px-2.5 py-1 text-xs hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
