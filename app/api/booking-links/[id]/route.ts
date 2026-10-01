import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseLinkInput } from "@/lib/booking";

type Params = { params: Promise<{ id: string }> };

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Update a booking link you own. Only fields present in the body change. */
export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { input, error } = parseLinkInput(await request.json().catch(() => ({})));
  if (error) return NextResponse.json({ error }, { status: 400 });

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("booking_links")
    .select("id, day_start, day_end")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const start = (input.day_start ?? existing.day_start).slice(0, 5);
  const end = (input.day_end ?? existing.day_end).slice(0, 5);
  if (start >= end)
    return NextResponse.json({ error: "The day must end after it starts." }, { status: 400 });

  if (input.calendar_account_id) {
    const { data: account } = await admin
      .from("calendar_accounts")
      .select("id")
      .eq("id", input.calendar_account_id)
      .eq("user_id", user.id)
      .eq("provider", "google")
      .maybeSingle();
    if (!account)
      return NextResponse.json({ error: "Pick one of your connected Google accounts." }, { status: 400 });
  }

  const { data, error: updErr } = await admin
    .from("booking_links")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .single();
  if (updErr) {
    if (updErr.code === "23505")
      return NextResponse.json({ error: "That link name is taken — try another." }, { status: 409 });
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, link: data });
}

/** Delete a booking link (its booking history goes with it). */
export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { error } = await admin
    .from("booking_links")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
