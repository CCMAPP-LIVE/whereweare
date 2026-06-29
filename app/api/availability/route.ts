import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncDayToLifeCalendar } from "@/lib/google/lifeCalendar";
import { SLOTS, STATUSES } from "@/lib/constants";
import type { Slot, Status } from "@/lib/types";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const day = String(body.day ?? "");
  const slot = String(body.slot ?? "");
  const status = body.status ?? null;
  const note = body.note ? String(body.note).slice(0, 200) : null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !SLOTS.some((s) => s.value === slot)) {
    return NextResponse.json({ error: "invalid day/slot" }, { status: 400 });
  }
  if (status !== null && !STATUSES.some((s) => s.value === status)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }

  const { error } = await supabase.from("availability").upsert(
    {
      user_id: user.id,
      day,
      slot: slot as Slot,
      status: status as Status | null,
      note,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,day,slot" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Reflect the change on the shared Life calendar (best-effort).
  let lifeSynced = true;
  let warning: string | undefined;
  try {
    await syncDayToLifeCalendar(createAdminClient(), user.id, day);
  } catch (e) {
    lifeSynced = false;
    warning = (e as Error).message;
  }

  return NextResponse.json({ ok: true, lifeSynced, warning });
}
