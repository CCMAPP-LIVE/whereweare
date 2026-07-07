import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

type Params = { params: Promise<{ weekStart: string }> };

export async function PUT(request: Request, { params }: Params) {
  const { weekStart } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!DAY_RE.test(weekStart))
    return NextResponse.json({ error: "invalid weekStart" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const isSchoolWeek = body.isSchoolWeek === false ? false : true;
  const notes: string | null =
    typeof body.notes === "string" ? body.notes.slice(0, 4000) || null : null;

  const admin = createAdminClient();
  const { error } = await admin.from("school_weeks").upsert(
    {
      week_start: weekStart,
      is_school_week: isSchoolWeek,
      notes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "week_start" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
