/**
 * Transactional email via Resend's HTTP API (no SDK). Sends from the booking
 * domain, which is verified in Resend. Needs RESEND_API_KEY; without it every
 * send is a no-op that reports `false`, so callers can treat email as optional.
 */

const FROM = process.env.EMAIL_FROM || "MeYouWhen <bookings@meyouwhen.com>";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) console.error("Resend send failed", res.status, await res.text().catch(() => ""));
    return res.ok;
  } catch (err) {
    console.error("Resend send error", err);
    return false;
  } finally {
    clearTimeout(timer);
  }
}
