import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncDayToLifeCalendar } from "@/lib/google/lifeCalendar";

function cleanTime(t: unknown): string | null {
  return typeof t === "string" && /^\d{2}:\d{2}$/.test(t) ? t : null;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const day = String(body.day ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return NextResponse.json({ error: "invalid day" }, { status: 400 });
  }

  const { error } = await supabase.from("day_times").upsert(
    {
      user_id: user.id,
      day,
      leave_time: cleanTime(body.leaveTime),
      return_time: cleanTime(body.returnTime),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,day" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let lifeSynced = true;
  let warning: string | undefined;
  try {
    await syncDayToLifeCalendar(createAdminClient(), user.id, day);
  } catch (e) {
    lifeSynced = false;
    warning = (e as Error).message;
  }

  return NextResponse.json({ ok: true, lifeSynced, warning });
}
