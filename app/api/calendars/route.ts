import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAccountsWithCalendars,
  refreshCalendarsForUser,
} from "@/lib/calendars";

/** List the current user's connected accounts and their calendars. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  await refreshCalendarsForUser(admin, user.id).catch(() => {});
  const accounts = await getAccountsWithCalendars(admin, user.id);

  return NextResponse.json({ accounts });
}

/** Toggle whether a calendar is included in the views. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { calendarId, enabled } = await request.json().catch(() => ({}));
  if (!calendarId) {
    return NextResponse.json({ error: "missing calendarId" }, { status: 400 });
  }

  // RLS ensures the user can only update calendars under their own accounts.
  const { error } = await supabase
    .from("calendars")
    .update({ enabled: Boolean(enabled) })
    .eq("id", calendarId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
