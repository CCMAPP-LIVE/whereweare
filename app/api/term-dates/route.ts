import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchIcs, refreshConfiguredSchools, syncSchoolCalendar } from "@/lib/termSync";

export const maxDuration = 60;

/**
 * Import school term dates / holidays / INSET days as "🏫 …" all-day entries
 * for the chosen children, from an .ics link or file — or `{ refresh: true }`
 * to re-sync the schools configured in SCHOOL_CALENDARS (also done weekly).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const admin = createAdminClient();

  if (body.refresh === true) {
    const results = await refreshConfiguredSchools(admin, user.id);
    return NextResponse.json({ ok: true, results });
  }

  let ics = typeof body.ics === "string" ? body.ics : "";
  try {
    if (!ics && typeof body.url === "string") ics = await fetchIcs(body.url);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  if (!/BEGIN:VCALENDAR/i.test(ics))
    return NextResponse.json(
      { error: "That doesn't look like a calendar (.ics) file" },
      { status: 400 },
    );

  const { data: kids } = await admin.from("kids").select("id");
  const allKids = (kids ?? []).map((k) => k.id);
  const chosen: string[] = Array.isArray(body.kidIds)
    ? body.kidIds.filter((k: unknown): k is string => typeof k === "string" && allKids.includes(k))
    : [];
  const r = await syncSchoolCalendar(admin, user.id, ics, chosen.length ? chosen : allKids, {
    prune: typeof body.url === "string",
  });
  return NextResponse.json({ ok: true, ...r });
}
