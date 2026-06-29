import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Revoke an outstanding invite. Only the person who created it can revoke. */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const { error } = await supabase
    .from("invites")
    .delete()
    .eq("id", id)
    .eq("created_by", user.id)
    .is("used_by", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
