import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NavBar from "@/components/NavBar";
import MessagesView from "@/components/MessagesView";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: messageRows }, { data: profileRows }] = await Promise.all([
    supabase
      .from("messages")
      .select("id, sender_id, recipient_id, body, created_at, read_at")
      .order("created_at", { ascending: true })
      .limit(200),
    supabase.from("profiles").select("id, display_name"),
  ]);

  const names = Object.fromEntries(
    (profileRows ?? []).map((p) => [p.id, p.display_name?.trim() || "Someone"]),
  );

  return (
    <>
      <NavBar />
      <MessagesView currentUserId={user.id} names={names} initialMessages={messageRows ?? []} />
    </>
  );
}
