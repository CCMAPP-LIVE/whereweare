import Anthropic from "@anthropic-ai/sdk";
import { addDays, format, parseISO } from "date-fns";
import { londonToday } from "@/lib/time";

/**
 * Turns a free-text message ("Percy swimming Thu 4-5") into week_event
 * fields using Claude. Used by the Slack bot; kept channel-agnostic so a
 * WhatsApp/email front door could reuse it.
 */

export type ParsedEvent = {
  index: number;
  title: string;
  day: string; // YYYY-MM-DD
  start_time: string; // HH:mm or ""
  end_time: string; // HH:mm or ""
  notes: string;
  kids: string[];
  assignee: string; // a person or helper name, or ""
};

export type ParseResult = {
  action: "create" | "update" | "delete" | "none";
  message: string;
  events: ParsedEvent[];
};

export type ExistingEvent = {
  title: string;
  day: string;
  startTime: string | null;
  endTime: string | null;
  notes: string | null;
  kids: string[];
  assignee: string | null;
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["action", "message", "events"],
  properties: {
    action: { type: "string", enum: ["create", "update", "delete", "none"] },
    message: { type: "string" },
    events: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["index", "title", "day", "start_time", "end_time", "notes", "kids", "assignee"],
        properties: {
          index: { type: "integer" },
          title: { type: "string" },
          day: { type: "string" },
          start_time: { type: "string" },
          end_time: { type: "string" },
          notes: { type: "string" },
          kids: { type: "array", items: { type: "string" } },
          assignee: { type: "string" },
        },
      },
    },
  },
} as const;

const SYSTEM = `You turn short chat messages from a two-parent household into entries on their shared family planner ("Where We Are"). Timezone is Europe/London.

Decide an action:
- "create": the message describes one or more new events. Return one item per event (e.g. "swimming Thu and Fri 4pm" = two items).
- "update": only when existing events are provided (the message is a reply in that event's thread) and the message asks to change them. Return the complete new version of each changed event, with "index" set to that event's position in the existing list. Keep unchanged fields as they were.
- "delete": only when existing events are provided and the message asks to cancel/remove them. Return the events to delete with their "index" (other fields can copy the existing values).
- "none": the message isn't an event request, or something essential (the day) is genuinely missing or ambiguous. Put a short, friendly question or reply in "message".

Field rules:
- title: short and plain, e.g. "Swimming", "Dentist", "Drop-off", "Pickup". Don't repeat kid or person names in the title if they go in kids/assignee.
- day: YYYY-MM-DD. Resolve relative dates ("tomorrow", "Thursday", "next Tues") using the date table; a bare weekday means the next occurrence (today counts if it's today and the time hasn't obviously passed).
- start_time/end_time: 24h HH:mm, or "" for all-day / no time. "4-5" means 16:00-17:00 for everyday activities; use common sense for am/pm. Leave end_time "" if not given.
- kids: names from the kids list that the event is for (exact spelling), else [].
- assignee: the person or helper (exact spelling from the lists) who is doing/taking it, if stated ("Ashley taking", "Joy picking up"). "I"/"me" means the sender. Otherwise "".
- notes: anything useful that doesn't fit elsewhere (location, what to bring), else "".
- index: position in existing list for update/delete; 0,1,2... for create.
- message: for create/update/delete, a very short acknowledgement (it is not shown if the action succeeds); for none, the reply to send.`;

function dateTable(today: string): string {
  const base = parseISO(`${today}T12:00:00`);
  const lines: string[] = [];
  for (let i = 0; i < 28; i++) {
    const d = addDays(base, i);
    lines.push(`${format(d, "EEE d MMM yyyy")} = ${format(d, "yyyy-MM-dd")}${i === 0 ? " (today)" : ""}`);
  }
  return lines.join("\n");
}

export async function parseQuickAdd(opts: {
  text: string;
  senderName: string;
  people: string[];
  helpers: string[];
  kids: string[];
  existing: ExistingEvent[];
}): Promise<ParseResult> {
  const client = new Anthropic();
  const today = londonToday();

  const context = [
    `Sender: ${opts.senderName}`,
    `People: ${opts.people.join(", ") || "(none)"}`,
    `Helpers: ${opts.helpers.join(", ") || "(none)"}`,
    `Kids: ${opts.kids.join(", ") || "(none)"}`,
    `Now (London): ${new Date().toLocaleString("en-GB", { timeZone: "Europe/London" })}`,
    `Date table:\n${dateTable(today)}`,
    opts.existing.length
      ? `Existing events in this thread:\n${JSON.stringify(opts.existing, null, 1)}`
      : "Existing events in this thread: none (this is a new message).",
  ].join("\n\n");

  const response = await client.beta.messages.create({
    model: "claude-opus-5",
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: SCHEMA },
    },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `${context}\n\nMessage:\n<message>\n${opts.text}\n</message>`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    return { action: "none", message: "Sorry, I couldn't process that one.", events: [] };
  }
  const text = response.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");
  try {
    return JSON.parse(text) as ParseResult;
  } catch {
    return {
      action: "none",
      message: "Sorry, I didn't catch that — try e.g. “Percy swimming Thu 4–5pm”.",
      events: [],
    };
  }
}
