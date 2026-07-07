"use client";

import { useEffect, useRef, useState } from "react";
import { dayLabel } from "@/lib/time";

type Message = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  day: string | null;
  created_at: string;
  read_at: string | null;
};

type Person = { id: string; name: string };

const POLL_MS = 8000;

export default function MessagesView({
  currentUserId,
  names,
  people,
  initialMessages,
  today,
  initialDay,
}: {
  currentUserId: string;
  names: Record<string, string>;
  people: Person[];
  initialMessages: Message[];
  today: string;
  initialDay: string;
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [day, setDay] = useState(initialDay); // "" = no day tag
  const [recipientId, setRecipientId] = useState(people[0]?.id ?? "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  useEffect(() => {
    fetch("/api/messages/read", { method: "POST" }).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/messages");
        const json = await res.json();
        if (!cancelled && res.ok) {
          setMessages(json.messages as Message[]);
          fetch("/api/messages/read", { method: "POST" }).catch(() => {});
        }
      } catch {
        // ignore transient network errors — next poll retries
      }
    };
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  async function send() {
    const body = draft.trim();
    if (!body || sending || !recipientId) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, day: day || undefined, recipientId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Could not send message.");
        return;
      }
      setMessages((prev) => [...prev, json.message as Message]);
      setDraft("");
      setDay("");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem)] max-w-2xl flex-col px-3 sm:px-4">
      <div className="flex-1 space-y-2 overflow-y-auto py-4">
        {messages.length === 0 && (
          <p className="pt-8 text-center text-sm text-neutral-400">
            No messages yet — say hello.
          </p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === currentUserId;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] ${mine ? "items-end" : "items-start"} flex flex-col`}>
                {m.day && (
                  <a
                    href={`/plan?date=${m.day}`}
                    className={`mb-1 inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      mine
                        ? "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300"
                        : "bg-black/10 text-neutral-700 dark:bg-white/10 dark:text-neutral-300"
                    }`}
                  >
                    📅 {dayLabel(m.day).weekday} {dayLabel(m.day).date}
                  </a>
                )}
                <div
                  className={`rounded-2xl px-3 py-2 text-sm ${
                    mine
                      ? "bg-teal-600 text-white"
                      : "bg-black/5 text-neutral-900 dark:bg-white/10 dark:text-neutral-100"
                  }`}
                >
                  {!mine && (
                    <div className="mb-0.5 text-xs font-medium opacity-70">
                      {names[m.sender_id] || "Someone"}
                      {people.length > 1 && ` → ${names[m.recipient_id] || "Someone"}`}
                    </div>
                  )}
                  <div className="whitespace-pre-wrap break-words">{m.body}</div>
                  <div className={`mt-1 text-[10px] ${mine ? "text-white/70" : "opacity-50"}`}>
                    {new Date(m.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {error && <p className="pb-1 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="space-y-2 border-t border-black/10 py-3 dark:border-white/10"
      >
        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
          <span>To:</span>
          <select
            value={recipientId}
            onChange={(e) => setRecipientId(e.target.value)}
            className="rounded-full border border-black/10 bg-transparent px-2 py-0.5 text-xs dark:border-white/10"
          >
            {people.length === 0 && <option value="">No one else yet</option>}
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <span className="ml-2">About:</span>
          <button
            type="button"
            onClick={() => setDay(day === today ? "" : today)}
            className={`rounded-full px-2 py-0.5 ${
              day === today
                ? "bg-teal-600 text-white"
                : "bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20"
            }`}
          >
            Today
          </button>
          <input
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className="rounded-full border border-black/10 bg-transparent px-2 py-0.5 text-xs dark:border-white/10"
          />
          {day && (
            <button
              type="button"
              onClick={() => setDay("")}
              className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
            >
              clear
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Message…"
            rows={1}
            className="flex-1 resize-none rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-teal-600 dark:border-white/10"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim() || !recipientId}
            className="shrink-0 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
