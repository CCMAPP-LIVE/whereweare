"use client";

import { useEffect, useRef, useState } from "react";

type Comment = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

const POLL_MS = 8000;

export default function DayComments({
  day,
  currentUserId,
  names,
  onRead,
}: {
  day: string;
  currentUserId: string;
  names: Record<string, string>;
  onRead?: (day: string) => void;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const res = await fetch(`/api/messages?day=${day}`);
      const json = await res.json();
      if (res.ok) setComments(json.messages as Comment[]);
    } catch {
      // ignore transient network errors — next poll retries
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    load();
    fetch("/api/messages/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ day }),
    }).catch(() => {});
    onRead?.(day);
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  useEffect(() => {
    listRef.current?.scrollIntoView({ block: "end" });
  }, [comments.length]);

  async function submit() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, day }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Could not post comment.");
        return;
      }
      setComments((prev) => [...prev, json.message as Comment]);
      setDraft("");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rounded-2xl border border-black/10 p-3 dark:border-white/10">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
        Comments
      </div>

      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Add a comment…"
        rows={2}
        className="w-full resize-none rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-teal-600 dark:border-white/10"
      />
      <div className="mt-1.5 flex items-center justify-between">
        <button
          type="button"
          onClick={submit}
          disabled={sending || !draft.trim()}
          className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-neutral-300 dark:disabled:bg-neutral-700"
        >
          Comment
        </button>
        <span className="text-[11px] text-neutral-400">⌘/Ctrl+Enter to submit</span>
      </div>
      {error && <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="mt-3 space-y-2.5">
        {loaded && comments.length === 0 && (
          <p className="text-sm text-neutral-400">No comments yet.</p>
        )}
        {comments.map((c) => (
          <div key={c.id} className="text-sm">
            <div className="flex items-baseline gap-2">
              <span className="font-medium">
                {c.sender_id === currentUserId ? "You" : names[c.sender_id] || "Someone"}
              </span>
              <span className="text-[11px] text-neutral-400">
                {new Date(c.created_at).toLocaleString([], {
                  weekday: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <p className="whitespace-pre-wrap break-words text-neutral-700 dark:text-neutral-300">
              {c.body}
            </p>
          </div>
        ))}
        <div ref={listRef} />
      </div>
    </div>
  );
}
