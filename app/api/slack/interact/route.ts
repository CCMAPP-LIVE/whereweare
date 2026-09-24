import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { appUserForSlackUser, verifySlackRequest } from "@/lib/slack";
import { deleteWeekEvent } from "@/lib/weekEvents";

export const maxDuration = 30;

/** Slack interactivity endpoint — handles the "Undo" button on confirmations. */
export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifySlackRequest(request, raw))
    return NextResponse.json({ error: "bad signature" }, { status: 401 });

  const payload = JSON.parse(new URLSearchParams(raw).get("payload") ?? "{}");
  const action = payload.actions?.[0];
  if (payload.type !== "block_actions" || action?.action_id !== "undo_events")
    return new NextResponse(null, { status: 200 });

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

  try {
    const admin = createAdminClient();
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
      return new NextResponse(null, { status: 200 });
    }
    for (const r of mine) await deleteWeekEvent(admin, r.id, r.google_event_id);
    await respond(`↩️ Undone — removed ${mine.map((r) => `*${r.title}*`).join(", ")}.`, true);
  } catch (e) {
    await respond(`⚠️ Undo failed: ${(e as Error).message}`, false);
  }
  return new NextResponse(null, { status: 200 });
}
