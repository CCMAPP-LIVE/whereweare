"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { APP_NAME } from "@/lib/constants";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        scopes: "https://www.googleapis.com/auth/calendar.readonly",
        queryParams: { access_type: "offline", prompt: "consent" },
        redirectTo: `${window.location.origin}/auth/callback?provider=google&next=/`,
      },
    });
    if (error) {
      setLoading(false);
      alert(`Sign-in failed: ${error.message}`);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-black/10 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-neutral-900">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-600 text-2xl">
          📍
        </div>
        <h1 className="text-xl font-semibold">{APP_NAME}</h1>
        <p className="mt-2 text-sm text-neutral-500">
          See where you both are — at a glance.
        </p>
        <button
          onClick={signIn}
          disabled={loading}
          className="mt-6 w-full rounded-xl bg-teal-600 px-4 py-3 font-medium text-white transition hover:bg-teal-700 disabled:opacity-60"
        >
          {loading ? "Redirecting…" : "Continue with Google"}
        </button>
        <p className="mt-4 text-xs text-neutral-400">
          We only read your calendars. You can connect Outlook later in
          Settings.
        </p>
      </div>
    </main>
  );
}
