"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Account = {
  id: string;
  provider: "google" | "microsoft";
  account_email: string | null;
};

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.2C29.2 35.3 26.7 36 24 36c-5.3 0-9.7-3.1-11.3-7.6l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.6l6.3 5.2C41.9 35.6 44 30.3 44 24c0-1.3-.1-2.3-.4-3.5z"
      />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path fill="#F25022" d="M11.4 11.4H2V2h9.4z" />
      <path fill="#7FBA00" d="M22 11.4h-9.4V2H22z" />
      <path fill="#00A4EF" d="M11.4 22H2v-9.4h9.4z" />
      <path fill="#FFB900" d="M22 22h-9.4v-9.4H22z" />
    </svg>
  );
}

export default function ConnectAccounts({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function connect(provider: "google" | "azure", label: string) {
    setBusy(label);
    const supabase = createClient();
    const providerParam = provider === "azure" ? "microsoft" : "google";
    const options =
      provider === "google"
        ? {
            scopes: "https://www.googleapis.com/auth/calendar.readonly",
            queryParams: { access_type: "offline", prompt: "consent" },
            redirectTo: `${location.origin}/auth/callback?provider=google&next=/settings`,
          }
        : {
            scopes: "openid email offline_access Calendars.Read",
            redirectTo: `${location.origin}/auth/callback?provider=microsoft&next=/settings`,
          };
    const { error } = await supabase.auth.linkIdentity({ provider, options });
    if (error) {
      setBusy(null);
      alert(`Couldn't start connecting ${providerParam}: ${error.message}`);
    }
  }

  async function disconnect(account: Account) {
    if (!confirm(`Disconnect ${account.account_email ?? account.provider}?`)) return;
    setBusy(account.id);
    const res = await fetch(`/api/connect/${account.id}`, { method: "DELETE" });
    setBusy(null);
    if (res.ok) router.refresh();
    else alert("Couldn't disconnect.");
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-500">
        Connect as many accounts as you like — Gmail, Google Workspace and
        Outlook (Microsoft 365). Events from the calendars you pick all show up
        together.
      </p>

      {accounts.length > 0 && (
        <ul className="space-y-1.5">
          {accounts.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-2 rounded-xl border border-black/10 px-3 py-2.5 text-sm dark:border-white/10"
            >
              {a.provider === "google" ? <GoogleIcon /> : <MicrosoftIcon />}
              <span className="min-w-0 flex-1 truncate">
                {a.account_email ?? a.provider}
              </span>
              <button
                onClick={() => disconnect(a)}
                disabled={busy === a.id}
                className="shrink-0 text-xs text-neutral-400 hover:text-red-600 disabled:opacity-50"
              >
                Disconnect
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <button
          onClick={() => connect("google", "google")}
          disabled={busy === "google"}
          className="flex items-center justify-center gap-2 rounded-xl border border-black/15 bg-white px-4 py-3 text-sm font-medium text-neutral-800 shadow-sm transition hover:bg-neutral-50 disabled:opacity-60"
        >
          <GoogleIcon />
          {busy === "google" ? "Connecting…" : "Connect Google / Gmail"}
        </button>
        <button
          onClick={() => connect("azure", "azure")}
          disabled={busy === "azure"}
          className="flex items-center justify-center gap-2 rounded-xl border border-black/15 bg-white px-4 py-3 text-sm font-medium text-neutral-800 shadow-sm transition hover:bg-neutral-50 disabled:opacity-60"
        >
          <MicrosoftIcon />
          {busy === "azure" ? "Connecting…" : "Connect Outlook / Microsoft 365"}
        </button>
      </div>
    </div>
  );
}
