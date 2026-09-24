import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/env";
import { signShare } from "@/lib/shareLink";
import type { IncludeKey } from "@/lib/weekSheet";

/** Create a read-only week link (valid 6 months). Work calendars are never shared. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const who =
    typeof body.who === "string" && /^(all|[pk]:[0-9a-f-]{36})$/.test(body.who) ? body.who : "all";
  const allowed: IncludeKey[] = ["school", "events", "where"];
  const include = (Array.isArray(body.include) ? body.include : []).filter(
    (k: string): k is IncludeKey => (allowed as string[]).includes(k),
  );
  const token = signShare({
    who,
    include: include.length ? include : ["school", "events"],
    exp: Date.now() + 1000 * 60 * 60 * 24 * 183,
  });
  return NextResponse.json({ url: `${siteUrl()}/week/${token}` });
}
