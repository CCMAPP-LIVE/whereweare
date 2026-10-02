"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

type Props = {
  slug: string;
  title: string;
  description: string | null;
  hostName: string;
  hostEmail: string | null;
  lengthLabel: string; // "30 min", "Half day", "Whole day"
  durationMin: number; // actual length, used to show ranges on long slots
  addMeet: boolean;
  slots: string[]; // ISO start times (UTC)
  unavailable: boolean;
};

// The visitor's timezone is only known in the browser. Reading it through
// useSyncExternalStore gives the server a stable null (no hydration mismatch)
// and the client its real zone.
const noopSubscribe = () => () => {};
function useVisitorTimeZone(): string | null {
  return useSyncExternalStore(
    noopSubscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => null,
  );
}

function dayKey(iso: string, tz: string): string {
  // en-CA formats as YYYY-MM-DD, which sorts and groups cleanly.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function fmt(iso: string, tz: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, ...opts }).format(new Date(iso));
}

type Result = { start: string; end: string; meetUrl: string | null; hostEmail: string | null };

export default function BookingPicker({
  slug,
  title,
  description,
  hostName,
  hostEmail,
  lengthLabel,
  durationMin,
  addMeet,
  slots,
  unavailable,
}: Props) {
  const tz = useVisitorTimeZone();
  const router = useRouter();
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const byDay = useMemo(() => {
    if (!tz) return new Map<string, string[]>();
    const map = new Map<string, string[]>();
    for (const s of slots) {
      const k = dayKey(s, tz);
      const list = map.get(k) ?? [];
      list.push(s);
      map.set(k, list);
    }
    return map;
  }, [slots, tz]);

  const days = [...byDay.keys()];
  const activeDay = day && byDay.has(day) ? day : (days[0] ?? null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!slot) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/book/${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start: slot, name, email, notes, website }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok) {
        setResult(json as Result);
      } else {
        setError(json.error ?? "Couldn't book that time. Please try again.");
        if (json.taken) {
          setSlot(null);
          router.refresh();
        }
      }
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <header className="mb-5">
      {hostName && <p className="text-sm text-neutral-500">{hostName}</p>}
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
        {lengthLabel}
        {addMeet ? " · Google Meet" : ""}
        {hostEmail ? ` · invite from ${hostEmail}` : ""}
      </p>
      {description && (
        <p className="mt-3 whitespace-pre-line text-sm text-neutral-700 dark:text-neutral-200">
          {description}
        </p>
      )}
    </header>
  );

  if (result && tz) {
    return (
      <main className="mx-auto w-full max-w-xl flex-1 p-5">
        {header}
        <section className="rounded-2xl border border-teal-500/40 bg-teal-50/50 p-4 dark:bg-teal-950/20">
          <h2 className="text-lg font-semibold">You&apos;re booked ✓</h2>
          <p className="mt-1 text-sm">
            {fmt(result.start, tz, { weekday: "long", day: "numeric", month: "long" })},{" "}
            {fmt(result.start, tz, { hour: "2-digit", minute: "2-digit" })}–
            {fmt(result.end, tz, { hour: "2-digit", minute: "2-digit" })} ({tz})
          </p>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
            A calendar invite{result.hostEmail ? ` from ${result.hostEmail}` : ""} is on its way to{" "}
            {email}.
          </p>
          {result.meetUrl && (
            <p className="mt-2 text-sm">
              Meet link:{" "}
              <a href={result.meetUrl} className="text-teal-700 underline dark:text-teal-300">
                {result.meetUrl}
              </a>
            </p>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-xl flex-1 p-5">
      {header}

      {unavailable ? (
        <p className="rounded-2xl border border-black/10 p-4 text-sm text-neutral-600 dark:border-white/10">
          Booking is temporarily unavailable. Please try again shortly, or get in touch directly.
        </p>
      ) : !tz ? (
        <p className="text-sm text-neutral-400">Loading available times…</p>
      ) : days.length === 0 ? (
        <p className="rounded-2xl border border-black/10 p-4 text-sm text-neutral-600 dark:border-white/10">
          No times are free at the moment. Please get in touch directly.
        </p>
      ) : (
        <>
          <section className="mb-4">
            <h2 className="mb-2 text-xs font-medium uppercase text-neutral-400">Pick a day</h2>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {days.map((k) => {
                const first = byDay.get(k)![0];
                const selected = k === activeDay;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setDay(k);
                      setSlot(null);
                    }}
                    className={
                      "shrink-0 rounded-xl border px-3 py-2 text-center text-sm " +
                      (selected
                        ? "border-teal-600 bg-teal-600 text-white"
                        : "border-black/10 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10")
                    }
                  >
                    <div className="text-[11px] uppercase opacity-80">
                      {fmt(first, tz, { weekday: "short" })}
                    </div>
                    <div className="font-semibold">{fmt(first, tz, { day: "numeric", month: "short" })}</div>
                  </button>
                );
              })}
            </div>
          </section>

          {activeDay && (
            <section className="mb-4">
              <h2 className="mb-2 text-xs font-medium uppercase text-neutral-400">
                Pick a time <span className="normal-case">({tz})</span>
              </h2>
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                {byDay.get(activeDay)!.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSlot(s)}
                    className={
                      "rounded-lg border px-2 py-2 text-sm tabular-nums " +
                      (s === slot
                        ? "border-teal-600 bg-teal-600 text-white"
                        : "border-black/10 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10")
                    }
                  >
                    {fmt(s, tz, { hour: "2-digit", minute: "2-digit" })}
                    {durationMin >= 120 &&
                      `–${fmt(new Date(Date.parse(s) + durationMin * 60_000).toISOString(), tz, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}`}
                  </button>
                ))}
              </div>
            </section>
          )}

          {slot && (
            <form
              onSubmit={submit}
              className="space-y-2 rounded-2xl border border-black/10 p-4 dark:border-white/10"
            >
              <p className="text-sm font-medium">
                {fmt(slot, tz, { weekday: "long", day: "numeric", month: "long" })} at{" "}
                {fmt(slot, tz, { hour: "2-digit", minute: "2-digit" })}
              </p>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
                className="w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
              />
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Your email"
                autoComplete="email"
                className="w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
              />
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything to share before the meeting? (optional)"
                rows={3}
                className="w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
              />
              {/* Honeypot for bots — hidden from people and screen readers. */}
              <input
                tabIndex={-1}
                aria-hidden
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="hidden"
                name="website"
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                disabled={busy}
                className="w-full rounded-lg bg-teal-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {busy ? "Booking…" : "Confirm booking"}
              </button>
            </form>
          )}
        </>
      )}
    </main>
  );
}
