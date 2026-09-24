import { format, parseISO } from "date-fns";
import type { Line, WeekSheet } from "@/lib/weekSheet";

/** The printable week sheet (used by /print and the shared /week link). */
export default function WeekSheetView({ sheet, footer }: { sheet: WeekSheet; footer: string }) {
  return (
    <article className="rounded-2xl border border-black/10 bg-white p-4 text-neutral-900 dark:border-white/10 print:rounded-none print:border-0 print:p-0">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 border-b border-black/20 pb-2">
        <h1 className="text-lg font-bold">Week ahead — {sheet.whoLabel}</h1>
        <span className="text-sm text-neutral-600">{sheet.weekLabel}</span>
      </header>

      {sheet.days.map((d) => {
        const v = sheet.byDay.get(d)!;
        const empty = !v.where.length && !v.school.length && !v.events.length && !v.other.length;
        return (
          <section
            key={d}
            className="break-inside-avoid border-b border-black/10 py-2 last:border-0"
          >
            <h2 className="text-sm font-bold">
              {format(parseISO(`${d}T12:00:00`), "EEEE d MMMM")}
            </h2>
            {empty && <p className="text-xs text-neutral-400">Nothing planned</p>}
            {v.where.length > 0 && (
              <p className="text-xs text-neutral-700">📍 {v.where.join("   ·   ")}</p>
            )}
            <Lines title="School" lines={v.school} />
            <Lines title="Plans" lines={v.events} />
            <Lines title="Other calendars" lines={v.other} />
          </section>
        );
      })}
      <footer className="mt-2 text-[10px] text-neutral-400">{footer}</footer>
    </article>
  );
}

function Lines({ title, lines }: { title: string; lines: Line[] }) {
  if (!lines.length) return null;
  return (
    <div className="mt-1">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
        {title}
      </div>
      <table className="w-full text-xs">
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="align-top">
              <td className="w-20 whitespace-nowrap py-0.5 pr-2 tabular-nums text-neutral-600">
                {l.time}
              </td>
              <td className="py-0.5">{l.text}</td>
              <td className="whitespace-nowrap py-0.5 pl-2 text-right font-semibold">{l.tag}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
