import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import NavBar from "@/components/NavBar";
import UserRow, { type ManagedUser } from "@/components/UserRow";
import InviteForm from "@/components/InviteForm";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let rows: ManagedUser[] = [];
  let configError = false;
  try {
    const admin = createAdminClient();
    const [{ data: list }, { data: profiles }, { data: accounts }, { data: subs }] =
      await Promise.all([
        admin.auth.admin.listUsers(),
        admin.from("profiles").select("id, display_name"),
        admin.from("calendar_accounts").select("user_id, provider"),
        admin.from("push_subscriptions").select("user_id"),
      ]);

    const nameMap = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));
    const provMap = new Map<string, Set<string>>();
    for (const a of accounts ?? []) {
      const set = provMap.get(a.user_id) ?? new Set<string>();
      set.add(a.provider);
      provMap.set(a.user_id, set);
    }
    const pushSet = new Set((subs ?? []).map((s) => s.user_id));

    rows = (list?.users ?? []).map((u) => ({
      id: u.id,
      email: u.email ?? null,
      name:
        nameMap.get(u.id) ||
        (u.user_metadata?.full_name as string | undefined) ||
        "",
      providers: [...(provMap.get(u.id) ?? [])],
      push: pushSet.has(u.id),
    }));
  } catch {
    configError = true;
  }

  return (
    <>
      <NavBar />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 p-4">
        <h1 className="text-2xl font-semibold">People</h1>
        <p className="text-sm text-neutral-500">
          Everyone with an account. Each person connects their own calendars and
          sets their own availability.
        </p>

        <section className="rounded-2xl border border-black/10 p-4 dark:border-white/10">
          <h2 className="font-semibold">Invite someone</h2>
          <p className="mb-3 mt-0.5 text-sm text-neutral-500">
            Access is invite-only. Create a private single-use link and send it
            to the person you want to add.
          </p>
          <InviteForm />
        </section>

        {configError ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            Managing people needs the Supabase service-role key set (see README).
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <UserRow key={r.id} user={r} isSelf={r.id === user.id} />
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
