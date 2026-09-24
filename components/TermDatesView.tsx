import type { TermRange } from "@/lib/termDates";
import { rangeLabel } from "@/lib/termDates";

/** Printable list of school holidays / INSET days. */
export default function TermDatesView({
  ranges,
  heading,
  footer,
}: {
  ranges: TermRange[];
  heading: string;
  footer: string;
}) {
  return (
    <article className="rounded-2xl border border-black/10 bg-white p-4 text-neutral-900 dark:border-white/10 print:rounded-none print:border-0 print:p-0">
      <h1 className="mb-3 border-b border-black/20 pb-2 text-lg font-bold">{heading}</h1>
      {ranges.length === 0 ? (
        <p className="text-sm text-neutral-500">
          No school days off found — import term dates in Settings → School term dates.
        </p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {ranges.map((r, i) => (
              <tr
                key={i}
                className="break-inside-avoid border-b border-black/10 align-top last:border-0"
              >
                <td className="py-1.5 pr-3 font-semibold">🏫 {r.title}</td>
                <td className="py-1.5 pr-3 text-neutral-600">{r.kids.join(" & ")}</td>
                <td className="whitespace-nowrap py-1.5 text-right tabular-nums">
                  {rangeLabel(r)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <footer className="mt-2 text-[10px] text-neutral-400">{footer}</footer>
    </article>
  );
}
