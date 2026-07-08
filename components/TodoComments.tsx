"use client";

import { useEffect, useRef, useState } from "react";

type Comment = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export default function TodoComments({
  todoId,
  currentUserId,
  names,
  onCountChange,
}: {
  todoId: string;
  currentUserId: string;
  names: Record<string, string>;
  onCountChange?: (count: number) => void;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/todos/${todoId}/comments`);
        const json = await res.json();
        if (!cancelled && res.ok) {
          setComments(json.comments as Comment[]);
          onCountChange?.((json.comments as Comment[]).length);
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todoId]);

  useEffect(() => {
    listRef.current?.scrollIntoView({ block: "end" });
  }, [comments.length]);

  async function submit() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/todos/${todoId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Could not post comment.");
        return;
      }
      const next = [...comments, json.comment as Comment];
      setComments(next);
      onCountChange?.(next.length);
      setDraft("");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="mt-2 rounded-lg border border-black/10 bg-black/[0.02] p-2 dark:border-white/10 dark:bg-white/5"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="space-y-1.5">
        {loaded && comments.length === 0 && (
          <p className="text-xs text-neutral-400">No comments yet.</p>
        )}
        {comments.map((c) => (
          <div key={c.id} className="text-xs">
            <div className="flex items-baseline gap-1.5">
              <span className="font-medium">
                {c.sender_id === currentUserId ? "You" : names[c.sender_id] || "Someone"}
              </span>
              <span className="text-[10px] text-neutral-400">
                {new Date(c.created_at).toLocaleString([], {
                  weekday: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <p className="whitespace-pre-wrap break-words text-neutral-600 dark:text-neutral-300">
              {c.body}
            </p>
          </div>
        ))}
        <div ref={listRef} />
      </div>

      <div className="mt-1.5 flex items-start gap-1.5">
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
          rows={1}
          className="min-w-0 flex-1 resize-none rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs outline-none focus:border-teal-600 dark:border-white/10"
        />
        <button
          type="button"
          onClick={submit}
          disabled={sending || !draft.trim()}
          className="shrink-0 rounded-md bg-teal-600 px-2 py-1 text-xs font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-neutral-300 dark:disabled:bg-neutral-700"
        >
          Send
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
