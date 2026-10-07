"use client";

import { useState } from "react";

export default function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [useCase, setUseCase] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="rounded-2xl border border-teal-500/40 bg-teal-50/60 p-5 text-center dark:bg-teal-950/20">
        <p className="text-lg font-semibold">You&apos;re on the list ✓</p>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
          We&apos;ll email you when MeYouWhen is ready for you.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const res = await fetch("/api/waitlist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, name, useCase, website }),
          });
          const json = await res.json().catch(() => ({}));
          if (res.ok && json.ok) setDone(true);
          else setError(json.error ?? "Couldn't add you just now. Please try again.");
        } catch {
          setError("Couldn't reach the server. Please try again.");
        } finally {
          setBusy(false);
        }
      }}
      className="space-y-2 rounded-2xl border border-black/10 p-5 text-left dark:border-white/10"
    >
      <h2 className="text-base font-semibold">Join the waiting list</h2>
      <input
        required
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Your email"
        autoComplete="email"
        className="w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
      />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name (optional)"
        autoComplete="name"
        className="w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
      />
      <textarea
        value={useCase}
        onChange={(e) => setUseCase(e.target.value)}
        placeholder="What would you use it for? (optional)"
        rows={2}
        className="w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
      />
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
        {busy ? "Joining…" : "Join the waiting list"}
      </button>
      <p className="text-[11px] text-neutral-500">
        We&apos;ll only use your email to tell you about MeYouWhen. Unsubscribe any time.{" "}
        <a href="/privacy" className="underline">
          Privacy
        </a>
      </p>
    </form>
  );
}
