import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MeYouWhen",
  applicationName: "MeYouWhen",
  description: "Pick a time that suits you.",
  appleWebApp: { title: "MeYouWhen" },
  robots: { index: false, follow: false },
};

/**
 * Landing page for the booking domain (meyouwhen.com) and any path on it that
 * isn't a booking link. Deliberately says nothing about who uses it.
 */
export default function BookingHome() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center p-6 text-center">
      <h1 className="text-2xl font-semibold">MeYouWhen</h1>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
        Pick a time that suits you. Use the booking link you were sent to see available times.
      </p>
    </main>
  );
}
