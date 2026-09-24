/** Minimal iCalendar (.ics) reader: all-day / timed VEVENTs → day ranges. */
export type IcsEvent = { title: string; start: string; end: string }; // YYYY-MM-DD, end exclusive

export function parseIcs(text: string): IcsEvent[] {
  // Unfold continuation lines (RFC 5545: a line starting with space/tab continues the previous).
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\n[ \t]/g, "")
    .split("\n");
  const out: IcsEvent[] = [];
  let cur: Record<string, string> | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") cur = {};
    else if (line === "END:VEVENT") {
      if (cur?.DTSTART && cur.SUMMARY) {
        const start = toDay(cur.DTSTART);
        const endRaw = cur.DTEND ? toDay(cur.DTEND) : null;
        const allDay = /^\d{8}$/.test(cur.DTSTART);
        const end = endRaw && endRaw > start ? endRaw : nextDay(start);
        out.push({ title: unescape(cur.SUMMARY), start, end: allDay ? end : nextDay(start) });
      }
      cur = null;
    } else if (cur) {
      const i = line.indexOf(":");
      if (i > 0) cur[line.slice(0, i).split(";")[0].toUpperCase()] = line.slice(i + 1).trim();
    }
  }
  return out;
}

function toDay(v: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(v);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
}
function nextDay(d: string): string {
  const t = new Date(`${d}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}
function unescape(s: string) {
  return s
    .replace(/\\n/gi, " ")
    .replace(/\\([,;\\])/g, "$1")
    .trim();
}
