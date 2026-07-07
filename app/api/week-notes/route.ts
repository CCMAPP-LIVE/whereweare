import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const NOTE_MAX = 4000;

export async function PUT(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const weekStart = typeof body.weekStart === "string" ? body.weekStart : "";
  const thisWeek: string | null =
    typeof body.thisWeek === "string" ? body.thisWeek.slice(0, NOTE_MAX) || null : null;
  const nextWeek: string | null =
    typeof body.nextWeek === "string" ? body.nextWeek.slice(0, NOTE_MAX) || null : null;

  if (!DAY_RE.test(weekStart))
    return NextResponse.json({ error: "invalid weekStart" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("week_notes").upsert(
    {
      user_id: user.id,
      week_start: weekStart,
      this_week_note: thisWeek,
      next_week_note: nextWeek,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,week_start" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
