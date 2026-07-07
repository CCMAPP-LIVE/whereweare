import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Set a user-facing label for one of the current user's calendars. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { calendarId, label } = await request.json().catch(() => ({}));
  if (!calendarId) {
    return NextResponse.json({ error: "missing calendarId" }, { status: 400 });
  }

  const trimmed = typeof label === "string" ? label.trim().slice(0, 100) : "";

  // RLS ensures the user can only update calendars under their own accounts.
  const { error } = await supabase
    .from("calendars")
    .update({ label: trimmed || null })
    .eq("id", calendarId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
