import { after, NextResponse } from "next/server";
import { format, parseISO } from "date-fns";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  appUserForSlackUser,
  EVENTS_METADATA_TYPE,
  eventIdsInThread,
  slackApi,
  verifySlackRequest,
} from "@/lib/slack";
import { parseQuickAdd, type ExistingEvent, type ParsedEvent } from "@/lib/quickAdd";
import {
  createWeekEvent,
  deleteWeekEvent,
  updateWeekEvent,
  type WeekEventInput,
} from "@/lib/weekEvents";

// Claude + Supabase + Google sync run in after(); give them room.
export const maxDuration = 60;

const TIME_RE = /^\d{2}:\d{2}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

type SlackMessageEvent = {
  type: string;
  subtype?: string;
  bot_id?: string;
  user?: string;
  text?: string;
  channel: string;
  ts: string;
  thread_ts?: string;
};

/**
 * Slack Events API endpoint. Slack needs a 200 within 3s, so we ack
 * immediately and do the work (Claude parse, DB write, reply) in after().
 */
export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifySlackRequest(request, raw))
    return NextResponse.json({ error: "bad signature" }, { status: 401 });

  const body = JSON.parse(raw);
  if (body.type === "url_verification")
    return NextResponse.json({ challenge: body.challenge });

  // Slack retries if we were slow; the first delivery is already being handled.
  if (request.headers.get("x-slack-retry-num")) return NextResponse.json({ ok: true });

  const event: SlackMessageEvent | undefined = body.event;
  if (
    body.type === "event_callback" &&
    event?.type === "message" &&
    !event.subtype &&
    !event.bot_id &&
    event.user &&
    event.text?.trim()
  ) {
    after(() => handleMessage(event));
  }
  return NextResponse.json({ ok: true });
}

async function handleMessage(event: SlackMessageEvent) {
  const threadTs = event.thread_ts ?? event.ts;
  const reply = (text: string, extra: Record<string, unknown> = {}) =>
    slackApi("chat.postMessage", { channel: event.channel, thread_ts: threadTs, text, ...extra });

  try {
    const admin = createAdminClient();
    const appUser = await appUserForSlackUser(admin, event.user!);
    if (!appUser.id) {
      await reply(
        `I don't recognise you yet — your Slack email (${appUser.email ?? "hidden"}) doesn't match a Where We Are account. Ask David to link your Slack ID \`${event.user}\`.`,
      );
      return;
    }
    const userId = appUser.id;

    const [profilesRes, helpersRes, kidsRes] = await Promise.all([
      admin.from("profiles").select("id, display_name"),
      admin.from("helpers").select("id, name").order("sort_order"),
      admin.from("kids").select("id, name").order("sort_order"),
    ]);
    const profiles = (profilesRes.data ?? []).filter((p) => p.display_name);
    const helpers = helpersRes.data ?? [];
    const kids = kidsRes.data ?? [];
    const nameOf = (id: string | null) =>
      profiles.find((p) => p.id === id)?.display_name ?? null;
    const senderName = nameOf(userId) ?? "Someone";

    // A reply in a thread the bot confirmed → those events are editable context.
    const existingIds = event.thread_ts ? await eventIdsInThread(event.channel, event.thread_ts) : [];
    const { data: existingRows } = existingIds.length
      ? await admin.from("week_events").select("*").in("id", existingIds)
      : { data: [] };
    const existingRowsOrdered = existingIds
      .map((id) => (existingRows ?? []).find((r) => r.id === id))
      .filter((r): r is NonNullable<typeof r> => !!r);
    const existing: ExistingEvent[] = existingRowsOrdered.map((r) => ({
      title: r.title,
      day: r.day,
      startTime: r.start_time,
      endTime: r.end_time,
      notes: r.notes,
      kids: kids.filter((k) => r.kid_ids.includes(k.id)).map((k) => k.name),
      assignee:
        helpers.find((h) => h.id === r.helper_id)?.name ?? nameOf(r.assignee_user_id),
    }));

    const parsed = await parseQuickAdd({
      text: event.text!,
      senderName,
      people: profiles.map((p) => p.display_name!),
      helpers: helpers.map((h) => h.name),
      kids: kids.map((k) => k.name),
      existing,
    });

    const toInput = (p: ParsedEvent): WeekEventInput | null => {
      if (!p.title.trim() || !DAY_RE.test(p.day)) return null;
      const lc = p.assignee.trim().toLowerCase();
      const helper = lc ? helpers.find((h) => h.name.toLowerCase() === lc) : undefined;
      const person = lc && !helper
        ? profiles.find((x) => x.display_name!.toLowerCase() === lc)
        : undefined;
      return {
        title: p.title.trim().slice(0, 200),
        day: p.day,
        startTime: TIME_RE.test(p.start_time) ? p.start_time : null,
        endTime: TIME_RE.test(p.start_time) && TIME_RE.test(p.end_time) ? p.end_time : null,
        notes: p.notes.trim().slice(0, 2000) || null,
        kidIds: kids
          .filter((k) => p.kids.some((n) => n.toLowerCase() === k.name.toLowerCase()))
          .map((k) => k.id),
        helperId: helper?.id ?? null,
        assigneeUserId: person?.id ?? null,
      };
    };

    const describe = (ev: WeekEventInput) => {
      const bits = [`*${ev.title}*`];
      const kidNames = kids.filter((k) => ev.kidIds.includes(k.id)).map((k) => k.name);
      if (kidNames.length) bits.push(kidNames.join(" & "));
      let when = format(parseISO(`${ev.day}T12:00:00`), "EEE d MMM");
      if (ev.startTime) when += `, ${ev.startTime}${ev.endTime ? `–${ev.endTime}` : ""}`;
      else when += " (all day)";
      bits.push(when);
      const who = helpers.find((h) => h.id === ev.helperId)?.name ?? nameOf(ev.assigneeUserId);
      if (who) bits.push(who);
      return bits.join(" · ");
    };

    const confirm = async (lines: string[], ids: string[], undoIds: string[]) => {
      const text = lines.join("\n");
      const blocks: unknown[] = [
        { type: "section", text: { type: "mrkdwn", text } },
        {
          type: "context",
          elements: [{ type: "mrkdwn", text: "Reply in this thread to change or cancel." }],
        },
      ];
      if (undoIds.length) {
        blocks.push({
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "Undo" },
              style: "danger",
              action_id: "undo_events",
              value: JSON.stringify(undoIds),
            },
          ],
        });
      }
      await reply(text, {
        blocks,
        metadata: { event_type: EVENTS_METADATA_TYPE, event_payload: { ids } },
      });
    };

    if (parsed.action === "none" || parsed.events.length === 0) {
      await reply(parsed.message || "I couldn't find an event in that.");
      return;
    }

    if (parsed.action === "create") {
      const lines: string[] = [];
      const newIds: string[] = [];
      let lifeWarning = false;
      for (const p of parsed.events) {
        const input = toInput(p);
        if (!input) continue;
        const res = await createWeekEvent(admin, userId, input);
        newIds.push(res.id);
        if (!res.lifeSynced) lifeWarning = true;
        lines.push(`✅ Added ${describe(input)}`);
      }
      if (!newIds.length) {
        await reply("I couldn't work out a date for that — could you say which day?");
        return;
      }
      if (lifeWarning) lines.push("_(Saved in the app, but the Life calendar sync failed.)_");
      await confirm(lines, [...existingIds, ...newIds], newIds);
      return;
    }

    // update / delete act on events already confirmed in this thread.
    if (!existingRowsOrdered.length) {
      await reply("I can only change events from a thread I've confirmed — reply under the ✅ message.");
      return;
    }
    const lines: string[] = [];
    const deleted = new Set<string>();
    for (const p of parsed.events) {
      const row = existingRowsOrdered[p.index];
      if (!row) continue;
      if (row.user_id !== userId) {
        lines.push(`🔒 Only ${nameOf(row.user_id) ?? "the person who added it"} can change *${row.title}*.`);
        continue;
      }
      if (parsed.action === "delete") {
        await deleteWeekEvent(admin, row.id, row.google_event_id);
        deleted.add(row.id);
        lines.push(`🗑️ Removed *${row.title}*`);
      } else {
        const input = toInput(p);
        if (!input) continue;
        await updateWeekEvent(admin, row.id, input, row.google_event_id);
        lines.push(`✏️ Updated ${describe(input)}`);
      }
    }
    if (!lines.length) {
      await reply(parsed.message || "I wasn't sure what to change — could you rephrase?");
      return;
    }
    await confirm(lines, existingIds.filter((id) => !deleted.has(id)), []);
  } catch (e) {
    console.error("slack handleMessage failed", e);
    await reply(`⚠️ Something went wrong: ${(e as Error).message}`).catch(() => {});
  }
}
