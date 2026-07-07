import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const NAME_MAX = 60;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim().slice(0, NAME_MAX) : "";
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const admin = createAdminClient();

  // Next sort_order = max + 1 (keeps whiteboard-style ordering).
  const { data: last } = await admin
    .from("kids")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (last?.sort_order ?? -1) + 1;

  const { data: inserted, error } = await admin
    .from("kids")
    .insert({ name, sort_order: nextOrder })
    .select("id, name, sort_order")
    .single();
  if (error || !inserted)
    return NextResponse.json({ error: error?.message ?? "insert failed" }, { status: 500 });

  return NextResponse.json({ ok: true, kid: inserted });
}
