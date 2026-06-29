import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push/send";
import { isLondonHour } from "@/lib/time";

/**
 * Weekly "update where you'll be" reminder.
 *
 * Scheduled by Vercel Cron at two UTC times (see vercel.json) and gated here
 * to fire only at 18:00 Europe/London, so it lands at the right local time in
 * both BST and GMT. Vercel sends `Authorization: Bearer ${CRON_SECRET}`.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not set" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const force = new URL(request.url).searchParams.get("force") === "1";
  if (!force && !isLondonHour(18)) {
    return NextResponse.json({
      skipped: true,
      reason: "not 18:00 Europe/London",
    });
  }

  const admin = createAdminClient();
  const { data: profiles } = await admin.from("profiles").select("id");

  const payload = {
    title: "Where We Are",
    body: "Tap to set where you'll be in the week ahead",
    url: "/",
  };

  const results = [];
  for (const p of profiles ?? []) {
    results.push({ user: p.id, ...(await sendPushToUser(admin, p.id, payload)) });
  }

  return NextResponse.json({ ok: true, results });
}
