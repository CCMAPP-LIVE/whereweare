import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Spreadsheets treat a leading = + - @ as a formula; neutralise it. */
function csvCell(v: string | null): string {
  let s = v ?? "";
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** Signed-in only: the whole waiting list as a CSV download. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("waitlist")
    .select("email, name, use_case, created_at")
    .order("created_at", { ascending: true });
  if (error) return new Response(error.message, { status: 500 });

  const lines = [
    ["Signed up (UTC)", "Email", "Name", "Would use it for"].map(csvCell).join(","),
    ...(rows ?? []).map((r) =>
      [r.created_at.slice(0, 19).replace("T", " "), r.email, r.name, r.use_case].map(csvCell).join(","),
    ),
  ];
  const date = new Date().toISOString().slice(0, 10);
  return new Response(`﻿${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="meyouwhen-waitlist-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
