import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Open = anything not yet done, i.e. the work still outstanding. Used for the
// nav badge so you can see at a glance how much is on the shared list.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { count, error } = await supabase
    .from("todos")
    .select("id", { count: "exact", head: true })
    .in("status", ["todo", "doing"]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, open: count ?? 0 });
}
