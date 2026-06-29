"use client";

import { createClient } from "@/lib/supabase/client";

type Account = {
  id: string;
  provider: "google" | "microsoft";
  account_email: string | null;
};

export default function ConnectAccounts({ accounts }: { accounts: Account[] }) {
  async function connectGoogle() {
    const supabase = createClient();
    const { error } = await supabase.auth.linkIdentity({
      provider: "google",
      options: {
        scopes: "https://www.googleapis.com/auth/calendar.readonly",
        queryParams: { access_type: "offline", prompt: "consent" },
        redirectTo: `${location.origin}/auth/callback?provider=google&next=/settings`,
      },
    });
    if (error) alert(error.message);
  }

  async function connectOutlook() {
    const supabase = createClient();
    const { error } = await supabase.auth.linkIdentity({
      provider: "azure",
      options: {
        scopes: "openid email offline_access Calendars.Read",
        redirectTo: `${location.origin}/auth/callback?provider=microsoft&next=/settings`,
      },
    });
    if (error) alert(error.message);
  }

  return (
    <div className="space-y-3">
      {accounts.length > 0 && (
        <ul className="space-y-1.5">
          {accounts.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-2 rounded-lg border border-black/10 px-3 py-2 text-sm dark:border-white/10"
            >
              <span aria-hidden>{a.provider === "google" ? "🟢" : "🔵"}</span>
              <span className="font-medium capitalize">{a.provider}</span>
              <span className="text-neutral-400">{a.account_email}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={connectGoogle}
          className="rounded-lg border border-black/10 px-3 py-2 text-sm hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
        >
          + Connect a Google account
        </button>
        <button
          onClick={connectOutlook}
          className="rounded-lg border border-black/10 px-3 py-2 text-sm hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
        >
          + Connect Outlook (Microsoft 365)
        </button>
      </div>
    </div>
  );
}
