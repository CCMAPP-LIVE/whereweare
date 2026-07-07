import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Update a user-facing label and/or the shown-in-week-view flag for one of the current user's calendars. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { calendarId } = body;
  if (!calendarId) {
    return NextResponse.json({ error: "missing calendarId" }, { status: 400 });
  }

  const update: { label?: string | null; enabled?: boolean } = {};
  if ("label" in body) {
    const trimmed = typeof body.label === "string" ? body.label.trim().slice(0, 100) : "";
    update.label = trimmed || null;
  }
  if ("enabled" in body) {
    update.enabled = Boolean(body.enabled);
  }

  // RLS ensures the user can only update calendars under their own accounts.
  const { error } = await supabase.from("calendars").update(update).eq("id", calendarId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
