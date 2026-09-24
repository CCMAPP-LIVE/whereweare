import crypto from "node:crypto";
import { requireEnv } from "@/lib/env";

/**
 * Verify a request really came from Slack (v0 HMAC over the raw body).
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */
export function verifySlackRequest(request: Request, rawBody: string): boolean {
  const ts = request.headers.get("x-slack-request-timestamp");
  const sig = request.headers.get("x-slack-signature");
  if (!ts || !sig) return false;
  // Reject anything older than 5 minutes (replay protection).
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 60 * 5) return false;
  const expected =
    "v0=" +
    crypto
      .createHmac("sha256", requireEnv("SLACK_SIGNING_SECRET"))
      .update(`v0:${ts}:${rawBody}`)
      .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Call a Slack Web API method with the bot token. Throws on `ok: false`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function slackApi<T = any>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${requireEnv("SLACK_BOT_TOKEN")}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Slack ${method} failed: ${json.error}`);
  return json as T;
}

/** GET-style methods (conversations.replies, users.info) take query params. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function slackGet<T = any>(method: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(
    `https://slack.com/api/${method}?${new URLSearchParams(params)}`,
    { headers: { Authorization: `Bearer ${requireEnv("SLACK_BOT_TOKEN")}` } },
  );
  const json = await res.json();
  if (!json.ok) throw new Error(`Slack ${method} failed: ${json.error}`);
  return json as T;
}

/** Metadata type the bot stamps on its confirmation replies. */
export const EVENTS_METADATA_TYPE = "wwa_events";

/**
 * The week_event ids most recently confirmed in a thread — read from the
 * metadata of the bot's latest confirmation reply. Returns [] if none.
 */
export async function eventIdsInThread(channel: string, threadTs: string): Promise<string[]> {
  const res = await slackGet<{
    messages: { bot_id?: string; metadata?: { event_type: string; event_payload: { ids?: string[] } } }[];
  }>("conversations.replies", {
    channel,
    ts: threadTs,
    include_all_metadata: "true",
    limit: "100",
  });
  for (const m of [...res.messages].reverse()) {
    if (m.bot_id && m.metadata?.event_type === EVENTS_METADATA_TYPE) {
      return m.metadata.event_payload.ids ?? [];
    }
  }
  return [];
}

/**
 * Map a Slack user to a Where We Are account by matching email addresses.
 * If the Slack (work) email differs from the app login, set SLACK_USER_MAP to
 * "U0123ABC=app@email.com,U0456DEF=other@email.com" to override per user.
 * Returns id null when no app account matches.
 */
export async function appUserForSlackUser(
  admin: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  slackUserId: string,
): Promise<{ id: string; email: string } | { id: null; email: string | null }> {
  const override = (process.env.SLACK_USER_MAP ?? "")
    .split(",")
    .map((pair) => pair.trim().split("="))
    .find(([id]) => id === slackUserId)?.[1];
  let email = override?.trim().toLowerCase() ?? null;
  if (!email) {
    const info = await slackGet<{ user: { profile?: { email?: string } } }>("users.info", {
      user: slackUserId,
    });
    email = info.user.profile?.email?.toLowerCase() ?? null;
  }
  if (!email) return { id: null, email: null };
  const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
  const match = data?.users.find((u) => u.email?.toLowerCase() === email);
  return match ? { id: match.id, email } : { id: null, email };
}
