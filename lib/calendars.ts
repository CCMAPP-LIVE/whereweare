import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { NormalizedEvent, Provider } from "@/lib/types";
import {
  listGoogleCalendars,
  listGoogleEvents,
  type DiscoveredCalendar,
} from "@/lib/google/calendar";
import {
  listMicrosoftCalendars,
  listMicrosoftEvents,
  microsoftAccessToken,
} from "@/lib/microsoft/calendar";

type Admin = SupabaseClient<Database>;

/** How long we'll wait on a single calendar fetch before giving up on it. */
const CALENDAR_FETCH_TIMEOUT_MS = 6000;

/** Resolve `p`, or `fallback` if it rejects or takes longer than `ms`. */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    p.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

type AccountWithToken = {
  id: string;
  provider: Provider;
  refresh_token: string;
};

export type ConnectedAccount = {
  id: string;
  provider: Provider;
  account_email: string | null;
};

/** Connected accounts for a user, joined with their refresh tokens (in JS). */
async function accountsForUser(
  admin: Admin,
  userId: string,
): Promise<AccountWithToken[]> {
  const { data: accounts } = await admin
    .from("calendar_accounts")
    .select("id, provider")
    .eq("user_id", userId);
  if (!accounts?.length) return [];

  const ids = accounts.map((a) => a.id);
  const { data: tokens } = await admin
    .from("calendar_oauth_tokens")
    .select("calendar_account_id, refresh_token")
    .in("calendar_account_id", ids);
  const tokenMap = new Map(
    (tokens ?? []).map((t) => [t.calendar_account_id, t.refresh_token]),
  );

  return accounts.flatMap((a) => {
    const refresh_token = tokenMap.get(a.id);
    return refresh_token ? [{ id: a.id, provider: a.provider, refresh_token }] : [];
  });
}

/**
 * Read + merge events from every calendar across every connected account for
 * a user. Resilient: a failing account/calendar yields no events rather than
 * throwing, so the page still renders availability.
 */
export async function getEventsForUser(
  admin: Admin,
  userId: string,
  timeMin: string,
  timeMax: string,
): Promise<NormalizedEvent[]> {
  const accounts = await accountsForUser(admin, userId);
  if (accounts.length === 0) return [];

  const { data: cals } = await admin
    .from("calendars")
    .select("external_id, color, calendar_account_id")
    .in(
      "calendar_account_id",
      accounts.map((a) => a.id),
    );

  const byAccount = new Map(accounts.map((a) => [a.id, a]));
  const tasks: Promise<NormalizedEvent[]>[] = [];

  for (const cal of cals ?? []) {
    const account = byAccount.get(cal.calendar_account_id);
    if (!account) continue;
    const fetchOne =
      account.provider === "google"
        ? listGoogleEvents(
            account.refresh_token,
            cal.external_id,
            timeMin,
            timeMax,
            cal.color,
          )
        : microsoftAccessToken(account.refresh_token).then((token) =>
            listMicrosoftEvents(token, cal.external_id, timeMin, timeMax, cal.color),
          );
    // A slow or hung provider must never block the page render, so cap the
    // wait per calendar and fall back to no events from that one.
    tasks.push(withTimeout(fetchOne, CALENDAR_FETCH_TIMEOUT_MS, []));
  }

  return (await Promise.all(tasks)).flat();
}

/**
 * Discover calendars from every connected account and upsert them. Every
 * calendar is shown, so there's nothing to preserve beyond identity.
 */
export async function refreshCalendarsForUser(
  admin: Admin,
  userId: string,
): Promise<void> {
  const accounts = await accountsForUser(admin, userId);

  for (const account of accounts) {
    let discovered: DiscoveredCalendar[] = [];
    try {
      discovered =
        account.provider === "google"
          ? await listGoogleCalendars(account.refresh_token)
          : await listMicrosoftCalendars(
              await microsoftAccessToken(account.refresh_token),
            );
    } catch {
      continue;
    }

    const rows = discovered.map((c) => ({
      calendar_account_id: account.id,
      external_id: c.externalId,
      summary: c.summary,
      color: c.color,
      is_primary: c.isPrimary,
      enabled: true,
    }));

    if (rows.length > 0) {
      await admin
        .from("calendars")
        .upsert(rows, { onConflict: "calendar_account_id,external_id" });
    }
  }
}

/** Connected accounts for the settings UI. */
export async function getAccountsForUser(
  admin: Admin,
  userId: string,
): Promise<ConnectedAccount[]> {
  const { data: accounts } = await admin
    .from("calendar_accounts")
    .select("id, provider, account_email")
    .eq("user_id", userId)
    .order("created_at");
  return accounts ?? [];
}
