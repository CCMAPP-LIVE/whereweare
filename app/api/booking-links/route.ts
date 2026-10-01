import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingTable, parseLinkInput } from "@/lib/booking";

/** Create a booking link for the signed-in user. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { input, error } = parseLinkInput(await request.json().catch(() => ({})));
  if (error) return NextResponse.json({ error }, { status: 400 });
  if (!input.calendar_account_id || !input.slug || !input.title)
    return NextResponse.json({ error: "Account, link name and title are required." }, { status: 400 });

  const admin = createAdminClient();

  // Invites can only be sent from one of YOUR connected Google accounts.
  const { data: account } = await admin
    .from("calendar_accounts")
    .select("id")
    .eq("id", input.calendar_account_id)
    .eq("user_id", user.id)
    .eq("provider", "google")
    .maybeSingle();
  if (!account)
    return NextResponse.json({ error: "Pick one of your connected Google accounts." }, { status: 400 });

  const { data, error: insErr } = await admin
    .from("booking_links")
    .insert({
      ...input,
      calendar_account_id: input.calendar_account_id,
      slug: input.slug,
      title: input.title,
      user_id: user.id,
    })
    .select("*")
    .single();
  if (insErr) {
    if (insErr.code === "23505")
      return NextResponse.json({ error: "That link name is taken — try another." }, { status: 409 });
    if (isMissingTable(insErr))
      return NextResponse.json({ error: "Booking tables aren't set up yet." }, { status: 503 });
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, link: data });
}
