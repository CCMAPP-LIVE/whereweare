import { after, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { appUserForSlackUser, slackApi, verifySlackRequest } from "@/lib/slack";
import {
  describe,
  eventModal,
  loadDirectory,
  postConfirmation,
  readModal,
  rowToInput,
  type ModalMeta,
} from "@/lib/slackUi";
import { createWeekEvent, deleteWeekEvent, updateWeekEvent } from "@/lib/weekEvents";

export const maxDuration = 60;

const ok = () => new NextResponse(null, { status: 200 });

/**
 * Slack interactivity endpoint: Undo / Edit buttons on confirmations, and
 * submissions of the add/edit event modal.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifySlackRequest(request, raw))
    return NextResponse.json({ error: "bad signature" }, { status: 401 });

  const payload = JSON.parse(new URLSearchParams(raw).get("payload") ?? "{}");
  const admin = createAdminClient();

  if (payload.type === "block_actions") {
    const action = payload.actions?.[0];
    const respond = (text: string, replaceOriginal: boolean) =>
      fetch(payload.response_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          replaceOriginal
            ? { replace_original: true, text }
            : { response_type: "ephemeral", replace_original: false, text },
        ),
      });

    // Edit → open the modal pre-filled (must happen within 3s of the click).
    if (action?.action_id?.startsWith("edit_event:")) {
      const appUser = await appUserForSlackUser(admin, payload.user.id);
      const { data: row } = await admin
        .from("week_events")
        .select("*")
        .eq("id", action.value)
        .maybeSingle();
      if (!row) {
        await respond("That event has been removed.", false);
        return ok();
      }
      if (!appUser.id || row.user_id !== appUser.id) {
        await respond("Only the person who added this can edit it.", false);
        return ok();
      }
      const dir = await loadDirectory(admin, appUser.id);
      await slackApi("views.open", {
        trigger_id: payload.trigger_id,
        view: eventModal(
          dir,
          {
            mode: "edit",
            channel: payload.channel.id,
            threadTs: payload.message?.thread_ts ?? payload.message?.ts,
            eventId: row.id,
          },
          rowToInput(row),
        ),
      });
      return ok();
    }

    if (action?.action_id === "undo_events") {
      try {
        const appUser = await appUserForSlackUser(admin, payload.user.id);
        const ids: string[] = JSON.parse(action.value);
        const { data: rows } = await admin
          .from("week_events")
          .select("id, user_id, title, google_event_id")
          .in("id", ids);
        const mine = (rows ?? []).filter((r) => r.user_id === appUser.id);
        if (!mine.length) {
          await respond(
            rows?.length ? "Only the person who added this can undo it." : "Already removed.",
            false,
          );
          return ok();
        }
        for (const r of mine) await deleteWeekEvent(admin, r.id, r.google_event_id);
        await respond(`↩️ Undone — removed ${mine.map((r) => `*${r.title}*`).join(", ")}.`, true);
      } catch (e) {
        await respond(`⚠️ Undo failed: ${(e as Error).message}`, false);
      }
    }
    return ok();
  }

  if (payload.type === "view_submission" && payload.view?.callback_id === "event_modal") {
    const result = readModal(payload.view.state.values);
    if ("errors" in result) {
      return NextResponse.json({ response_action: "errors", errors: result.errors });
    }
    const meta: ModalMeta = JSON.parse(payload.view.private_metadata);
    const slackUserId: string = payload.user.id;
    // Close the modal now; save + sync + confirm in the background.
    after(() => saveFromModal(meta, slackUserId, result.input));
    return ok();
  }

  return ok();
}

async function saveFromModal(
  meta: ModalMeta,
  slackUserId: string,
  input: Parameters<typeof createWeekEvent>[2],
) {
  const admin = createAdminClient();
  const dm = (text: string) =>
    slackApi("chat.postMessage", { channel: slackUserId, text }).catch(() => {});
  try {
    const appUser = await appUserForSlackUser(admin, slackUserId);
    if (!appUser.id) return;
    const dir = await loadDirectory(admin, appUser.id);

    if (meta.mode === "create") {
      const res = await createWeekEvent(admin, appUser.id, input);
      const lines = [`✅ Added ${describe(dir, input)}`];
      if (!res.lifeSynced) lines.push("_(Saved in the app, but the Life calendar sync failed.)_");
      const confirm = (channel: string) =>
        postConfirmation({
          channel,
          lines,
          ids: [res.id],
          undoIds: [res.id],
          editable: [{ id: res.id, title: input.title }],
        });
      // The bot may not be in the channel /event was used from — fall back to a DM.
      await confirm(meta.channel).catch(() => confirm(slackUserId));
      return;
    }

    const { data: row } = await admin
      .from("week_events")
      .select("id, user_id, google_event_id")
      .eq("id", meta.eventId)
      .maybeSingle();
    if (!row || row.user_id !== appUser.id) {
      await dm("That event has been removed or isn't yours to edit.");
      return;
    }
    await updateWeekEvent(admin, row.id, input, row.google_event_id);
    await postConfirmation({
      channel: meta.channel,
      threadTs: meta.threadTs,
      lines: [`✏️ Updated ${describe(dir, input)}`],
      ids: [row.id],
      editable: [{ id: row.id, title: input.title }],
    }).catch(() => dm(`✏️ Updated ${describe(dir, input)}`));
  } catch (e) {
    console.error("slack saveFromModal failed", e);
    await dm(`⚠️ Couldn't save that event: ${(e as Error).message}`);
  }
}
