import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Signed-in only: send a fixed test message to check booking emails work.
 * The content can't be set by the caller, so this can't be used to send
 * arbitrary mail.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { to?: unknown };
  const to = typeof body.to === "string" ? body.to.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(to)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (!process.env.RESEND_API_KEY)
    return NextResponse.json({ error: "Email isn't set up (RESEND_API_KEY missing)." }, { status: 503 });

  const ok = await sendEmail({
    to,
    subject: "MeYouWhen test email",
    text: "This is a test from your booking pages. If you can read this, booking emails are working.",
    html: `<div style="font-family:system-ui,sans-serif;font-size:15px;color:#171717"><p>This is a test from your booking pages.</p><p>If you can read this, <strong>booking emails are working</strong>.</p></div>`,
  });
  return ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json(
        { error: "Resend didn't accept it. Check meyouwhen.com is verified in Resend and the API key is right." },
        { status: 502 },
      );
}
