import { redirect } from "next/navigation";
import { addDays, format, parseISO } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { londonToday, normalizeAnchor, weekStartOf } from "@/lib/time";
import { buildWeekSheet, INCLUDE_KEYS, weekSheetText, type IncludeKey } from "@/lib/weekSheet";
import NavBar from "@/components/NavBar";
import PrintControls from "@/components/PrintControls";
import WeekSheetView from "@/components/WeekSheetView";
import TermDatesView from "@/components/TermDatesView";
import { loadTermRanges, termText, termWindow } from "@/lib/termDates";

export const dynamic = "force-dynamic";

/**
 * Printable / shareable week sheet: pick a week, who, and what to include;
 * print via the phone's print sheet (AirPrint / Save as PDF) or share as a
 * WhatsApp message or a read-only link.
 */
export default async function PrintPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const today = londonToday();
  const weekStart = weekStartOf(normalizeAnchor(str("week") ?? today));
  const who = str("who") ?? "all"; // "all" | "p:<id>" | "k:<id>"
  const include = new Set<IncludeKey>(
    str("include") !== undefined
      ? (str("include")!
          .split(",")
          .filter((x) => (INCLUDE_KEYS as readonly string[]).includes(x)) as IncludeKey[])
      : ["school", "events", "where"],
  );

  const view = str("view") === "terms" ? "terms" : "week";
  const kidFilter = who.startsWith("k:") ? who.slice(2) : null;
  const win = termWindow(today);
  const [sheet, terms] = await Promise.all([
    buildWeekSheet(supabase, { weekStart, who, include }),
    view === "terms" ? loadTermRanges(supabase, win.from, win.to, kidFilter) : Promise.resolve([]),
  ]);
  const termHeading = `School days off${kidFilter ? ` — ${sheet.whoLabel}` : ""}`;
  const thisWeek = weekStartOf(today);
  const nextWeek = format(addDays(parseISO(`${thisWeek}T12:00:00`), 7), "yyyy-MM-dd");

  return (
    <>
      <NavBar />
      <main className="mx-auto max-w-3xl px-3 py-4 sm:px-4 print:max-w-none print:p-0">
        <PrintControls
          week={weekStart}
          thisWeek={thisWeek}
          nextWeek={nextWeek}
          who={who}
          include={[...include]}
          people={sheet.people}
          kids={sheet.kids}
          view={view}
          shareText={view === "terms" ? termText(terms, termHeading) : weekSheetText(sheet)}
        />
        {view === "terms" ? (
          <TermDatesView
            ranges={terms}
            heading={termHeading}
            footer={`Where We Are · from the school calendar · printed ${format(new Date(), "d MMM yyyy")}`}
          />
        ) : (
          <WeekSheetView
            sheet={sheet}
            footer={`Where We Are · printed ${format(new Date(), "d MMM yyyy")}`}
          />
        )}
      </main>
    </>
  );
}
