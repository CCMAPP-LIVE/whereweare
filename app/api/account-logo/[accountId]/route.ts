import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "account-logos";
const MAX_BYTES = 2 * 1024 * 1024;
const TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

type Params = { params: Promise<{ accountId: string }> };

/** The account, if it's one of the signed-in user's own. */
async function ownAccount(accountId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, account: null, admin: null };
  const admin = createAdminClient();
  const { data: account } = await admin
    .from("calendar_accounts")
    .select("id, logo_url")
    .eq("id", accountId)
    .eq("user_id", user.id)
    .maybeSingle();
  return { user, account, admin };
}

/** The storage path inside the bucket for a public logo URL we created. */
function pathOf(url: string | null): string | null {
  if (!url) return null;
  const marker = `/object/public/${BUCKET}/`;
  const i = url.indexOf(marker);
  return i >= 0 ? decodeURIComponent(url.slice(i + marker.length).split("?")[0]) : null;
}

/** Upload (or replace) the logo for one of your accounts. Body: multipart `file`. */
export async function POST(request: Request, { params }: Params) {
  const { accountId } = await params;
  const { user, account, admin } = await ownAccount(accountId);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!account || !admin) return NextResponse.json({ error: "not found" }, { status: 404 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image file." }, { status: 400 });
  const ext = TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "Logo must be a PNG, JPG or WebP image." }, { status: 400 });
  if (file.size > MAX_BYTES)
    return NextResponse.json({ error: "Logo must be 2 MB or smaller." }, { status: 400 });

  // A fresh filename each time so browsers and the CDN never show a stale logo.
  const path = `${account.id}/${Date.now()}.${ext}`;
  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    cacheControl: "31536000",
    upsert: false,
  });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const {
    data: { publicUrl },
  } = admin.storage.from(BUCKET).getPublicUrl(path);
  await admin.from("calendar_accounts").update({ logo_url: publicUrl }).eq("id", account.id);

  const old = pathOf(account.logo_url);
  if (old) await admin.storage.from(BUCKET).remove([old]);

  return NextResponse.json({ ok: true, logoUrl: publicUrl });
}

/** Remove the logo (booking pages fall back to an initials badge). */
export async function DELETE(_request: Request, { params }: Params) {
  const { accountId } = await params;
  const { user, account, admin } = await ownAccount(accountId);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!account || !admin) return NextResponse.json({ error: "not found" }, { status: 404 });

  await admin.from("calendar_accounts").update({ logo_url: null }).eq("id", account.id);
  const old = pathOf(account.logo_url);
  if (old) await admin.storage.from(BUCKET).remove([old]);
  return NextResponse.json({ ok: true });
}
