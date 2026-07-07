import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { dayLabel } from "@/lib/time";
import NavBar from "@/components/NavBar";

export const dynamic = "force-dynamic";

export default async function CommentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: unreadRows }, { data: profileRows }] = await Promise.all([
    supabase
      .from("messages")
      .select("id, sender_id, day, body, created_at")
      .eq("recipient_id", user.id)
      .is("read_at", null)
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, display_name"),
  ]);

  const names = Object.fromEntries(
    (profileRows ?? []).map((p) => [p.id, p.display_name?.trim() || "Someone"]),
  );

  type UnreadRow = NonNullable<typeof unreadRows>[number];
  const byDay = new Map<string, { count: number; latest: UnreadRow }>();
  for (const row of unreadRows ?? []) {
    const existing = byDay.get(row.day);
    if (existing) existing.count += 1;
    else byDay.set(row.day, { count: 1, latest: row });
  }
  const days = [...byDay.keys()].sort((a, b) => (a < b ? 1 : -1));

  return (
    <>
      <NavBar />
      <main className="mx-auto w-full max-w-2xl flex-1 p-3 sm:p-5">
        <h1 className="mb-3 text-lg font-semibold sm:text-xl">Unread comments</h1>
        {days.length === 0 ? (
          <p className="text-sm text-neutral-400">You&rsquo;re all caught up.</p>
        ) : (
          <ul className="space-y-2">
            {days.map((day) => {
              const { count, latest } = byDay.get(day)!;
              const { weekday, date } = dayLabel(day);
              return (
                <li key={day}>
                  <a
                    href={`/plan?date=${day}&comments=1`}
                    className="flex items-start justify-between gap-3 rounded-2xl border border-black/10 p-3 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
                  >
                    <div className="min-w-0">
                      <div className="font-medium">
                        {weekday} <span className="font-normal text-neutral-400">{date}</span>
                      </div>
                      <p className="mt-0.5 truncate text-sm text-neutral-500">
                        {names[latest.sender_id] || "Someone"}: {latest.body}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-teal-600 px-2 py-0.5 text-xs font-medium text-white">
                      {count}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
