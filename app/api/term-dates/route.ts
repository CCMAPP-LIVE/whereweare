import { NextResponse } from "next/server";
import { addDays, format, parseISO } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseIcs } from "@/lib/ics";
import { createWeekEvent } from "@/lib/weekEvents";
import { londonToday } from "@/lib/time";

export const maxDuration = 60;

/**
 * Import school term dates / holidays / INSET days from the school's calendar
 * (.ics link or file contents) as shared all-day "🏫 …" entries for the kids.
 * Skips anything already imported (same title on the same day). Re-run any
 * time to pick up new dates.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  let ics = typeof body.ics === "string" ? body.ics : "";
  if (!ics && typeof body.url === "string") {
    const url = body.url.trim().replace(/^webcal:/i, "https:");
    if (!/^https:\/\//i.test(url))
      return NextResponse.json({ error: "Use an https:// or webcal:// link" }, { status: 400 });
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(String(res.status));
      ics = (await res.text()).slice(0, 2_000_000);
    } catch {
      return NextResponse.json({ error: "Couldn't download that calendar link" }, { status: 400 });
    }
  }
  if (!/BEGIN:VCALENDAR/i.test(ics))
    return NextResponse.json(
      { error: "That doesn't look like a calendar (.ics) file" },
      { status: 400 },
    );

  const today = londonToday();
  const horizon = format(addDays(parseISO(`${today}T12:00:00`), 400), "yyyy-MM-dd");
  const admin = createAdminClient();
  const [{ data: kids }, { data: existing }] = await Promise.all([
    admin.from("kids").select("id"),
    admin.from("week_events").select("title, day, kid_ids").like("title", "🏫 %").gte("day", today),
  ]);
  // Which children this school's dates apply to (default: all).
  const allKids = (kids ?? []).map((k) => k.id);
  const chosen: string[] = Array.isArray(body.kidIds)
    ? body.kidIds.filter((k: unknown): k is string => typeof k === "string" && allKids.includes(k))
    : [];
  const kidIds = chosen.length ? chosen : allKids;
  const kidKey = [...kidIds].sort().join(",");
  const have = new Set(
    (existing ?? []).map((e) => `${e.title}|${e.day}|${[...(e.kid_ids ?? [])].sort().join(",")}`),
  );

  // One all-day entry per school day. Weekends inside a holiday are skipped
  // (single-day entries are kept even on a weekend); long holidays up to 60
  // days; duplicate entries in the feed are ignored.
  const todo: { title: string; day: string }[] = [];
  const queued = new Set<string>();
  for (const ev of parseIcs(ics)) {
    const title = `🏫 ${ev.title}`.slice(0, 200);
    const multiDay = addDays(parseISO(`${ev.start}T12:00:00`), 1) < parseISO(`${ev.end}T12:00:00`);
    let d = ev.start;
    for (let i = 0; d < ev.end && i < 60; i++) {
      const weekday = parseISO(`${d}T12:00:00`).getDay(); // 0 Sun … 6 Sat
      const key = `${title}|${d}|${kidKey}`;
      if (
        d >= today &&
        d <= horizon &&
        !(multiDay && (weekday === 0 || weekday === 6)) &&
        !have.has(key) &&
        !queued.has(key)
      ) {
        todo.push({ title, day: d });
        queued.add(key);
      }
      d = format(addDays(parseISO(`${d}T12:00:00`), 1), "yyyy-MM-dd");
    }
  }

  const started = Date.now();
  let added = 0;
  for (let i = 0; i < todo.length; i += 4) {
    if (Date.now() - started > 50_000) break;
    await Promise.all(
      todo.slice(i, i + 4).map((t) =>
        createWeekEvent(admin, user.id, {
          title: t.title,
          day: t.day,
          startTime: null,
          endTime: null,
          notes: "School calendar",
          kidIds,
          assigneeUserId: null,
          helperId: null,
        })
          .then(() => added++)
          .catch(() => {}),
      ),
    );
  }
  return NextResponse.json({ ok: true, added, remaining: Math.max(0, todo.length - added) });
}
