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
    .select("id, title, status, position, assignee_user_ids")
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  // Comment counts for every card in one query, so each Card doesn't need its
  // own round-trip just to know whether to show "💬" vs "💬 3".
  const { data: commentRows } = await supabase
    .from("todo_comments")
    .select("todo_id");
  const commentCounts: Record<string, number> = {};
  for (const c of commentRows ?? [])
    commentCounts[c.todo_id] = (commentCounts[c.todo_id] ?? 0) + 1;

  const todos: Todo[] = (rows ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status as Todo["status"],
    position: r.position,
    assigneeUserIds: r.assignee_user_ids ?? [],
    commentCount: commentCounts[r.id] ?? 0,
  }));

  return (
    <>
      <NavBar />
      <TodoBoard currentUserId={user.id} people={people} initialTodos={todos} />
    </>
  );
}
