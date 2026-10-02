import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/env";
import { canSendInvites, isMissingTable } from "@/lib/booking";
import NavBar from "@/components/NavBar";
import { asLengthKind } from "@/lib/bookingLength";
import BookingsManager, {
  type ManagedAccount,
  type ManagedBooking,
  type ManagedLink,
} from "@/components/BookingsManager";

export const dynamic = "force-dynamic";

export default async function BookingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  // Your Google accounts, and whether each has granted invite permission.
  const { data: accountRows } = await admin
    .from("calendar_accounts")
    .select("id, account_email, logo_url")
    .eq("user_id", user.id)
    .eq("provider", "google")
    .order("created_at");
  const { data: tokenRows } = await admin
    .from("calendar_oauth_tokens")
    .select("calendar_account_id, refresh_token")
    .in(
      "calendar_account_id",
      (accountRows ?? []).map((a) => a.id),
    );
  const tokenOf = new Map((tokenRows ?? []).map((t) => [t.calendar_account_id, t.refresh_token]));
  const accounts: ManagedAccount[] = await Promise.all(
    (accountRows ?? []).map(async (a) => {
      const token = tokenOf.get(a.id);
      return {
        id: a.id,
        email: a.account_email ?? "Google account",
        logoUrl: a.logo_url,
        canInvite: token ? await canSendInvites(token) : false,
      };
    }),
  );

  const { data: linkRows, error: linkErr } = await admin
    .from("booking_links")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at");
  const setupNeeded = isMissingTable(linkErr);

  const links: ManagedLink[] = (linkRows ?? []).map((l) => ({
    id: l.id,
    calendarAccountId: l.calendar_account_id,
    slug: l.slug,
    title: l.title,
    description: l.description,
    hostName: l.host_name,
    durationMin: l.duration_min,
    lengthKind: asLengthKind(l.length_kind),
    weekdays: l.weekdays,
    dayStart: l.day_start.slice(0, 5),
    dayEnd: l.day_end.slice(0, 5),
    minNoticeHours: l.min_notice_hours,
    maxDaysAhead: l.max_days_ahead,
    bufferMin: l.buffer_min,
    addMeet: l.add_meet,
    inPerson: l.in_person,
    location: l.location,
    locationMode: l.location_mode === "client" ? "client" : "host",
    active: l.active,
  }));

  let bookings: ManagedBooking[] = [];
  if (links.length) {
    const { data: rows } = await admin
      .from("bookings")
      .select("id, link_id, start_at, end_at, guest_name, guest_email, notes, meet_url, guest_location")
      .eq("status", "confirmed")
      .in(
        "link_id",
        links.map((l) => l.id),
      )
      .gte("end_at", new Date().toISOString())
      .order("start_at");
    bookings = (rows ?? []).map((b) => ({
      id: b.id,
      linkId: b.link_id,
      start: b.start_at,
      end: b.end_at,
      guestName: b.guest_name,
      guestEmail: b.guest_email,
      notes: b.notes,
      meetUrl: b.meet_url,
      guestLocation: b.guest_location,
    }));
  }

  return (
    <>
      <NavBar />
      <BookingsManager
        // Customer-facing address for links, e.g. https://meyouwhen.com/brainshed.
        // Falls back to this app's own /book/ pages until the domain is live.
        bookingBase={process.env.BOOKING_BASE_URL?.replace(/\/+$/, "") || `${siteUrl()}/book`}
        accounts={accounts}
        initialLinks={links}
        bookings={bookings}
        setupNeeded={setupNeeded}
      />
    </>
  );
}
