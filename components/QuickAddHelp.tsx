/**
 * The quick-add rules, shown from the "?" in the Quick add panel. Keep in step
 * with lib/quickAdd.ts / lib/quickAssistant.ts (and the PDF in public/).
 */

type Row = [string, string];

const SECTIONS: {
  title: string;
  intro?: string;
  rows?: Row[];
  bullets?: string[];
  tryable?: boolean;
}[] = [
  {
    title: "Adding an event",
    tryable: true,
    intro: "Write what · who · day · time · where, in any order. Check the preview, then Add.",
    rows: [
      ["Percy swimming Thu 4-5", "Swimming · Percy · Thu 16:00–17:00 · you"],
      ["Beavers meeting Mon 7pm at scout hut", "Beavers meeting at scout hut · Mon 19:00–20:00"],
      ["Dentist Bernie 14 Oct half 3", "Dentist · Bernie · 14 Oct 15:30–16:30"],
      ["Ashley drop Percy tomorrow 8:45", "Drop-off · Percy · 08:45 · Ashley"],
      ["Legoland all day Sat for the family", "All day · Bernie & Percy · David & Ashley"],
      ["Beavers camp Sat 6pm to Sun 9am", "Sat 18:00 → Sun 09:00 (one entry per day)"],
      ["Bernie football every Saturday 10am", "Weekly for 8 weeks"],
      [
        "Remind Percy PE kit every Tuesday",
        "🔔 PE kit on Tuesdays (all day) — in the 7pm summary the night before",
      ],
    ],
  },
  {
    title: "Who it's for",
    rows: [
      ["Nobody named", "You (whoever added it)"],
      ["Ashley · Joy", "They're doing it"],
      ["both of us · us · we · me and Ashley", "David & Ashley, no kids"],
      ["the family · all of us · everyone", "David & Ashley + Bernie & Percy"],
      ["A kid's name", "Tags that kid"],
    ],
    bullets: ["Got it wrong? Tap the Who and Kids chips on the preview to fix it before adding."],
  },
  {
    title: "Days",
    bullets: [
      "today, tomorrow, Mon…Sun (the next one, today included)",
      "next Tues (next week's), Friday week, the Saturday after next",
      "in 3 days, in 2 weeks, a week tomorrow",
      "14 Oct, Oct 14, 14th October, 4/10 (day/month)",
      "Always include a day, or it will ask.",
    ],
  },
  {
    title: "Times",
    bullets: [
      "3pm, 8:45, 4-5, 2-4pm, 9 to 11, half 4, quarter past 3, quarter to 5, noon, all day",
      "A plain 7–11 is morning; a plain 12–6 is afternoon. For evenings say 7pm or tonight.",
      "Dinner, drinks, pub, cinema, theatre, show, concert, bedtime, sleepover or “evening” make a plain time pm (“Dinner Fri 7.30” = 19:30). Breakfast / brunch keep it am.",
      "Spoken or typed 730, 7 30, 7.30, 7:30 and 19:30 all work.",
      "Wrong am/pm? Tap the am / pm chip on the preview.",
      "No end time → 1 hour. Start and finish on different days → one entry per day.",
    ],
  },
  {
    title: "Repeats",
    bullets: [
      "every Tuesday · Tuesdays · every other Friday · fortnightly",
      "for 6 weeks · until 15 Dec · until Christmas — otherwise 8 weeks",
    ],
  },
  {
    title: "Changing an event",
    tryable: true,
    rows: [
      ["move swimming to Friday", "Moves it (a weekly series moves together)"],
      ["make swimming 5pm", "New time"],
      ["change swimming to Ashley", "New person"],
      ["rename swimming to Swim club", "New name"],
      [
        "delete Legoland · cancel swimming on 6 Oct",
        "Deletes it (one day, or all upcoming) — asks you to confirm first",
      ],
    ],
    bullets: [
      "Shows before → after; press Change or Remove. Deleting always asks “Are you sure?” first, and Undo puts it back.",
      "“Friday” means the Friday in that event's own week. Only the person who added it can change it.",
    ],
  },
  {
    title: "Asking",
    tryable: true,
    rows: [
      ["what's on tomorrow?", "Everything tomorrow, incl. school runs"],
      ["what's on this week?", "Also: next week, at the weekend"],
      ["who's doing pickup Friday?", "Just the school runs"],
      ["what's Percy doing Saturday?", "Just Percy's things"],
    ],
  },
  {
    title: "Handy extras",
    bullets: [
      "🎤 Speak it — “Percy swimming Thursday four till five” works.",
      "📋 Paste a school email or message; it picks the sentence with a date.",
      "Recent phrases appear as one-tap chips.",
      "On Android, Share → Where We Are opens this pre-filled.",
      "On the Calendar page, tap an event you added to delete it or edit it in Plan.",
      "7pm every evening: a notification with tomorrow's runs, plans, 🔔 reminders and anything that needs sorting. Sundays: the week-ahead sheet.",
      "⚠️ Heads up at the top of the Calendar flags nobody on a school run, or someone away but down for something.",
      "🖨 Print (menu): print the week, save a PDF, send it as a WhatsApp message, or share a live read-only link with Joy or grandparents.",
    ],
  },
];

export default function QuickAddHelp({
  onBack,
  onTry,
}: {
  onBack: () => void;
  onTry: (text: string) => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 text-sm">
      <button
        onClick={onBack}
        className="mb-3 text-xs font-medium text-teal-700 dark:text-teal-300"
      >
        ← Back to Quick add
      </button>
      <h2 className="text-base font-semibold">How to use Quick add</h2>
      <p className="mt-0.5 text-xs text-neutral-500">
        Tap an example to try it.{" "}
        <a
          href="/quick-add-guide.pdf"
          target="_blank"
          className="text-teal-700 underline dark:text-teal-300"
        >
          Download as PDF
        </a>
      </p>

      <div className="mt-3 rounded-xl bg-teal-600/10 px-3 py-2.5 text-[13px] text-teal-900 dark:text-teal-100">
        <div className="font-semibold">Top tips</div>
        <ul className="mt-1 space-y-0.5">
          <li>
            • <b>Always say a day</b> — Thu, tomorrow, 14 Oct…
          </li>
          <li>
            • <b>Say am or pm</b> for anything from 7 to 11 (“Beavers Mon 7.30pm”). 12–6 is always
            afternoon.
          </li>
          <li>
            • <b>Check the preview</b> before tapping Add — tap the Who / Kids / am-pm chips to fix
            it.
          </li>
        </ul>
      </div>

      {SECTIONS.map((s) => (
        <section key={s.title} className="mt-4">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">
            {s.title}
          </h3>
          {s.intro && <p className="mb-1.5 text-neutral-600 dark:text-neutral-300">{s.intro}</p>}
          {s.rows && (
            <div className="divide-y divide-black/5 rounded-lg border border-black/5 dark:divide-white/10 dark:border-white/10">
              {s.rows.map(([a, b]) => {
                const example = a.split(" · ")[0];
                const cells = (
                  <>
                    <span className="font-mono text-[12px] text-neutral-800 dark:text-neutral-100">
                      {a}
                    </span>
                    <span className="text-[12px] text-neutral-500">{b}</span>
                  </>
                );
                return s.tryable ? (
                  <button
                    key={a}
                    onClick={() => onTry(example)}
                    className="grid w-full grid-cols-[1.15fr_1fr] gap-2 px-2.5 py-1.5 text-left hover:bg-teal-600/5"
                  >
                    {cells}
                  </button>
                ) : (
                  <div key={a} className="grid grid-cols-[1.15fr_1fr] gap-2 px-2.5 py-1.5">
                    {cells}
                  </div>
                );
              })}
            </div>
          )}
          {s.bullets && (
            <ul className="mt-1.5 space-y-1 text-[13px] text-neutral-600 dark:text-neutral-300">
              {s.bullets.map((b) => (
                <li key={b} className="pl-3 -indent-3">
                  • {b}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
