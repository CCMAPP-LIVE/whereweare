import { format, parseISO } from "date-fns";
import type { Issue } from "@/lib/digest";

/** "Heads up" box on the calendar: gaps and clashes in the next 7 days. */
export default function HeadsUp({ issues }: { issues: Issue[] }) {
  if (!issues.length) return null;
  return (
    <details className="mx-auto mt-3 max-w-5xl px-3 sm:px-4" open={issues.length <= 3}>
      <summary className="cursor-pointer select-none rounded-xl bg-amber-100 px-3 py-2 text-sm font-medium text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
        ⚠️ Heads up — {issues.length} thing{issues.length > 1 ? "s" : ""} to sort this week
      </summary>
      <ul className="mt-1 space-y-1 rounded-xl border border-amber-200 px-3 py-2 text-sm dark:border-amber-900/60">
        {issues.map((i, n) => (
          <li key={n} className="flex gap-2">
            <span className="w-20 shrink-0 text-neutral-500">
              {format(parseISO(`${i.day}T12:00:00`), "EEE d MMM")}
            </span>
            <span>{i.text}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
