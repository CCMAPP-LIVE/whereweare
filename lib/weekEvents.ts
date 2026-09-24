import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import {
  deleteWeekEventOnLifeCalendar,
  upsertWeekEventOnLifeCalendar,
} from "@/lib/google/weekEvents";

type Admin = SupabaseClient<Database>;

export type WeekEventInput = {
  day: string;
  startTime: string | null;
  endTime: string | null;
  title: string;
  notes: string | null;
  assigneeUserId: string | null;
  helperId: string | null;
  kidIds: string[];
};

/** Best-effort Life Calendar sync for one week_event; persists a new google id. */
async function syncToLife(
  admin: Admin,
  id: string,
  ev: WeekEventInput,
  googleEventId: string | null,
): Promise<{ lifeSynced: boolean; warning?: string }> {
  try {
    const [assigneeRes, helperRes, kidsRes] = await Promise.all([
      ev.assigneeUserId
        ? admin
            .from("profiles")
            .select("display_name")
            .eq("id", ev.assigneeUserId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      ev.helperId
        ? admin.from("helpers").select("name").eq("id", ev.helperId).maybeSingle()
        : Promise.resolve({ data: null }),
      ev.kidIds.length > 0
        ? admin
            .from("kids")
            .select("id, name, sort_order")
            .in("id", ev.kidIds)
            .order("sort_order", { ascending: true })
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);
    const assigneeName =
      helperRes.data?.name ?? assigneeRes.data?.display_name ?? null;
    const kidNames = (kidsRes.data ?? []).map((k) => k.name);
    const newGoogleEventId = await upsertWeekEventOnLifeCalendar({
      id,
      day: ev.day,
      startTime: ev.startTime,
      endTime: ev.endTime,
      title: ev.title,
      notes: ev.notes,
      kidNames,
      assigneeName,
      googleEventId,
    });
    if (newGoogleEventId && newGoogleEventId !== googleEventId) {
      await admin
        .from("week_events")
        .update({ google_event_id: newGoogleEventId })
        .eq("id", id);
    }
    return { lifeSynced: true };
  } catch (e) {
    return { lifeSynced: false, warning: (e as Error).message };
  }
}

export async function createWeekEvent(admin: Admin, userId: string, ev: WeekEventInput) {
  const { data: inserted, error } = await admin
    .from("week_events")
    .insert({
      user_id: userId,
      day: ev.day,
      start_time: ev.startTime,
      end_time: ev.endTime,
      title: ev.title,
      notes: ev.notes,
      assignee_user_id: ev.assigneeUserId,
      helper_id: ev.helperId,
      kid_ids: ev.kidIds,
    })
    .select("id")
    .single();
  if (error || !inserted) throw new Error(error?.message ?? "insert failed");
  const sync = await syncToLife(admin, inserted.id, ev, null);
  return { id: inserted.id, ...sync };
}

export async function updateWeekEvent(
  admin: Admin,
  id: string,
  ev: WeekEventInput,
  googleEventId: string | null,
) {
  const { error } = await admin
    .from("week_events")
    .update({
      day: ev.day,
      start_time: ev.startTime,
      end_time: ev.endTime,
      title: ev.title,
      notes: ev.notes,
      assignee_user_id: ev.assigneeUserId,
      helper_id: ev.helperId,
      kid_ids: ev.kidIds,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  return syncToLife(admin, id, ev, googleEventId);
}

export async function deleteWeekEvent(admin: Admin, id: string, googleEventId: string | null) {
  if (googleEventId) {
    try {
      await deleteWeekEventOnLifeCalendar(googleEventId);
    } catch {
      // Non-fatal — row is what the app treats as source of truth.
    }
  }
  const { error } = await admin.from("week_events").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
