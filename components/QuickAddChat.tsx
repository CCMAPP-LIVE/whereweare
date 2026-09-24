"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

/**
 * Floating "add by message" assistant, on every signed-in page. Type or speak
 * "Percy swimming Thu 4-5"; a live preview shows what will be added, then Add.
 * Uses the same rules as the Slack bot (lib/quickAdd.ts via /api/quick-add).
 */

type Summary = {
  title: string;
  when: string;
  kids: string[];
  who: string;
  count: number;
  notes: string | null;
};

type Msg =
  | { role: "user"; text: string }
  | { role: "bot"; text: string }
  | { role: "added"; summary: Summary; ids: string[]; undone?: boolean; lifeSynced: boolean };

type Preview = { text: string; summary: Summary } | { text: string; message: string } | null;

const EXAMPLES = [
  "Percy swimming Thu 4-5",
  "Dentist Bernie Tue half 3",
  "Dinner tonight at 7 both of us",
  "Legoland all day Sat for the family",
  "Bernie football every Saturday 10am",
];

// Minimal typing for the browser speech API (webkit-prefixed on Safari/Chrome).
type SpeechRec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

function getSpeech(): (new () => SpeechRec) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export default function QuickAddChat() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [preview, setPreview] = useState<Preview>(null);
  const [saving, setSaving] = useState(false);
  const [listening, setListening] = useState(false);
  // Speech support is a browser capability: false on the server, real value on the client.
  const speechOk = useSyncExternalStore(
    () => () => {},
    () => !!getSpeech(),
    () => false,
  );
  const recRef = useRef<SpeechRec | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  // Live preview as you type or speak (debounced).
  useEffect(() => {
    const text = input.trim();
    if (!text) return; // the preview panel hides itself when the box is empty
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/quick-add", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, action: "preview" }),
          signal: ctrl.signal,
        });
        const json = await res.json();
        if (json.ok) setPreview({ text, summary: json.summary });
        else setPreview({ text, message: json.message ?? json.error ?? "Not sure about that one." });
      } catch {
        /* aborted or offline — keep the last preview */
      }
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [input]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, preview, open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else recRef.current?.stop();
  }, [open]);

  async function add() {
    const text = input.trim();
    if (!text || saving) return;
    setSaving(true);
    setMessages((m) => [...m, { role: "user", text }]);
    try {
      const res = await fetch("/api/quick-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, action: "save" }),
      });
      const json = await res.json();
      if (json.ok && json.ids) {
        setMessages((m) => [
          ...m,
          { role: "added", summary: json.summary, ids: json.ids, lifeSynced: json.lifeSynced },
        ]);
        setInput("");
        setPreview(null);
        router.refresh();
      } else {
        setMessages((m) => [...m, { role: "bot", text: json.message ?? json.error ?? "Something went wrong." }]);
      }
    } catch {
      setMessages((m) => [...m, { role: "bot", text: "Couldn't reach the server — try again." }]);
    } finally {
      setSaving(false);
    }
  }

  async function undo(index: number) {
    const msg = messages[index];
    if (msg.role !== "added" || msg.undone) return;
    const res = await fetch("/api/quick-add", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: msg.ids }),
    });
    if (res.ok) {
      setMessages((m) => m.map((x, i) => (i === index && x.role === "added" ? { ...x, undone: true } : x)));
      router.refresh();
    }
  }

  function toggleMic() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const SR = getSpeech();
    if (!SR) return;
    const rec = new SR();
    rec.lang = "en-GB";
    rec.interimResults = true;
    rec.continuous = false;
    const before = input.trim();
    rec.onresult = (e) => {
      const said = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join("");
      setInput(before ? `${before} ${said}` : said);
    };
    rec.onend = () => setListening(false);
    rec.onerror = (e) => {
      setListening(false);
      if (e.error === "not-allowed")
        setMessages((m) => [
          ...m,
          { role: "bot", text: "Microphone access is blocked — allow it in your browser settings, or use the mic on your keyboard." },
        ]);
    };
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  const canAdd = !!input.trim() && preview?.text === input.trim() && "summary" in preview && !saving;

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Quick add an event"
          className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-14 items-center gap-2 rounded-full bg-teal-600 pl-4 pr-5 font-medium text-white shadow-lg shadow-teal-900/20 transition hover:bg-teal-700 active:scale-95"
        >
          <span aria-hidden className="text-2xl leading-none">＋</span>
          <span className="text-sm">Add</span>
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-40 flex items-end justify-end sm:p-4" role="dialog" aria-label="Quick add">
          <div className="absolute inset-0 bg-black/30 sm:bg-transparent" onClick={() => setOpen(false)} />
          <div className="relative flex h-[min(85vh,640px)] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl ring-1 ring-black/5 dark:bg-neutral-900 dark:ring-white/10 sm:w-[400px] sm:rounded-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-black/5 px-4 py-3 dark:border-white/10">
              <div>
                <div className="font-semibold">Quick add</div>
                <div className="text-xs text-neutral-500">Type or say what&apos;s happening</div>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 hover:bg-black/5 dark:hover:bg-white/10"
              >
                ✕
              </button>
            </div>

            {/* Conversation */}
            <div ref={logRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              <BotBubble>
                Tell me what&apos;s on — e.g. <b>Percy swimming Thu 4-5</b>. Include a day; say
                &ldquo;7pm&rdquo; or &ldquo;tonight&rdquo; for evenings.
              </BotBubble>
              {messages.length === 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {EXAMPLES.map((ex) => (
                    <button
                      key={ex}
                      onClick={() => {
                        setInput(ex);
                        inputRef.current?.focus();
                      }}
                      className="rounded-full border border-teal-600/30 px-3 py-1 text-xs text-teal-700 hover:bg-teal-600/10 dark:text-teal-300"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              )}

              {messages.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-teal-600 px-3 py-2 text-sm text-white">
                      {m.text}
                    </div>
                  </div>
                ) : m.role === "bot" ? (
                  <BotBubble key={i}>{m.text}</BotBubble>
                ) : (
                  <BotBubble key={i}>
                    <div className={m.undone ? "opacity-50 line-through" : ""}>
                      <div className="mb-1 text-xs font-medium text-teal-700 dark:text-teal-300">
                        ✅ Added{m.summary.count > 1 ? ` (${m.summary.count} entries)` : ""}
                      </div>
                      <SummaryCard s={m.summary} />
                    </div>
                    {!m.lifeSynced && !m.undone && (
                      <p className="mt-1 text-[11px] text-amber-600">Saved, but the Life calendar sync failed.</p>
                    )}
                    <div className="mt-2">
                      {m.undone ? (
                        <span className="text-xs text-neutral-500">↩️ Undone</span>
                      ) : (
                        <button
                          onClick={() => undo(i)}
                          className="rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                        >
                          Undo
                        </button>
                      )}
                    </div>
                  </BotBubble>
                ),
              )}
            </div>

            {/* Live preview */}
            {preview && input.trim() && (
              <div className="border-t border-black/5 bg-neutral-50 px-4 py-2.5 dark:border-white/10 dark:bg-neutral-800/60">
                {"summary" in preview ? (
                  <>
                    <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-neutral-400">
                      Will add{preview.summary.count > 1 ? ` ${preview.summary.count} entries` : ""}
                    </div>
                    <SummaryCard s={preview.summary} />
                  </>
                ) : (
                  <p className="text-sm text-amber-700 dark:text-amber-400">{preview.message}</p>
                )}
              </div>
            )}

            {/* Composer */}
            <div className="flex items-end gap-2 border-t border-black/5 px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] dark:border-white/10 sm:pb-3">
              {speechOk && (
                <button
                  type="button"
                  onClick={toggleMic}
                  aria-label={listening ? "Stop listening" : "Speak"}
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg transition ${
                    listening
                      ? "animate-pulse bg-red-500 text-white"
                      : "bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20"
                  }`}
                >
                  🎤
                </button>
              )}
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (canAdd) add();
                  }
                }}
                placeholder={listening ? "Listening…" : "e.g. Dentist Bernie Tue 3pm"}
                className="max-h-28 min-h-11 flex-1 resize-none rounded-2xl border border-black/10 bg-transparent px-3 py-2.5 text-base leading-snug outline-none focus:border-teal-600 dark:border-white/15 sm:text-sm"
              />
              <button
                type="button"
                onClick={add}
                disabled={!canAdd}
                className="h-11 shrink-0 rounded-full bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-40"
              >
                {saving ? "Adding…" : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function BotBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex">
      <div className="max-w-[90%] rounded-2xl rounded-bl-md bg-black/5 px-3 py-2 text-sm dark:bg-white/10">
        {children}
      </div>
    </div>
  );
}

function SummaryCard({ s }: { s: Summary }) {
  return (
    <div className="text-sm">
      <div className="font-semibold">{s.title}</div>
      <div className="text-neutral-600 dark:text-neutral-300">{s.when}</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {s.kids.map((k) => (
          <span
            key={k}
            className="rounded-full bg-amber-200/70 px-1.5 py-0.5 text-[10px] text-amber-900 dark:bg-amber-500/20 dark:text-amber-200"
          >
            {k}
          </span>
        ))}
        <span className="rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] text-neutral-600 dark:bg-white/10 dark:text-neutral-300">
          {s.who}
        </span>
      </div>
      {s.notes && <div className="mt-1 text-xs text-neutral-500">{s.notes}</div>}
    </div>
  );
}
