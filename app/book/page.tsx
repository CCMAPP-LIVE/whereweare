import type { Metadata } from "next";
import WaitlistForm from "@/components/WaitlistForm";

export const metadata: Metadata = {
  title: "MeYouWhen — one booking link for all your calendars",
  applicationName: "MeYouWhen",
  description:
    "One link that checks all your calendars, so people can book a time that really works. Invites come from your own email.",
  appleWebApp: { title: "MeYouWhen" },
};

const POINTS = [
  {
    title: "All your calendars, one link",
    body: "Connect every work and personal calendar. People only ever see times you're actually free.",
  },
  {
    title: "Invites from your own email",
    body: "Bookings arrive as a normal calendar invite from your business address, not ours.",
  },
  {
    title: "Meet, in person or at theirs",
    body: "Video call, your place, or theirs — with the address on the invite and a map link.",
  },
];

/**
 * Home page of the booking domain (meyouwhen.com), also shown for any path
 * on it that isn't a booking link: a short pitch plus the waiting list.
 */
export default function BookingHome() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col p-6 sm:py-12">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/meyouwhen-logo.svg" alt="MeYouWhen" className="h-10 w-auto self-start" />

      <h1 className="mt-8 text-3xl font-semibold leading-tight tracking-tight">
        Me, you… when?
        <br />
        <span className="text-teal-600">One link that finds the time.</span>
      </h1>
      <p className="mt-3 text-neutral-600 dark:text-neutral-300">
        Send one link. It checks all your calendars and lets people book a time that genuinely
        works — whole days, half days or a quick call.
      </p>

      <ul className="mt-6 space-y-3">
        {POINTS.map((p) => (
          <li key={p.title} className="flex gap-3">
            <span aria-hidden className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-teal-600" />
            <span>
              <span className="font-medium">{p.title}.</span>{" "}
              <span className="text-neutral-600 dark:text-neutral-300">{p.body}</span>
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-8">
        <WaitlistForm />
      </div>

      <p className="mt-6 text-xs text-neutral-400">
        Got a booking link? Open it directly to pick a time. ·{" "}
        <a href="/privacy" className="underline">
          Privacy
        </a>
      </p>
    </main>
  );
}
