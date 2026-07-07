import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const TIME_RE = /^\d{2}:\d{2}$/;

/**
 * Upsert one row of the school-routine template. Keyed by (kid_id, weekday,
 * kind) — sending the same combo overwrites time / assignee / active.
 */
export async function PUT(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const kidId = typeof body.kidId === "string" ? body.kidId : "";
  const weekday = Number(body.weekday);
  const kind = typeof body.kind === "string" ? body.kind : "";
  const time = typeof body.time === "string" ? body.time : "";
  const assigneeUserId: string | null =
    typeof body.assigneeUserId === "string" && body.assigneeUserId !== ""
      ? body.assigneeUserId
      : null;
  const active = body.active !== false;

  if (!kidId) return NextResponse.json({ error: "kidId required" }, { status: 400 });
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6)
    return NextResponse.json({ error: "invalid weekday" }, { status: 400 });
  if (kind !== "drop" && kind !== "pickup")
    return NextResponse.json({ error: "invalid kind" }, { status: 400 });
  if (!TIME_RE.test(time))
    return NextResponse.json({ error: "invalid time" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("school_defaults").upsert(
    {
      kid_id: kidId,
      weekday,
      kind,
      time,
      default_assignee_user_id: assigneeUserId,
      active,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "kid_id,weekday,kind" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

/**
 * Remove a template row entirely (e.g. this kid has no Friday pickup).
 * The (kid_id, weekday, kind) triple is passed in the query string:
 *   DELETE /api/school-defaults?kidId=...&weekday=0&kind=drop
 */
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const kidId = url.searchParams.get("kidId") ?? "";
  const weekday = Number(url.searchParams.get("weekday"));
  const kind = url.searchParams.get("kind") ?? "";
  if (!kidId || !Number.isInteger(weekday) || (kind !== "drop" && kind !== "pickup"))
    return NextResponse.json({ error: "invalid params" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin
    .from("school_defaults")
    .delete()
    .eq("kid_id", kidId)
    .eq("weekday", weekday)
    .eq("kind", kind);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
