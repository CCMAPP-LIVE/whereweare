import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadDirectory } from "@/lib/slackUi";
import { apply, preview, undo, type Overrides } from "@/lib/quickAssistant";
import { londonToday } from "@/lib/time";

export const maxDuration = 60;

/**
 * In-app assistant (the floating "+ Add" button). Same house rules as the
 * Slack bot. action "preview" shows what would happen (add / change /
 * answer); "save" re-parses the text on the server and applies it; DELETE
 * undoes using the snapshot returned by save.
 */

async function currentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Names for the preview's fix-up chips. */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const dir = await loadDirectory(createAdminClient(), user.id);
  return NextResponse.json({
    currentUserId: user.id,
    people: dir.people,
    helpers: dir.helpers,
    kids: dir.kids,
  });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 1000) : "";
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });
  const overrides: Overrides | undefined =
    body.overrides && typeof body.overrides === "object" ? body.overrides : undefined;

  const admin = createAdminClient();
  const dir = await loadDirectory(admin, user.id);
  const today = londonToday();

  if (body.action === "save") {
    try {
      return NextResponse.json(await apply(admin, text, dir, today, overrides));
    } catch (e) {
      return NextResponse.json({ ok: false, message: (e as Error).message }, { status: 500 });
    }
  }
  return NextResponse.json(await preview(admin, text, dir, today, overrides));
}

export async function DELETE(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  await undo(createAdminClient(), user.id, body ?? {});
  return NextResponse.json({ ok: true });
}
