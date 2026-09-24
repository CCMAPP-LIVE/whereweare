import { NextResponse } from "next/server";
import { format, parseISO } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseNewEvent, type Directory, type ParsedEvent } from "@/lib/quickAdd";
import { loadDirectory } from "@/lib/slackUi";
import { createWeekEvent, deleteWeekEvent } from "@/lib/weekEvents";
import { londonToday } from "@/lib/time";

export const maxDuration = 60;

/**
 * In-app quick add (the floating chat button). Same house rules as the Slack
 * bot. `preview` shows what would be added; `save` re-parses the same text on
 * the server and creates it; DELETE undoes.
 */

type Summary = {
  title: string;
  when: string;
  kids: string[];
  who: string;
  count: number;
  notes: string | null;
};

function summarise(
  dir: Directory,
  events: ParsedEvent[],
  seriesNote: string | null,
  spanLabel: string | null,
): Summary {
  const first = events[0];
  const day = format(parseISO(`${first.day}T12:00:00`), "EEE d MMM");
  const time = first.startTime
    ? `${first.startTime}${first.endTime ? `–${first.endTime}` : ""}`
    : "all day";
  let when = spanLabel ?? `${day}, ${time}`;
  if (seriesNote) when += ` · repeats ${seriesNote}`;
  if (!seriesNote && !spanLabel && events.length > 1) {
    when = events
      .map((e) => format(parseISO(`${e.day}T12:00:00`), "EEE d MMM"))
      .join(" & ") + `, ${time}`;
  }
  const who =
    dir.helpers.find((h) => h.id === first.helperId)?.name ??
    dir.people.find((p) => p.id === first.assigneeUserId)?.name ??
    dir.people.map((p) => p.name).join(" & ");
  return {
    title: first.title,
    when,
    kids: dir.kids.filter((k) => first.kidIds.includes(k.id)).map((k) => k.name),
    who,
    count: events.length,
    // For spans the notes are just the span label again.
    notes: spanLabel ? null : first.notes,
  };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 500) : "";
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });

  const admin = createAdminClient();
  const dir = await loadDirectory(admin, user.id);
  const parsed = parseNewEvent(text, dir, londonToday());
  if (!parsed.ok) return NextResponse.json({ ok: false, message: parsed.message });

  const summary = summarise(dir, parsed.events, parsed.seriesNote, parsed.spanLabel);
  if (body.action !== "save") return NextResponse.json({ ok: true, summary });

  const ids: string[] = [];
  let lifeSynced = true;
  try {
    for (const ev of parsed.events) {
      const res = await createWeekEvent(admin, user.id, ev);
      ids.push(res.id);
      if (!res.lifeSynced) lifeSynced = false;
    }
  } catch (e) {
    // Don't leave half a series behind.
    for (const id of ids) await deleteWeekEvent(admin, id, null).catch(() => {});
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, summary, ids, lifeSynced });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids)
    ? body.ids.filter((x: unknown): x is string => typeof x === "string").slice(0, 60)
    : [];
  if (!ids.length) return NextResponse.json({ ok: true, removed: 0 });

  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("week_events")
    .select("id, user_id, google_event_id")
    .in("id", ids);
  const mine = (rows ?? []).filter((r) => r.user_id === user.id);
  for (const r of mine) await deleteWeekEvent(admin, r.id, r.google_event_id);
  return NextResponse.json({ ok: true, removed: mine.length });
}
