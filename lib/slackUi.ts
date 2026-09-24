import { format, parseISO } from "date-fns";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { Directory } from "@/lib/quickAdd";
import { EVENTS_METADATA_TYPE, slackApi } from "@/lib/slack";
import type { WeekEventInput } from "@/lib/weekEvents";

/**
 * Slack-facing pieces shared by the message, slash-command and interactivity
 * routes: loading the household directory, confirmation messages, and the
 * add/edit event modal.
 */

type Admin = ReturnType<typeof createAdminClient>;

export async function loadDirectory(admin: Admin, senderId: string): Promise<Directory> {
  const [profilesRes, helpersRes, kidsRes] = await Promise.all([
    admin.from("profiles").select("id, display_name"),
    admin.from("helpers").select("id, name").order("sort_order"),
    admin.from("kids").select("id, name").order("sort_order"),
  ]);
  return {
    senderId,
    people: (profilesRes.data ?? [])
      .filter((p) => p.display_name?.trim())
      .map((p) => ({ id: p.id, name: p.display_name!.trim() })),
    helpers: helpersRes.data ?? [],
    kids: kidsRes.data ?? [],
  };
}

export function whoName(dir: Directory, ev: Pick<WeekEventInput, "helperId" | "assigneeUserId">) {
  return (
    dir.helpers.find((h) => h.id === ev.helperId)?.name ??
    dir.people.find((p) => p.id === ev.assigneeUserId)?.name ??
    null
  );
}

/** "*Swimming* · Percy · Thu 2 Oct, 16:00–17:00 · David" */
export function describe(dir: Directory, ev: WeekEventInput): string {
  const bits = [`*${ev.title}*`];
  const kidNames = dir.kids.filter((k) => ev.kidIds.includes(k.id)).map((k) => k.name);
  if (kidNames.length) bits.push(kidNames.join(" & "));
  let when = format(parseISO(`${ev.day}T12:00:00`), "EEE d MMM");
  if (ev.startTime) when += `, ${ev.startTime}${ev.endTime ? `–${ev.endTime}` : ""}`;
  else when += " (all day)";
  bits.push(when);
  const who = whoName(dir, ev);
  if (who) bits.push(who);
  return bits.join(" · ");
}

/**
 * Post a confirmation. `ids` is every event this thread now covers (stored as
 * message metadata so thread replies know what to change); `undoIds` get an
 * Undo button; each of `editable` gets an Edit button.
 */
export async function postConfirmation(opts: {
  channel: string;
  threadTs?: string;
  lines: string[];
  ids: string[];
  undoIds?: string[];
  editable?: { id: string; title: string }[];
}) {
  const text = opts.lines.join("\n");
  const buttons: unknown[] = (opts.editable ?? []).slice(0, 4).map((e) => ({
    type: "button",
    text: {
      type: "plain_text",
      text: (opts.editable!.length > 1 ? `Edit ${e.title}` : "Edit").slice(0, 70),
    },
    action_id: `edit_event:${e.id}`,
    value: e.id,
  }));
  if (opts.undoIds?.length) {
    buttons.push({
      type: "button",
      text: { type: "plain_text", text: "Undo" },
      style: "danger",
      action_id: "undo_events",
      value: JSON.stringify(opts.undoIds),
    });
  }
  const blocks: unknown[] = [
    { type: "section", text: { type: "mrkdwn", text } },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "Reply in this thread to change it — e.g. “5pm”, “4-6”, “move to Fri”, “Ashley’s doing it”, “cancel”.",
        },
      ],
    },
  ];
  if (buttons.length) blocks.push({ type: "actions", elements: buttons });
  return slackApi<{ ts: string; channel: string }>("chat.postMessage", {
    channel: opts.channel,
    thread_ts: opts.threadTs,
    text,
    blocks,
    metadata: { event_type: EVENTS_METADATA_TYPE, event_payload: { ids: opts.ids } },
  });
}

export type ModalMeta =
  | { mode: "create"; channel: string; userId: string }
  | { mode: "edit"; channel: string; threadTs?: string; eventId: string };

const opt = (text: string, value: string) => ({
  text: { type: "plain_text", text: text.slice(0, 75) },
  value,
});

/** The add/edit event modal. `prefill` present = edit mode. */
export function eventModal(dir: Directory, meta: ModalMeta, prefill?: WeekEventInput) {
  const whoOptions = [
    ...dir.people.map((p) => opt(p.name, `p:${p.id}`)),
    ...dir.helpers.map((h) => opt(h.name, `h:${h.id}`)),
  ];
  const whoInitial = prefill
    ? prefill.helperId
      ? `h:${prefill.helperId}`
      : prefill.assigneeUserId
        ? `p:${prefill.assigneeUserId}`
        : null
    : `p:${dir.senderId}`;
  const whoInitialOpt = whoOptions.find((o) => o.value === whoInitial);

  const blocks: unknown[] = [
    {
      type: "input",
      block_id: "title",
      label: { type: "plain_text", text: "What" },
      element: {
        type: "plain_text_input",
        action_id: "v",
        placeholder: { type: "plain_text", text: "e.g. Swimming" },
        ...(prefill ? { initial_value: prefill.title } : {}),
      },
    },
    {
      type: "input",
      block_id: "day",
      label: { type: "plain_text", text: "Day" },
      element: {
        type: "datepicker",
        action_id: "v",
        ...(prefill ? { initial_date: prefill.day } : {}),
      },
    },
    {
      type: "input",
      block_id: "start",
      optional: true,
      label: { type: "plain_text", text: "Start (leave blank for all day)" },
      element: {
        type: "timepicker",
        action_id: "v",
        ...(prefill?.startTime ? { initial_time: prefill.startTime } : {}),
      },
    },
    {
      type: "input",
      block_id: "end",
      optional: true,
      label: { type: "plain_text", text: "End (blank = 1 hour)" },
      element: {
        type: "timepicker",
        action_id: "v",
        ...(prefill?.endTime ? { initial_time: prefill.endTime } : {}),
      },
    },
  ];
  if (dir.kids.length) {
    const kidOpts = dir.kids.map((k) => opt(k.name, k.id));
    const initial = kidOpts.filter((o) => prefill?.kidIds.includes(o.value));
    blocks.push({
      type: "input",
      block_id: "kids",
      optional: true,
      label: { type: "plain_text", text: "For" },
      element: {
        type: "checkboxes",
        action_id: "v",
        options: kidOpts,
        ...(initial.length ? { initial_options: initial } : {}),
      },
    });
  }
  if (whoOptions.length) {
    blocks.push({
      type: "input",
      block_id: "who",
      optional: true,
      label: { type: "plain_text", text: "Who’s doing it" },
      element: {
        type: "static_select",
        action_id: "v",
        options: whoOptions,
        ...(whoInitialOpt ? { initial_option: whoInitialOpt } : {}),
      },
    });
  }
  blocks.push({
    type: "input",
    block_id: "notes",
    optional: true,
    label: { type: "plain_text", text: "Notes" },
    element: {
      type: "plain_text_input",
      action_id: "v",
      multiline: true,
      ...(prefill?.notes ? { initial_value: prefill.notes } : {}),
    },
  });

  return {
    type: "modal",
    callback_id: "event_modal",
    private_metadata: JSON.stringify(meta),
    title: { type: "plain_text", text: prefill ? "Edit event" : "Add event" },
    submit: { type: "plain_text", text: prefill ? "Save" : "Add" },
    close: { type: "plain_text", text: "Cancel" },
    blocks,
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Read the modal's submitted values back into event fields. */
export function readModal(values: any): { input: WeekEventInput } | { errors: Record<string, string> } {
  const v = (block: string) => values?.[block]?.v;
  const title = String(v("title")?.value ?? "").trim().slice(0, 200);
  const day: string = v("day")?.selected_date ?? "";
  const startTime: string | null = v("start")?.selected_time ?? null;
  let endTime: string | null = v("end")?.selected_time ?? null;
  const who: string | null = v("who")?.selected_option?.value ?? null;

  const errors: Record<string, string> = {};
  if (!title) errors.title = "Add a title";
  if (!day) errors.day = "Pick a day";
  if (endTime && !startTime) errors.start = "Add a start time too";
  if (startTime && endTime && endTime <= startTime) errors.end = "End must be after start";
  if (Object.keys(errors).length) return { errors };

  if (startTime && !endTime) {
    const [h, m] = startTime.split(":").map(Number);
    const mins = Math.min(h * 60 + m + 60, 23 * 60 + 59);
    endTime = `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  }
  return {
    input: {
      title,
      day,
      startTime,
      endTime,
      notes: String(v("notes")?.value ?? "").trim().slice(0, 2000) || null,
      kidIds: (v("kids")?.selected_options ?? []).map((o: any) => o.value),
      assigneeUserId: who?.startsWith("p:") ? who.slice(2) : null,
      helperId: who?.startsWith("h:") ? who.slice(2) : null,
    },
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Convert a week_events row into editable fields. */
export function rowToInput(r: {
  title: string;
  day: string;
  start_time: string | null;
  end_time: string | null;
  notes: string | null;
  kid_ids: string[];
  assignee_user_id: string | null;
  helper_id: string | null;
}): WeekEventInput {
  return {
    title: r.title,
    day: r.day,
    startTime: r.start_time?.slice(0, 5) ?? null,
    endTime: r.end_time?.slice(0, 5) ?? null,
    notes: r.notes,
    kidIds: r.kid_ids,
    assigneeUserId: r.assignee_user_id,
    helperId: r.helper_id,
  };
}
