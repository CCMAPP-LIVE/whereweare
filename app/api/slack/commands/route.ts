import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { appUserForSlackUser, slackApi, verifySlackRequest } from "@/lib/slack";
import { eventModal, loadDirectory } from "@/lib/slackUi";

/** `/event` slash command — opens the add-event form. */
export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifySlackRequest(request, raw))
    return NextResponse.json({ error: "bad signature" }, { status: 401 });

  const params = new URLSearchParams(raw);
  const admin = createAdminClient();
  const appUser = await appUserForSlackUser(admin, params.get("user_id")!);
  if (!appUser.id) {
    return NextResponse.json({
      response_type: "ephemeral",
      text: `I don't recognise you yet — ask David to link your Slack ID \`${params.get("user_id")}\`.`,
    });
  }

  const dir = await loadDirectory(admin, appUser.id);
  // trigger_id is only valid for 3 seconds, so open the modal right away.
  await slackApi("views.open", {
    trigger_id: params.get("trigger_id"),
    view: eventModal(dir, {
      mode: "create",
      channel: params.get("channel_id")!,
      userId: params.get("user_id")!,
    }),
  });
  return new NextResponse(null, { status: 200 });
}
