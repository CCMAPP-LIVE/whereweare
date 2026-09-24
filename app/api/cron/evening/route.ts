import { NextResponse } from "next/server";
import { addDays, format, getISODay, parseISO } from "date-fns";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push/send";
import { isLondonHour, londonToday } from "@/lib/time";
import { loadDigestData, summaryFor } from "@/lib/digest";

/**
 * Evening-before summary, 19:00 Europe/London every day: "Tomorrow: you're on
 * drop-off 8:45 (Bernie) · 16:00 Swimming (Percy) · 🔔 PE kit · ⚠️ nobody on
 * Percy's pickup". On Sundays also a "week ahead" nudge to the print sheet.
 *
 * Scheduled at two UTC times (see vercel.json) and gated here to 19:00 London
 * so it's right in both BST and GMT. Vercel sends the CRON_SECRET bearer.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not set" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const force = new URL(request.url).searchParams.get("force") === "1";
  if (!force && !isLondonHour(19))
    return NextResponse.json({ skipped: true, reason: "not 19:00 Europe/London" });

  const admin = createAdminClient();
  const today = londonToday();
  const tomorrow = format(addDays(parseISO(`${today}T12:00:00`), 1), "yyyy-MM-dd");
  const data = await loadDigestData(admin, tomorrow, tomorrow);
  const isSunday = getISODay(parseISO(`${today}T12:00:00`)) === 7;

  const results = [];
  for (const p of data.people) {
    const lines = summaryFor(data, p.id, tomorrow);
    if (lines.length) {
      results.push({
        user: p.id,
        ...(await sendPushToUser(admin, p.id, {
          title: `Tomorrow — ${format(parseISO(`${tomorrow}T12:00:00`), "EEE d MMM")}`,
          body: lines.join("\n"),
          url: `/?view=day&date=${tomorrow}`,
        })),
      });
    }
    if (isSunday) {
      await sendPushToUser(admin, p.id, {
        title: "The week ahead",
        body: "Your week sheet is ready — tap to view, print or share on WhatsApp.",
        url: `/print?week=${tomorrow}`,
      });
    }
  }
  return NextResponse.json({ ok: true, tomorrow, results });
}
