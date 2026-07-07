import { NextResponse } from "next/server";
import { addDays, format, parseISO } from "date-fns";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push/send";
import { isLondonHour, londonToday, weekStartOf } from "@/lib/time";

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

  // Point people at NEXT week's /school so tapping the notification opens
  // straight into the routine they need to plan (or mark as no-school).
  const nextMonday = format(
    addDays(parseISO(`${weekStartOf(londonToday())}T12:00:00`), 7),
    "yyyy-MM-dd",
  );

  const payload = {
    title: "Where We Are",
    body: "Plan next week — school routine + availability",
    url: `/school?date=${nextMonday}`,
  };

  const results = [];
  for (const p of profiles ?? []) {
    results.push({ user: p.id, ...(await sendPushToUser(admin, p.id, payload)) });
  }

  return NextResponse.json({ ok: true, results });
}
