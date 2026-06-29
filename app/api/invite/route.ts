import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";

/** Create a single-use invite link (any signed-in member can invite). */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { note } = await request.json().catch(() => ({}));
  const code = randomUUID().replace(/-/g, "");

  const { error } = await supabase.from("invites").insert({
    code,
    note: note ? String(note).slice(0, 100) : null,
    created_by: user.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const origin = new URL(request.url).origin;
  return NextResponse.json({ code, link: `${origin}/join?code=${code}` });
}
