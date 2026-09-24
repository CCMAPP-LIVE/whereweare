import { after, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { appUserForSlackUser, eventIdsInThread, slackApi, verifySlackRequest } from "@/lib/slack";
import { parseNewEvent, parseThreadReply, shiftEnd } from "@/lib/quickAdd";
import { describe, loadDirectory, postConfirmation, rowToInput } from "@/lib/slackUi";
import { createWeekEvent, deleteWeekEvent, updateWeekEvent } from "@/lib/weekEvents";
import { londonToday } from "@/lib/time";

// DB write + Life Calendar sync run in after(); give them room.
export const maxDuration = 60;

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

/** Short thread replies that need no answer. */
const ACK = /^(thanks|thank you|ta|ok|okay|cheers|great|nice|perfect|lovely|cool|👍|🙏)\b/i;

/**
 * Slack Events API endpoint. Slack needs a 200 within 3s, so we ack
 * immediately and do the work (parse, DB write, reply) in after().
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
  const reply = (text: string) =>
    slackApi("chat.postMessage", { channel: event.channel, thread_ts: threadTs, text });

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
    const dir = await loadDirectory(admin, userId);
    const today = londonToday();
    const text = event.text!.trim();

    // A reply under a confirmation → change/cancel those events.
    const existingIds = event.thread_ts
      ? await eventIdsInThread(event.channel, event.thread_ts)
      : [];
    if (existingIds.length) {
      if (ACK.test(text)) return;
      const { data } = await admin.from("week_events").select("*").in("id", existingIds);
      const rows = existingIds
        .map((id) => (data ?? []).find((r) => r.id === id))
        .filter((r): r is NonNullable<typeof r> => !!r);
      const cmd = parseThreadReply(text, dir, today);
      if (cmd.kind === "unknown" || !rows.length) {
        await reply(
          rows.length
            ? "I can change the time (“5pm”, “4-6”), day (“move to Fri”), who’s doing it (“Ashley”), or “cancel” — or tap *Edit*."
            : "Those events have already been removed.",
        );
        return;
      }

      const lines: string[] = [];
      const remaining = new Set(existingIds);
      const edited: { id: string; title: string }[] = [];
      for (const row of rows) {
        const owner = dir.people.find((p) => p.id === row.user_id)?.name;
        if (row.user_id !== userId) {
          lines.push(`🔒 Only ${owner ?? "the person who added it"} can change *${row.title}*.`);
          continue;
        }
        if (cmd.kind === "cancel") {
          await deleteWeekEvent(admin, row.id, row.google_event_id);
          remaining.delete(row.id);
          lines.push(`🗑️ Removed *${row.title}*`);
          continue;
        }
        const input = rowToInput(row);
        if (cmd.day) input.day = cmd.day;
        if (cmd.startTime) {
          input.endTime = cmd.endTime ?? shiftEnd(input.startTime, input.endTime, cmd.startTime);
          input.startTime = cmd.startTime;
        }
        if (cmd.helperId || cmd.assigneeUserId) {
          input.helperId = cmd.helperId;
          input.assigneeUserId = cmd.helperId ? null : cmd.assigneeUserId;
        }
        await updateWeekEvent(admin, row.id, input, row.google_event_id);
        edited.push({ id: row.id, title: input.title });
        lines.push(`✏️ Updated ${describe(dir, input)}`);
      }
      await postConfirmation({
        channel: event.channel,
        threadTs,
        lines,
        ids: [...remaining],
        editable: edited,
      });
      return;
    }

    // Otherwise it's a new event.
    const parsed = parseNewEvent(text, dir, today);
    if (!parsed.ok) {
      await reply(parsed.message);
      return;
    }
    const lines: string[] = [];
    const created: { id: string; title: string }[] = [];
    let lifeWarning = false;
    for (const ev of parsed.events) {
      const res = await createWeekEvent(admin, userId, ev);
      created.push({ id: res.id, title: ev.title });
      if (!res.lifeSynced) lifeWarning = true;
      lines.push(`✅ Added ${describe(dir, ev)}`);
    }
    if (lifeWarning) lines.push("_(Saved in the app, but the Life calendar sync failed.)_");
    await postConfirmation({
      channel: event.channel,
      threadTs,
      lines,
      ids: created.map((c) => c.id),
      undoIds: created.map((c) => c.id),
      editable: created,
    });
  } catch (e) {
    console.error("slack handleMessage failed", e);
    await reply(`⚠️ Something went wrong: ${(e as Error).message}`).catch(() => {});
  }
}
