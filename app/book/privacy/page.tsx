import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy — MeYouWhen",
  applicationName: "MeYouWhen",
  description: "How MeYouWhen handles your information.",
  appleWebApp: { title: "MeYouWhen" },
};

const CONTACT = "david@meyouwhen.com";

/** Plain-English privacy notice for the waiting list and booking pages. */
export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 space-y-4 p-6 text-sm leading-relaxed text-neutral-700 sm:py-12 dark:text-neutral-200">
      <Link href="/" aria-label="MeYouWhen home">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/meyouwhen-logo.svg" alt="MeYouWhen" className="h-8 w-auto" />
      </Link>
      <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">Privacy</h1>
      <p>
        This notice explains what MeYouWhen collects and why. Questions or requests:{" "}
        <a className="underline" href={`mailto:${CONTACT}`}>
          {CONTACT}
        </a>
        .
      </p>

      <h2 className="pt-2 text-base font-semibold text-neutral-900 dark:text-neutral-50">Waiting list</h2>
      <p>
        If you join the waiting list we keep your email address, and your name and note if you give
        them. We use them only to tell you about MeYouWhen and to understand what people want from
        it. We never sell or share them. You can ask us to remove you at any time and we&apos;ll
        delete your details.
      </p>

      <h2 className="pt-2 text-base font-semibold text-neutral-900 dark:text-neutral-50">Booking a time</h2>
      <p>
        When you book through a MeYouWhen link, the details you enter (name, email, any address and
        notes) are passed to the person you&apos;re booking with so they can send you a calendar
        invite and hold the meeting. Booking pages only ever show free times — never what is in
        anyone&apos;s calendar.
      </p>

      <h2 className="pt-2 text-base font-semibold text-neutral-900 dark:text-neutral-50">Where it&apos;s kept</h2>
      <p>
        Information is stored securely with our hosting and database providers in the UK/EU, and
        emails are sent through an email delivery service. We keep waiting-list details until
        MeYouWhen launches or you ask us to remove them, whichever comes first.
      </p>

      <h2 className="pt-2 text-base font-semibold text-neutral-900 dark:text-neutral-50">Your rights</h2>
      <p>
        Under UK data protection law you can ask to see, correct or delete your information, or
        object to how it&apos;s used. Email{" "}
        <a className="underline" href={`mailto:${CONTACT}`}>
          {CONTACT}
        </a>
        . You can also complain to the Information Commissioner&apos;s Office (ico.org.uk).
      </p>
    </main>
  );
}
