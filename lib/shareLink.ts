import crypto from "node:crypto";
import type { IncludeKey } from "@/lib/weekSheet";

/**
 * Read-only week links for people without an account (Joy, grandparents).
 * The token is signed, so it can't be tampered with to see more; it carries
 * who/what to show and an expiry. Rotate SHARE_SECRET (or CRON_SECRET, the
 * fallback) to revoke every link at once.
 */
export type SharePayload = { who: string; include: IncludeKey[]; exp: number };

function secret(): string {
  const s = process.env.SHARE_SECRET || process.env.CRON_SECRET;
  if (!s) throw new Error("SHARE_SECRET / CRON_SECRET not set");
  return s;
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export function signShare(p: SharePayload): string {
  const body = b64(JSON.stringify(p));
  const sig = b64(crypto.createHmac("sha256", secret()).update(body).digest()).slice(0, 32);
  return `${body}.${sig}`;
}

export function verifyShare(token: string): SharePayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = b64(crypto.createHmac("sha256", secret()).update(body).digest()).slice(0, 32);
  if (
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  )
    return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as SharePayload;
    return p.exp > Date.now() ? p : null;
  } catch {
    return null;
  }
}
