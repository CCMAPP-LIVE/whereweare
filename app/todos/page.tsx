import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NavBar from "@/components/NavBar";
import TodoBoard, { type Todo } from "@/components/TodoBoard";

export const dynamic = "force-dynamic";

export default async function TodosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, created_at")
    .order("created_at");
  const people = (profiles ?? []).map((p) => ({
    id: p.id,
    name: p.display_name?.trim() || "Someone",
  }));

  const { data: rows } = await supabase
    .from("todos")
    .select("id, title, status, position, assignee_user_id")
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  const todos: Todo[] = (rows ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status as Todo["status"],
    position: r.position,
    assigneeUserId: r.assignee_user_id,
  }));

  return (
    <>
      <NavBar />
      <TodoBoard currentUserId={user.id} people={people} initialTodos={todos} />
    </>
  );
}
