import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push/send";
import { isRealUkPostcode, normaliseUkPostcode } from "@/lib/postcode";
import {
  busyForUser,
  computeSlots,
  createBookingEvent,
  hostAccountFor,
  linkDurationMin,
} from "@/lib/booking";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Params = { params: Promise<{ slug: string }> };

/**
 * Public: book a slot on a booking link. No login — the visitor is whoever
 * you sent the link to. Everything is re-validated server-side against the
 * link's rules and live free/busy, so a stale page can't double-book.
 */
export async function POST(request: Request, { params }: Params) {
  const { slug } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  // Honeypot: real visitors never see or fill this field.
  if (typeof body.website === "string" && body.website.trim() !== "")
    return NextResponse.json({ error: "Could not book." }, { status: 400 });

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 200) : "";
  const notes =
    typeof body.notes === "string" ? body.notes.trim().slice(0, 1000) || null : null;
  // Structured address for in-person-at-client meetings: line 1, optional
  // line 2, town and a UK postcode, joined into one invite location.
  const addr = (body.address ?? {}) as Record<string, unknown>;
  const field = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const addrLine1 = field(addr.line1, 120);
  const addrLine2 = field(addr.line2, 120);
  const addrTown = field(addr.town, 80);
  const addrPostcode = normaliseUkPostcode(field(addr.postcode, 12));
  const startMs = typeof body.start === "string" ? Date.parse(body.start) : NaN;

  if (!name) return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
  if (!EMAIL_RE.test(email))
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  if (Number.isNaN(startMs))
    return NextResponse.json({ error: "Please pick a time." }, { status: 400 });

  const admin = createAdminClient();
  const { data: link } = await admin
    .from("booking_links")
    .select("*")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();
  if (!link) return NextResponse.json({ error: "This booking link isn't available." }, { status: 404 });

  // In person at the client's location: they must tell us where.
  const atClient = link.in_person && link.location_mode === "client";
  let guestLocation: string | null = null;
  if (atClient) {
    if (addrLine1.length < 3)
      return NextResponse.json({ error: "Please enter the first line of the address." }, { status: 400 });
    if (addrTown.length < 2)
      return NextResponse.json({ error: "Please enter the town or city." }, { status: 400 });
    if (!addrPostcode || !(await isRealUkPostcode(addrPostcode)))
      return NextResponse.json(
        { error: "That postcode doesn't look right. Please check it." },
        { status: 400 },
      );
    guestLocation = [addrLine1, addrLine2, addrTown, addrPostcode].filter(Boolean).join(", ");
  }

  const host = await hostAccountFor(admin, link);
  if (!host)
    return NextResponse.json(
      { error: "Bookings are paused on this link. Please get in touch directly." },
      { status: 503 },
    );

  const durMs = linkDurationMin(link) * 60_000;
  const startIso = new Date(startMs).toISOString();
  const endIso = new Date(startMs + durMs).toISOString();
  const pad = (link.buffer_min + 1) * 60_000;

  // Is this start still a valid, free slot under the link's rules?
  let busy;
  try {
    busy = await busyForUser(
      admin,
      link.user_id,
      link.calendar_account_id,
      new Date(startMs - pad).toISOString(),
      new Date(startMs + durMs + pad).toISOString(),
    );
  } catch {
    return NextResponse.json(
      { error: "Couldn't check availability just now. Please try again in a moment." },
      { status: 503 },
    );
  }
  if (!computeSlots(link, busy, Date.now()).includes(startIso))
    return NextResponse.json(
      { error: "Sorry, that time has just been taken. Please pick another.", taken: true },
      { status: 409 },
    );

  // Claim the slot first; the unique index stops two visitors racing for it.
  const { data: booking, error: claimErr } = await admin
    .from("bookings")
    .insert({
      link_id: link.id,
      start_at: startIso,
      end_at: endIso,
      guest_name: name,
      guest_email: email,
      notes,
      guest_location: atClient ? guestLocation : null,
    })
    .select("id")
    .single();
  if (claimErr || !booking) {
    const taken = claimErr?.code === "23505";
    return NextResponse.json(
      {
        error: taken
          ? "Sorry, that time has just been taken. Please pick another."
          : "Couldn't book that time. Please try again.",
        taken,
      },
      { status: taken ? 409 : 500 },
    );
  }

  try {
    const { eventId, meetUrl } = await createBookingEvent({
      refreshToken: host.refreshToken,
      link,
      startIso,
      endIso,
      guestName: name,
      guestEmail: email,
      notes,
      location: atClient ? guestLocation : null,
      requestId: booking.id,
    });
    await admin
      .from("bookings")
      .update({ google_event_id: eventId, meet_url: meetUrl })
      .eq("id", booking.id);

    // Tell the link's owner straight away (phone/desktop push). Best-effort:
    // a notification failure must never undo a confirmed booking.
    try {
      const when = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/London",
        weekday: "short",
        day: "numeric",
        month: "short",
      }).format(new Date(startIso));
      const hm = (iso: string) =>
        new Intl.DateTimeFormat("en-GB", {
          timeZone: "Europe/London",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(iso));
      await sendPushToUser(admin, link.user_id, {
        title: `New booking: ${name}`,
        body: `${link.title} — ${when}, ${hm(startIso)}–${hm(endIso)}${
          atClient && guestLocation ? ` · ${guestLocation}` : ""
        }`,
        url: "/bookings",
      });
    } catch {
      // ignore
    }
    return NextResponse.json({
      ok: true,
      start: startIso,
      end: endIso,
      meetUrl,
      hostEmail: host.email,
      location: link.in_person ? (atClient ? guestLocation : link.location) : null,
    });
  } catch {
    // Release the slot so the failure doesn't leave a ghost booking.
    await admin.from("bookings").delete().eq("id", booking.id);
    return NextResponse.json(
      { error: "Couldn't send the calendar invite. Please try again, or get in touch directly." },
      { status: 502 },
    );
  }
}
