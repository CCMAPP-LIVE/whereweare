import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Disconnect a connected calendar account (cascades its calendars + token). */
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
  // RLS also restricts to own rows; the explicit user_id filter is belt-and-braces.
  const { error } = await supabase
    .from("calendar_accounts")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
