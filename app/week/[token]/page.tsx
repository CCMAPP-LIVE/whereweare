import type { Metadata } from "next";
import { addDays, format, parseISO } from "date-fns";
import { createAdminClient } from "@/lib/supabase/admin";
import { londonToday, weekStartOf } from "@/lib/time";
import { verifyShare } from "@/lib/shareLink";
import { buildWeekSheet } from "@/lib/weekSheet";
import WeekSheetView from "@/components/WeekSheetView";
import TermDatesView from "@/components/TermDatesView";
import { loadTermRanges, termWindow } from "@/lib/termDates";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Week ahead",
  robots: { index: false, follow: false },
};

/**
 * Public, read-only week sheet from a signed share link (no login) — for Joy,
 * grandparents etc. Always shows this week and next week as they are now.
 */
export default async function SharedWeekPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const share = verifyShare(token);
  if (!share) {
    return (
      <main className="mx-auto max-w-md p-6 text-center text-sm text-neutral-600">
        This link has expired or isn&apos;t valid. Ask for a new one.
      </main>
    );
  }

  const admin = createAdminClient();
  const thisWeek = weekStartOf(londonToday());
  const nextWeek = format(addDays(parseISO(`${thisWeek}T12:00:00`), 7), "yyyy-MM-dd");
  const include = new Set(share.include.filter((k) => k !== "calendars"));
  const win = termWindow(londonToday(), 120);
  const kidFilter = share.who.startsWith("k:") ? share.who.slice(2) : null;
  const [a, b, terms] = await Promise.all([
    buildWeekSheet(admin, { weekStart: thisWeek, who: share.who, include }),
    buildWeekSheet(admin, { weekStart: nextWeek, who: share.who, include }),
    include.has("school")
      ? loadTermRanges(admin, win.from, win.to, kidFilter)
      : Promise.resolve([]),
  ]);

  return (
    <main className="mx-auto max-w-3xl space-y-4 bg-white px-3 py-4 text-neutral-900 sm:px-4">
      <p className="text-xs text-neutral-500">
        Shared from Where We Are · always up to date · read only
      </p>
      <WeekSheetView sheet={a} footer={`Updated ${format(new Date(), "d MMM yyyy HH:mm")}`} />
      <WeekSheetView sheet={b} footer="" />
      {terms.length > 0 && (
        <TermDatesView
          ranges={terms}
          heading="School days off — next few months"
          footer="From the school calendar"
        />
      )}
    </main>
  );
}
