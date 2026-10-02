import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  freeSlotsForLink,
  hostAccountFor,
  linkDurationMin,
  linkLengthLabel,
} from "@/lib/booking";
import BookingPicker from "@/components/BookingPicker";
import { asLengthKind } from "@/lib/bookingLength";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

async function loadLink(slug: string) {
  const admin = createAdminClient();
  const { data: link } = await admin
    .from("booking_links")
    .select("*")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();
  return { admin, link };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const { link } = await loadLink(slug);
  return {
    title: link ? `Book: ${link.title}` : "Booking",
    applicationName: "MeYouWhen",
    description: "Pick a time that suits you.",
    appleWebApp: { title: "MeYouWhen" },
    robots: { index: false, follow: false },
  };
}

/**
 * Public "pick a time" page (no login). Shows only free start times — never
 * what's on anyone's calendar — and books through /api/book/[slug].
 */
export default async function BookPage({ params }: Params) {
  const { slug } = await params;
  const { admin, link } = await loadLink(slug);

  if (!link) {
    return (
      <main className="mx-auto max-w-md p-6 text-center text-sm text-neutral-600">
        This booking link isn&apos;t available. Please get in touch directly.
      </main>
    );
  }

  const host = await hostAccountFor(admin, link);
  const { data: profile } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", link.user_id)
    .maybeSingle();
  const hostName = link.host_name?.trim() || profile?.display_name?.trim() || "";

  let slots: string[] = [];
  let unavailable = !host;
  if (host) {
    try {
      slots = await freeSlotsForLink(admin, link);
    } catch {
      unavailable = true;
    }
  }

  return (
    <BookingPicker
      slug={link.slug}
      title={link.title}
      description={link.description}
      hostName={hostName}
      hostEmail={host?.email ?? null}
      logoUrl={host?.logoUrl ?? null}
      lengthLabel={linkLengthLabel(link)}
      durationMin={linkDurationMin(link)}
      lengthKind={asLengthKind(link.length_kind)}
      dayStartHm={link.day_start.slice(0, 5)}
      addMeet={link.add_meet}
      inPerson={link.in_person}
      location={link.in_person ? link.location : null}
      slots={slots}
      unavailable={unavailable}
    />
  );
}
