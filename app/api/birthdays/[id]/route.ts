import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const NAME_MAX = 80;
const NOTES_MAX = 500;

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const name =
    typeof body.name === "string" ? body.name.trim().slice(0, NAME_MAX) : "";
  const month = Number(body.month);
  const day = Number(body.day);
  const yearRaw = body.year;
  const year =
    yearRaw === null || yearRaw === "" || yearRaw === undefined
      ? null
      : Number(yearRaw);
  const notes =
    typeof body.notes === "string"
      ? body.notes.trim().slice(0, NOTES_MAX) || null
      : null;

  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (!Number.isInteger(month) || month < 1 || month > 12)
    return NextResponse.json({ error: "invalid month" }, { status: 400 });
  if (!Number.isInteger(day) || day < 1 || day > 31)
    return NextResponse.json({ error: "invalid day" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin
    .from("birthdays")
    .update({
      name,
      month,
      day,
      year:
        year === null
          ? null
          : Number.isInteger(year) && year >= 1900 && year <= 3000
            ? year
            : null,
      notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { error } = await admin.from("birthdays").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
