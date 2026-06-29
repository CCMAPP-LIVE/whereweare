import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { google } from "googleapis";
import { googleServiceAccountAuth } from "@/lib/google/auth";
import { requireEnv } from "@/lib/env";
import { APP_TIMEZONE } from "@/lib/constants";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 500) : "";
  const date = typeof body.date === "string" ? body.date : "";
  const startTime: string | null = typeof body.startTime === "string" ? body.startTime : null;
  const endTime: string | null = typeof body.endTime === "string" ? body.endTime : null;
  const notes: string | null = typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) || null : null;

  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return NextResponse.json({ error: "invalid date" }, { status: 400 });
  if (startTime && !/^\d{2}:\d{2}$/.test(startTime))
    return NextResponse.json({ error: "invalid startTime" }, { status: 400 });
  if (endTime && !/^\d{2}:\d{2}$/.test(endTime))
    return NextResponse.json({ error: "invalid endTime" }, { status: 400 });

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  const name = profile?.display_name?.trim() || "Someone";

  const calendarId = requireEnv("LIFE_CALENDAR_ID");
  const calendar = google.calendar({ version: "v3", auth: googleServiceAccountAuth() });

  let eventStart: { date: string } | { dateTime: string; timeZone: string };
  let eventEnd: { date: string } | { dateTime: string; timeZone: string };

  if (startTime) {
    const effectiveEnd = endTime ?? startTime; // same time = 0-duration; Google treats that fine
    eventStart = { dateTime: `${date}T${startTime}:00`, timeZone: APP_TIMEZONE };
    eventEnd = { dateTime: `${date}T${effectiveEnd}:00`, timeZone: APP_TIMEZONE };
  } else {
    // All-day: end is exclusive next day
    const [y, m, d] = date.split("-").map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    const nextStr = next.toISOString().slice(0, 10);
    eventStart = { date };
    eventEnd = { date: nextStr };
  }

  const eventBody = {
    summary: `${name}: ${title}`,
    description: notes ?? undefined,
    start: eventStart,
    end: eventEnd,
  };

  const result = await calendar.events.insert({ calendarId, requestBody: eventBody });
  const eventId = result.data.id ?? null;

  return NextResponse.json({ ok: true, eventId });
}
