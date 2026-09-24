"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import QuickAddHelp from "@/components/QuickAddHelp";

/**
 * Floating assistant on every signed-in page. Type, speak, paste or share:
 *  - "Percy swimming Thu 4-5"        → add (live preview, fix-up chips)
 *  - "move swimming to Friday"        → change an upcoming event (confirm)
 *  - "what's on tomorrow?"            → answer
 * Same rules as the Slack bot (lib/quickAdd.ts + lib/quickAssistant.ts).
 */

type Summary = {
  title: string;
  when: string;
  kids: string[];
  who: string;
  count: number;
  notes: string | null;
};

type Preview =
  | { ok: false; message: string }
  | {
      ok: true;
      kind: "add";
      summary: Summary;
      who: string;
      kids: string[];
      meridiem: "am" | "pm" | null;
      flipped: boolean;
    }
  | {
      ok: true;
      kind: "change";
      action: "move" | "cancel" | "update";
      title: string;
      before: string;
      after: string;
      count: number;
      note: string | null;
    }
  | { ok: true; kind: "answer"; heading: string; lines: string[] };

type UndoPayload = { created: string[]; restore: unknown[]; removed: unknown[] };

type Msg =
  | { role: "user"; text: string }
  | { role: "bot"; text: string }
  | { role: "answer"; heading: string; lines: string[] }
  | { role: "done"; text: string; undo: UndoPayload; undone?: boolean; lifeSynced: boolean };

export type Person = { id: string; name: string };
type Overrides = { who?: string; kids?: string[]; flip?: boolean };

const EXAMPLES = [
  "Percy swimming Thu 4-5",
  "Dentist Bernie Tue half 3",
  "Legoland all day Sat for the family",
  "What's on tomorrow?",
  "Move swimming to Friday",
];

const RECENT_KEY = "wwa-quickadd-recent";
const SHARE_KEY = "wwa-quickadd-share";

function loadRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 6) : [];
  } catch {
    return [];
  }
}
function saveRecent(text: string) {
  try {
    const next = [
      text,
      ...loadRecent().filter((t) => t.toLowerCase() !== text.toLowerCase()),
    ].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* private mode — recents are a nicety */
  }
}

/** From a pasted/shared email or message, keep the sentence that has a date in it. */
const DATEISH =
  /\b(today|tonight|tomorrow|mon|tues?|wed|thu|thur|thurs|fri|sat|sun)(day)?\b|\b\d{1,2}(st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}\b|\b\d{1,2}\/\d{1,2}\b/i;
export function eventSentence(text: string): string {
  const t = text.replace(/\s+\n/g, "\n").trim();
  if (t.length <= 140) return t.replace(/\s+/g, " ");
  const parts = t
    .split(/\n+|(?<=[.!?])\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const hit = parts.find((p) => DATEISH.test(p));
  return (hit ?? parts[0] ?? t).replace(/\s+/g, " ").slice(0, 300);
}

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

type Household = { currentUserId: string; people: Person[]; helpers: Person[]; kids: Person[] };

export default function QuickAddChat() {
  const router = useRouter();
  const [household, setHousehold] = useState<Household | null>(null);
  const { currentUserId = "", people = [], helpers = [], kids = [] } = household ?? {};
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [overrides, setOverrides] = useState<Overrides>({});
  const [messages, setMessages] = useState<Msg[]>([]);
  const [preview, setPreview] = useState<{ key: string; data: Preview } | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const speechOk = useSyncExternalStore(
    () => () => {},
    () => !!getSpeech(),
    () => false,
  );
  const recRef = useRef<SpeechRec | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const text = input.trim();
  const key = JSON.stringify([text, overrides]);

  function openPanel(prefill?: string) {
    setRecent(loadRecent());
    if (!household)
      fetch("/api/quick-add")
        .then((r) => (r.ok ? r.json() : null))
        .then((h) => h && setHousehold(h))
        .catch(() => {});
    if (prefill !== undefined) setInput(prefill);
    setOpen(true);
  }

  // Something shared into the app (Android share sheet → /share) opens the panel pre-filled.
  useEffect(() => {
    let shared: string | null = null;
    try {
      shared = sessionStorage.getItem(SHARE_KEY);
      if (shared) sessionStorage.removeItem(SHARE_KEY);
    } catch {
      /* storage blocked */
    }
    if (shared) {
      const t = setTimeout(() => openPanel(eventSentence(shared!)), 0);
      return () => clearTimeout(t);
    }
    // Runs once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live preview as you type / speak / tap chips (debounced).
  useEffect(() => {
    if (!text) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/quick-add", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, action: "preview", overrides }),
          signal: ctrl.signal,
        });
        setPreview({ key, data: await res.json() });
      } catch {
        /* aborted or offline — keep the last preview */
      }
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // `key` captures text + overrides.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, preview, open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else recRef.current?.stop();
  }, [open]);

  const current = text && preview?.key === key ? preview.data : null;
  const shown = text ? (current ?? preview?.data ?? null) : null; // keep last while typing
  const ready = !!current && current.ok && !busy;
  const actionLabel =
    current && current.ok
      ? current.kind === "answer"
        ? "Ask"
        : current.kind === "change"
          ? current.action === "cancel"
            ? "Remove"
            : "Change"
          : "Add"
      : "Add";

  function reset() {
    setInput("");
    setOverrides({});
    setPreview(null);
  }

  async function submit() {
    if (!ready || !current || !current.ok) return;
    // Always double-check before anything is deleted.
    if (
      current.kind === "change" &&
      current.action === "cancel" &&
      !confirm(
        `Delete “${current.title}”${current.count > 1 ? ` (${current.count} entries)` : ""}? ` +
          "It will also be removed from the Life calendar.",
      )
    )
      return;
    setMessages((m) => [...m, { role: "user", text }]);
    if (current.kind === "answer") {
      setMessages((m) => [
        ...m,
        { role: "answer", heading: current.heading, lines: current.lines },
      ]);
      reset();
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/quick-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, action: "save", overrides }),
      });
      const json = await res.json();
      if (json.ok) {
        if (current.kind === "add") saveRecent(text);
        setMessages((m) => [
          ...m,
          {
            role: "done",
            text: json.message,
            undo: { created: json.created, restore: json.restore, removed: json.removed },
            lifeSynced: json.lifeSynced,
          },
        ]);
        reset();
        router.refresh();
      } else {
        setMessages((m) => [...m, { role: "bot", text: json.message ?? "Something went wrong." }]);
      }
    } catch {
      setMessages((m) => [...m, { role: "bot", text: "Couldn't reach the server — try again." }]);
    } finally {
      setBusy(false);
    }
  }

  async function undo(index: number) {
    const msg = messages[index];
    if (msg.role !== "done" || msg.undone) return;
    const res = await fetch("/api/quick-add", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(msg.undo),
    });
    if (res.ok) {
      setMessages((m) =>
        m.map((x, i) => (i === index && x.role === "done" ? { ...x, undone: true } : x)),
      );
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
    const before = text;
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
          {
            role: "bot",
            text: "Microphone access is blocked — allow it in settings, or use the mic on your keyboard.",
          },
        ]);
    };
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  async function paste() {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip.trim()) {
        setInput(eventSentence(clip));
        inputRef.current?.focus();
      }
    } catch {
      setMessages((m) => [
        ...m,
        { role: "bot", text: "Couldn't read the clipboard — long-press the box and choose Paste." },
      ]);
    }
  }

  // Fix-up chips for an add preview.
  const whoChips = [
    { key: "me", label: "Me" },
    ...people
      .filter((p) => p.id !== currentUserId)
      .map((p) => ({ key: `p:${p.id}`, label: p.name })),
    ...helpers.map((h) => ({ key: `h:${h.id}`, label: h.name })),
    { key: "shared", label: "Both" },
  ];

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => openPanel()}
          aria-label="Quick add or ask"
          className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-14 items-center gap-2 rounded-full bg-teal-600 pl-4 pr-5 font-medium text-white shadow-lg shadow-teal-900/20 transition hover:bg-teal-700 active:scale-95"
        >
          <span aria-hidden className="text-2xl leading-none">
            ＋
          </span>
          <span className="text-sm">Add</span>
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-end sm:p-4"
          role="dialog"
          aria-label="Quick add"
        >
          <div
            className="absolute inset-0 bg-black/30 sm:bg-transparent"
            onClick={() => setOpen(false)}
          />
          <div className="relative flex h-[min(88vh,680px)] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl ring-1 ring-black/5 dark:bg-neutral-900 dark:ring-white/10 sm:w-[420px] sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-black/5 px-4 py-3 dark:border-white/10">
              <div>
                <div className="font-semibold">Quick add</div>
                <div className="text-xs text-neutral-500">
                  Add, change or ask — type, speak or paste
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowHelp((v) => !v)}
                  aria-label="How to use Quick add"
                  title="How to use Quick add"
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${
                    showHelp
                      ? "bg-teal-600 text-white"
                      : "text-teal-700 ring-1 ring-teal-600/30 hover:bg-teal-600/10 dark:text-teal-300"
                  }`}
                >
                  ?
                </button>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 hover:bg-black/5 dark:hover:bg-white/10"
                >
                  ✕
                </button>
              </div>
            </div>

            {showHelp ? (
              <QuickAddHelp
                onBack={() => setShowHelp(false)}
                onTry={(t) => {
                  setInput(t);
                  setShowHelp(false);
                }}
              />
            ) : (
              <>
                <div ref={logRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                  <BotBubble>
                    Tell me what&apos;s on — <b>Percy swimming Thu 4-5</b>. You can also change
                    things (<b>move swimming to Friday</b>, <b>cancel Legoland</b>) or ask (
                    <b>what&apos;s on tomorrow?</b>). Tap <b>?</b> for all the rules.
                  </BotBubble>

                  {messages.length === 0 && !text && (
                    <div className="space-y-2">
                      {recent.length > 0 && (
                        <ChipRow label="Recent" items={recent} onPick={(t) => setInput(t)} />
                      )}
                      <ChipRow label="Try" items={EXAMPLES} onPick={(t) => setInput(t)} />
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
                    ) : m.role === "answer" ? (
                      <BotBubble key={i}>
                        <Answer heading={m.heading} lines={m.lines} />
                      </BotBubble>
                    ) : (
                      <BotBubble key={i}>
                        <div className={m.undone ? "line-through opacity-50" : ""}>✅ {m.text}</div>
                        {!m.lifeSynced && !m.undone && (
                          <p className="mt-1 text-[11px] text-amber-600">
                            Saved, but the Life calendar sync failed.
                          </p>
                        )}
                        <div className="mt-1.5">
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

                {shown && (
                  <div className="max-h-[45%] overflow-y-auto border-t border-black/5 bg-neutral-50 px-4 py-2.5 dark:border-white/10 dark:bg-neutral-800/60">
                    {!shown.ok ? (
                      <p className="text-sm text-amber-700 dark:text-amber-400">{shown.message}</p>
                    ) : shown.kind === "add" ? (
                      <>
                        <Label>
                          Will add{shown.summary.count > 1 ? ` ${shown.summary.count} entries` : ""}
                        </Label>
                        <SummaryCard s={shown.summary} />
                        <div className="mt-2 flex flex-wrap items-center gap-1">
                          <span className="mr-0.5 text-[10px] uppercase text-neutral-400">Who</span>
                          {whoChips.map((c) => (
                            <Chip
                              key={c.key}
                              active={shown.who === c.key}
                              onClick={() => setOverrides((o) => ({ ...o, who: c.key }))}
                            >
                              {c.label}
                            </Chip>
                          ))}
                        </div>
                        {kids.length > 0 && (
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            <span className="mr-0.5 text-[10px] uppercase text-neutral-400">
                              Kids
                            </span>
                            {kids.map((k) => {
                              const on = shown.kids.includes(k.id);
                              return (
                                <Chip
                                  key={k.id}
                                  active={on}
                                  tone="amber"
                                  onClick={() =>
                                    setOverrides((o) => ({
                                      ...o,
                                      kids: on
                                        ? shown.kids.filter((x) => x !== k.id)
                                        : [...shown.kids, k.id],
                                    }))
                                  }
                                >
                                  {k.name}
                                </Chip>
                              );
                            })}
                          </div>
                        )}
                        {shown.meridiem && (
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            <span className="mr-0.5 text-[10px] uppercase text-neutral-400">
                              Time
                            </span>
                            {/* Swaps 07:30 ↔ 19:30 when the am/pm guess is wrong. */}
                            <Chip
                              active={shown.meridiem === "am"}
                              onClick={() =>
                                shown.meridiem === "pm" &&
                                setOverrides((o) => ({ ...o, flip: !o.flip }))
                              }
                            >
                              am
                            </Chip>
                            <Chip
                              active={shown.meridiem === "pm"}
                              onClick={() =>
                                shown.meridiem === "am" &&
                                setOverrides((o) => ({ ...o, flip: !o.flip }))
                              }
                            >
                              pm
                            </Chip>
                          </div>
                        )}
                      </>
                    ) : shown.kind === "change" ? (
                      <>
                        <Label>
                          {shown.action === "cancel" ? "Will remove" : "Will change"}
                          {shown.count > 1 ? ` ${shown.count} entries` : ""}
                        </Label>
                        <div className="text-sm">
                          <div className="font-semibold">{shown.title}</div>
                          <div className="text-neutral-500 line-through decoration-neutral-400/60">
                            {shown.before}
                          </div>
                          <div
                            className={
                              shown.action === "cancel"
                                ? "text-red-600"
                                : "text-teal-700 dark:text-teal-300"
                            }
                          >
                            → {shown.after}
                          </div>
                          {shown.note && (
                            <div className="mt-1 text-xs text-neutral-500">{shown.note}</div>
                          )}
                        </div>
                      </>
                    ) : (
                      <Answer heading={shown.heading} lines={shown.lines} />
                    )}
                  </div>
                )}
              </>
            )}

            <div className="flex items-end gap-2 border-t border-black/5 px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] dark:border-white/10 sm:pb-3">
              {speechOk && (
                <IconButton
                  label={listening ? "Stop listening" : "Speak"}
                  onClick={toggleMic}
                  className={listening ? "animate-pulse bg-red-500 text-white" : ""}
                >
                  🎤
                </IconButton>
              )}
              <IconButton label="Paste" onClick={paste}>
                📋
              </IconButton>
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  if (!e.target.value.trim()) setOverrides({});
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder={listening ? "Listening…" : "Add, change or ask…"}
                className="max-h-28 min-h-11 min-w-0 flex-1 resize-none rounded-2xl border border-black/10 bg-transparent px-3 py-2.5 text-base leading-snug outline-none focus:border-teal-600 dark:border-white/15 sm:text-sm"
              />
              <button
                type="button"
                onClick={submit}
                disabled={!ready}
                className={`h-11 shrink-0 rounded-full px-4 text-sm font-medium text-white disabled:opacity-40 ${
                  actionLabel === "Remove"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-teal-600 hover:bg-teal-700"
                }`}
              >
                {busy ? "…" : actionLabel}
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

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-neutral-400">
      {children}
    </div>
  );
}

function Chip({
  children,
  active,
  onClick,
  tone = "teal",
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  tone?: "teal" | "amber";
}) {
  const on =
    tone === "amber"
      ? "border-amber-400 bg-amber-200/70 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200"
      : "border-teal-600 bg-teal-600 text-white";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-xs transition ${
        active
          ? on
          : "border-black/10 text-neutral-600 hover:bg-black/5 dark:border-white/15 dark:text-neutral-300"
      }`}
    >
      {children}
    </button>
  );
}

function ChipRow({
  label,
  items,
  onPick,
}: {
  label: string;
  items: string[];
  onPick: (t: string) => void;
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-neutral-400">
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((t) => (
          <button
            key={t}
            onClick={() => onPick(t)}
            className="rounded-full border border-teal-600/30 px-3 py-1 text-xs text-teal-700 hover:bg-teal-600/10 dark:text-teal-300"
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

function IconButton({
  children,
  label,
  onClick,
  className = "",
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/5 text-lg transition hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20 ${className}`}
    >
      {children}
    </button>
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

function Answer({ heading, lines }: { heading: string; lines: string[] }) {
  return (
    <div className="text-sm">
      <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-neutral-400">
        {heading}
      </div>
      {lines.map((l, i) =>
        l.startsWith("**") ? (
          <div key={i} className="mt-1.5 font-semibold first:mt-0">
            {l.replace(/\*\*/g, "")}
          </div>
        ) : (
          <div key={i} className="text-neutral-700 dark:text-neutral-300">
            {l}
          </div>
        ),
      )}
    </div>
  );
}
