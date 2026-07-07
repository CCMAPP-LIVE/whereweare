import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccountsForUser, refreshCalendarsForUser } from "@/lib/calendars";
import NavBar from "@/components/NavBar";
import ProfileForm from "@/components/ProfileForm";
import ConnectAccounts from "@/components/ConnectAccounts";
import EnablePush from "@/components/EnablePush";

export const dynamic = "force-dynamic";

type Account = {
  id: string;
  provider: "google" | "microsoft";
  account_email: string | null;
};

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-black/10 p-4 dark:border-white/10">
      <h2 className="font-semibold">{title}</h2>
      {description && (
        <p className="mb-3 mt-0.5 text-sm text-neutral-500">{description}</p>
      )}
      <div className={description ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  let accounts: Account[] = [];
  let configError = false;
  try {
    const admin = createAdminClient();
    await refreshCalendarsForUser(admin, user.id).catch(() => {});
    accounts = await getAccountsForUser(admin, user.id);
  } catch {
    configError = true; // service-role key not set yet
  }

  return (
    <>
      <NavBar />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-5 p-4">
        <h1 className="text-2xl font-semibold">Settings</h1>

        <Section title="Your name" description="Shown on the shared week view and on the Life calendar.">
          <ProfileForm userId={user.id} initialName={profile?.display_name ?? ""} />
        </Section>

        <Section
          title="Connected accounts"
          description="Connect as many accounts as you like — every calendar in each one shows up in the week view. Read-only — we never change your personal calendars."
        >
          {configError ? (
            <p className="text-sm text-amber-600">
              Calendar setup isn’t complete yet (missing service-role key). See
              README.
            </p>
          ) : (
            <ConnectAccounts
              accounts={accounts.map((a) => ({
                id: a.id,
                provider: a.provider,
                account_email: a.account_email,
              }))}
            />
          )}
        </Section>

        <Section
          title="Weekly reminder"
          description="A push notification each Sunday evening to update where you’ll be."
        >
          <EnablePush />
        </Section>

        <Section title="Install on your phone">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-neutral-600 dark:text-neutral-300">
            <li>Open this site in Safari (iPhone) or Chrome (Android).</li>
            <li>Tap Share → “Add to Home Screen”.</li>
            <li>Open it from the new icon, then enable reminders above.</li>
          </ol>
        </Section>
      </main>
    </>
  );
}
