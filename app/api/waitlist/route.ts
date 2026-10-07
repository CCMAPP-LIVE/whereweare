import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { escapeHtml, sendEmail } from "@/lib/email";
import { sendPushToUser } from "@/lib/push/send";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NOTIFY_TO = process.env.WAITLIST_NOTIFY_EMAIL || "david@meyouwhen.com";

/**
 * Public: join the MeYouWhen waiting list. Always answers "you're on the
 * list" for a valid email (even if already signed up) so it can't be used to
 * check who has joined.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  // Honeypot: real visitors never see or fill this field.
  if (typeof body.website === "string" && body.website.trim() !== "")
    return NextResponse.json({ ok: true });

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 200) : "";
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) || null : null;
  const useCase =
    typeof body.useCase === "string" ? body.useCase.trim().slice(0, 500) || null : null;
  if (!EMAIL_RE.test(email))
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("waitlist").insert({ email, name, use_case: useCase });

  if (error && error.code !== "23505") {
    return NextResponse.json({ error: "Couldn't add you just now. Please try again." }, { status: 500 });
  }

  if (!error) {
    // New signup (not a repeat): let the owner know. Best-effort.
    const rows: [string, string][] = [
      ["Email", email],
      ...(name ? ([["Name", name]] as [string, string][]) : []),
      ...(useCase ? ([["Would use it for", useCase]] as [string, string][]) : []),
    ];
    // Phone alert to whoever runs booking links (the MeYouWhen owner).
    const { data: owners } = await admin.from("booking_links").select("user_id");
    const ownerIds = [...new Set((owners ?? []).map((o) => o.user_id))];
    await Promise.allSettled(
      ownerIds.map((id) =>
        sendPushToUser(admin, id, {
          title: "New waiting-list signup",
          body: name ? `${name} (${email})` : email,
          url: "/bookings",
        }),
      ),
    );

    await sendEmail({
      to: NOTIFY_TO,
      replyTo: email,
      subject: `Waiting list: ${name ? `${name} (${email})` : email}`,
      text: ["New MeYouWhen waiting-list signup", "", ...rows.map(([k, v]) => `${k}: ${v}`)].join("\n"),
      html: `<div style="font-family:system-ui,sans-serif;font-size:15px;color:#171717">
<p style="margin:0 0 12px">New <strong>MeYouWhen</strong> waiting-list signup</p>
<table cellpadding="6" style="border-collapse:collapse">${rows
        .map(
          ([k, v]) =>
            `<tr><td style="color:#737373;vertical-align:top">${escapeHtml(k)}</td><td style="white-space:pre-line">${escapeHtml(v)}</td></tr>`,
        )
        .join("")}</table>
</div>`,
    }).catch(() => false);
  }

  return NextResponse.json({ ok: true });
}
