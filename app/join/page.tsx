"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { APP_NAME } from "@/lib/constants";

function JoinInner() {
  const router = useRouter();
  const params = useSearchParams();
  const code = params.get("code") ?? "";
  const lockedEmail = params.get("email") ?? "";

  const [name, setName] = useState("");
  const [email, setEmail] = useState(lockedEmail);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, name, email, password }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setLoading(false);
      setError(body.error ?? "Could not join.");
      return;
    }
    const supabase = createClient();
    const { error: signErr } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (signErr) {
      router.push("/login");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-black/10 bg-white p-8 shadow-sm dark:border-white/10 dark:bg-neutral-900">
      <div className="mb-5 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-600 text-xl">
          📍
        </div>
        <h1 className="text-xl font-semibold">Join {APP_NAME}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          You’ve been invited — set up your account.
        </p>
      </div>

      {!code ? (
        <p className="text-center text-sm text-red-600">
          This invite link is missing its code. Ask whoever invited you for a
          fresh link.
        </p>
      ) : (
        <form onSubmit={join} className="space-y-3">
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="w-full rounded-xl border border-black/10 bg-transparent px-3 py-2.5 text-sm dark:border-white/10"
          />
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            readOnly={Boolean(lockedEmail)}
            className={`w-full rounded-xl border border-black/10 bg-transparent px-3 py-2.5 text-sm dark:border-white/10 ${
              lockedEmail ? "cursor-not-allowed text-neutral-500" : ""
            }`}
          />
          {lockedEmail && (
            <p className="-mt-2 text-[11px] text-neutral-400">
              This invite is locked to this email address.
            </p>
          )}
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Choose a password (min 6 characters)"
            className="w-full rounded-xl border border-black/10 bg-transparent px-3 py-2.5 text-sm dark:border-white/10"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            disabled={loading}
            className="w-full rounded-xl bg-teal-600 px-4 py-2.5 font-medium text-white hover:bg-teal-700 disabled:opacity-60"
          >
            {loading ? "Joining…" : "Join"}
          </button>
        </form>
      )}

      <p className="mt-4 text-center text-sm text-neutral-500">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-teal-600 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

export default function JoinPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Suspense fallback={<div className="text-sm text-neutral-400">Loading…</div>}>
        <JoinInner />
      </Suspense>
    </main>
  );
}
