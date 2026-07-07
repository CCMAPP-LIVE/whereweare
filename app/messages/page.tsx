import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { londonToday } from "@/lib/time";
import NavBar from "@/components/NavBar";
import MessagesView from "@/components/MessagesView";

export const dynamic = "force-dynamic";

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const initialDay =
    typeof sp.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : "";

  const [{ data: messageRows }, { data: profileRows }] = await Promise.all([
    supabase
      .from("messages")
      .select("id, sender_id, recipient_id, body, day, created_at, read_at")
      .order("created_at", { ascending: true })
      .limit(200),
    supabase.from("profiles").select("id, display_name"),
  ]);

  const names = Object.fromEntries(
    (profileRows ?? []).map((p) => [p.id, p.display_name?.trim() || "Someone"]),
  );
  const otherPeople = (profileRows ?? [])
    .filter((p) => p.id !== user.id)
    .map((p) => ({ id: p.id, name: p.display_name?.trim() || "Someone" }));

  return (
    <>
      <NavBar />
      <MessagesView
        currentUserId={user.id}
        names={names}
        people={otherPeople}
        initialMessages={messageRows ?? []}
        today={londonToday()}
        initialDay={initialDay}
      />
    </>
  );
}
