import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const NAME_MAX = 80;
const NOTES_MAX = 500;

function parsePayload(body: unknown): {
  name: string;
  month: number | null;
  day: number | null;
  year: number | null;
  notes: string | null;
} {
  const b = (body ?? {}) as Record<string, unknown>;
  const name =
    typeof b.name === "string" ? b.name.trim().slice(0, NAME_MAX) : "";
  const month = Number(b.month);
  const day = Number(b.day);
  const yearRaw = b.year;
  const year =
    yearRaw === null || yearRaw === "" || yearRaw === undefined
      ? null
      : Number(yearRaw);
  const notes =
    typeof b.notes === "string" ? b.notes.trim().slice(0, NOTES_MAX) || null : null;
  return {
    name,
    month: Number.isInteger(month) && month >= 1 && month <= 12 ? month : null,
    day: Number.isInteger(day) && day >= 1 && day <= 31 ? day : null,
    year: year === null ? null : Number.isInteger(year) && year >= 1900 && year <= 3000 ? year : null,
    notes,
  };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { name, month, day, year, notes } = parsePayload(body);
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (month === null || day === null)
    return NextResponse.json({ error: "invalid month/day" }, { status: 400 });

  const admin = createAdminClient();

  // sort_order = max + 1 so newest lands last; the /birthdays page reorders by
  // days-until-next-birthday at render time anyway, but keeping a stable
  // insertion order helps ties.
  const { data: last } = await admin
    .from("birthdays")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (last?.sort_order ?? -1) + 1;

  const { data: inserted, error } = await admin
    .from("birthdays")
    .insert({
      name,
      month,
      day,
      year,
      notes,
      sort_order: nextOrder,
    })
    .select("id, name, month, day, year, notes")
    .single();
  if (error || !inserted)
    return NextResponse.json({ error: error?.message ?? "insert failed" }, { status: 500 });

  return NextResponse.json({ ok: true, birthday: inserted });
}
