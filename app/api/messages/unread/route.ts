import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("messages")
    .select("day")
    .eq("recipient_id", user.id)
    .is("read_at", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byDay: Record<string, number> = {};
  for (const row of data ?? []) byDay[row.day] = (byDay[row.day] ?? 0) + 1;

  return NextResponse.json({ ok: true, total: data?.length ?? 0, byDay });
}
