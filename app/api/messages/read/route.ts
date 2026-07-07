import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const requestBody = await request.json().catch(() => ({}));
  const day = typeof requestBody.day === "string" ? requestBody.day : "";
  if (!DAY_RE.test(day)) return NextResponse.json({ error: "invalid day" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", user.id)
    .eq("day", day)
    .is("read_at", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
