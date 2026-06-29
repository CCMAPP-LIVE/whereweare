"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function InviteForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setCopied(false);
    setError(null);
    setLink(null);
    const res = await fetch("/api/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, note: name }),
    });
    const body = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(body.error ?? "Could not create invite.");
      return;
    }
    // Append the email to the link so the join page pre-fills + locks it.
    const linkWithEmail = `${body.link}&email=${encodeURIComponent(email)}`;
    setLink(linkWithEmail);
    setEmail("");
    setName("");
    router.refresh(); // refresh the pending list
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
    <form onSubmit={create} className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Their email address"
          className="rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
        />
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Their name (optional)"
          className="rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
        />
      </div>
      <div className="flex justify-end">
        <button
          disabled={loading}
          className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60"
        >
          {loading ? "Creating…" : "Create invite link"}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {link && (
        <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm dark:border-teal-900/50 dark:bg-teal-950/30">
          <p className="mb-1 text-xs text-neutral-500">
            Send this single-use link — only the invited email can use it:
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-black/5 px-2 py-1 text-xs dark:bg-white/10">
              {link}
            </code>
            <button
              type="button"
              onClick={copy}
              className="shrink-0 rounded-lg border border-black/10 px-2.5 py-1 text-xs hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
