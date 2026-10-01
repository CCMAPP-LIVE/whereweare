import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cancelBookingEvent, hostAccountFor } from "@/lib/booking";

type Params = { params: Promise<{ id: string }> };

/** Cancel a booking on one of your links; Google emails the guest. */
export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("id, link_id, google_event_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!booking) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data: link } = await admin
    .from("booking_links")
    .select("user_id, calendar_account_id")
    .eq("id", booking.link_id)
    .maybeSingle();
  if (!link || link.user_id !== user.id)
    return NextResponse.json({ error: "not found" }, { status: 404 });

  if (booking.google_event_id) {
    const host = await hostAccountFor(admin, link);
    if (host) {
      try {
        await cancelBookingEvent(host.refreshToken, booking.google_event_id);
      } catch {
        // Already deleted in Google, or access revoked — still free the slot.
      }
    }
  }

  const { error } = await admin.from("bookings").update({ status: "cancelled" }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
