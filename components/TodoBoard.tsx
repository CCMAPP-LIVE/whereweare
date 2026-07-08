"use client";

import { useMemo, useState } from "react";
import { TODO_COLUMNS, type TodoStatus } from "@/lib/constants";

export type Todo = {
  id: string;
  title: string;
  status: TodoStatus;
  position: number;
  assigneeUserIds: string[];
};

type Person = { id: string; name: string };

const STATUS_ORDER: TodoStatus[] = TODO_COLUMNS.map((c) => c.value);

// A subtle accent dot per column so the three lanes read apart at a glance.
const ACCENT: Record<TodoStatus, string> = {
  todo: "bg-neutral-400",
  doing: "bg-amber-500",
  done: "bg-emerald-500",
};

/** Next free position at the bottom of a column, mirroring the API. */
function bottomOf(todos: Todo[], status: TodoStatus): number {
  const max = todos
    .filter((t) => t.status === status)
    .reduce((m, t) => Math.max(m, t.position), -1);
  return max + 1;
}

export default function TodoBoard({
  people,
  initialTodos,
}: {
  currentUserId: string;
  people: Person[];
  initialTodos: Todo[];
}) {
  const [todos, setTodos] = useState<Todo[]>(initialTodos);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<TodoStatus | null>(null);

  const firstName = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of people) m.set(p.id, p.name.split(/\s+/)[0] || p.name);
    return m;
  }, [people]);


  const byStatus = useMemo(() => {
    const map: Record<TodoStatus, Todo[]> = { todo: [], doing: [], done: [] };
    for (const t of todos) map[t.status]?.push(t);
    for (const s of STATUS_ORDER)
      map[s].sort((a, b) => a.position - b.position);
    return map;
  }, [todos]);

  async function addTodo(status: TodoStatus, title: string) {
    const clean = title.trim();
    if (!clean) return;
    setError(null);
    // Optimistic: show a temporary card, then reconcile with the server id.
    const tempId = `tmp-${status}-${todos.length}-${clean.length}`;
    const optimistic: Todo = {
      id: tempId,
      title: clean,
      status,
      position: bottomOf(todos, status),
      assigneeUserIds: [],
    };
    setTodos((cur) => [...cur, optimistic]);
    try {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: clean, status }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.todo) {
        setTodos((cur) => cur.filter((t) => t.id !== tempId));
        setError(json?.error ?? "Couldn't add that card.");
        return;
      }
      setTodos((cur) =>
        cur.map((t) =>
          t.id === tempId
            ? {
                id: json.todo.id,
                title: json.todo.title,
                status: json.todo.status,
                position: json.todo.position,
                assigneeUserIds: json.todo.assignee_user_ids ?? [],
              }
            : t,
        ),
      );
    } catch {
      setTodos((cur) => cur.filter((t) => t.id !== tempId));
      setError("Couldn't add that card.");
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/todos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("save failed");
  }

  function moveTo(id: string, status: TodoStatus) {
    const card = todos.find((t) => t.id === id);
    if (!card || card.status === status) return;
    const prev = todos;
    setTodos((cur) =>
      cur.map((t) =>
        t.id === id ? { ...t, status, position: bottomOf(prev, status) } : t,
      ),
    );
    patch(id, { status }).catch(() => {
      setTodos(prev);
      setError("Couldn't move that card.");
    });
  }

  function step(id: string, dir: -1 | 1) {
    const card = todos.find((t) => t.id === id);
    if (!card) return;
    const idx = STATUS_ORDER.indexOf(card.status) + dir;
    if (idx < 0 || idx >= STATUS_ORDER.length) return;
    moveTo(id, STATUS_ORDER[idx]);
  }

  function toggleAssignee(id: string, personId: string) {
    const card = todos.find((t) => t.id === id);
    if (!card) return;
    const has = card.assigneeUserIds.includes(personId);
    const next = has
      ? card.assigneeUserIds.filter((x) => x !== personId)
      : [...card.assigneeUserIds, personId];
    const prev = todos;
    setTodos((cur) =>
      cur.map((t) => (t.id === id ? { ...t, assigneeUserIds: next } : t)),
    );
    patch(id, { assigneeUserIds: next }).catch(() => {
      setTodos(prev);
      setError("Couldn't change who it's for.");
    });
  }

  function editTitle(id: string, title: string) {
    const clean = title.trim();
    const card = todos.find((t) => t.id === id);
    if (!card || !clean || clean === card.title) return;
    const prev = todos;
    setTodos((cur) => cur.map((t) => (t.id === id ? { ...t, title: clean } : t)));
    patch(id, { title: clean }).catch(() => {
      setTodos(prev);
      setError("Couldn't rename that card.");
    });
  }

  function removeTodo(id: string) {
    const prev = todos;
    setTodos((cur) => cur.filter((t) => t.id !== id));
    fetch(`/api/todos/${id}`, { method: "DELETE" }).then((res) => {
      if (!res.ok) {
        setTodos(prev);
        setError("Couldn't delete that card.");
      }
    });
  }

  function clearDone() {
    const doneCount = todos.filter((t) => t.status === "done").length;
    if (doneCount === 0) return;
    if (!confirm(`Clear ${doneCount} done card${doneCount === 1 ? "" : "s"}?`))
      return;
    const prev = todos;
    setTodos((cur) => cur.filter((t) => t.status !== "done"));
    fetch("/api/todos", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    }).then((res) => {
      if (!res.ok) {
        setTodos(prev);
        setError("Couldn't clear the done cards.");
      }
    });
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col p-3 sm:p-5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h1 className="text-lg font-semibold sm:text-xl">The List</h1>
        <p className="text-xs text-neutral-500">
          A shared board — you both see and edit it.
        </p>
      </div>

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      {/* Columns scroll horizontally on a phone; all three fit on desktop. */}
      <div className="scrollbar-none -mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-4 sm:mx-0 sm:px-0">
        {TODO_COLUMNS.map((col, colIndex) => {
          const cards = byStatus[col.value];
          return (
            <section
              key={col.value}
              onDragOver={(e) => {
                if (dragId) {
                  e.preventDefault();
                  setDragOver(col.value);
                }
              }}
              onDragLeave={() => setDragOver((s) => (s === col.value ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId) moveTo(dragId, col.value);
                setDragId(null);
                setDragOver(null);
              }}
              className={`flex w-[82vw] max-w-[20rem] shrink-0 snap-start flex-col rounded-2xl border p-2 transition-colors sm:w-72 ${
                dragOver === col.value
                  ? "border-teal-500 bg-teal-50/60 dark:bg-teal-950/30"
                  : "border-black/10 bg-black/[0.02] dark:border-white/10 dark:bg-white/[0.03]"
              }`}
            >
              <div className="flex items-center gap-2 px-1 py-1.5">
                <span className={`h-2 w-2 rounded-full ${ACCENT[col.value]}`} />
                <h2 className="text-sm font-semibold">{col.label}</h2>
                <span className="ml-auto text-xs text-neutral-400">
                  {cards.length}
                </span>
                {col.value === "done" && cards.length > 0 && (
                  <button
                    type="button"
                    onClick={clearDone}
                    className="text-xs text-neutral-400 hover:text-red-600"
                  >
                    Clear
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-2">
                {cards.map((t) => (
                  <Card
                    key={t.id}
                    todo={t}
                    colIndex={colIndex}
                    lastColIndex={TODO_COLUMNS.length - 1}
                    people={people}
                    firstName={firstName}
                    isPending={t.id.startsWith("tmp-")}
                    onDragStart={() => setDragId(t.id)}
                    onDragEnd={() => {
                      setDragId(null);
                      setDragOver(null);
                    }}
                    onStep={step}
                    onToggleAssignee={toggleAssignee}
                    onEditTitle={editTitle}
                    onDelete={removeTodo}
                  />
                ))}

                {cards.length === 0 && (
                  <p className="rounded-xl border border-dashed border-black/10 px-3 py-4 text-center text-xs text-neutral-400 dark:border-white/10">
                    Nothing here
                  </p>
                )}
              </div>

              <AddCard onAdd={(title) => addTodo(col.value, title)} />
            </section>
          );
        })}
      </div>
    </main>
  );
}

function Card({
  todo,
  colIndex,
  lastColIndex,
  people,
  firstName,
  isPending,
  onDragStart,
  onDragEnd,
  onStep,
  onToggleAssignee,
  onEditTitle,
  onDelete,
}: {
  todo: Todo;
  colIndex: number;
  lastColIndex: number;
  people: Person[];
  firstName: Map<string, string>;
  isPending: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onStep: (id: string, dir: -1 | 1) => void;
  onToggleAssignee: (id: string, personId: string) => void;
  onEditTitle: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(todo.title);
  const done = todo.status === "done";

  return (
    <div
      draggable={!editing && !isPending}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`group rounded-xl border border-black/10 bg-white p-2.5 shadow-sm dark:border-white/10 dark:bg-neutral-900 ${
        isPending ? "opacity-60" : ""
      } ${!editing ? "sm:cursor-grab sm:active:cursor-grabbing" : ""}`}
    >
      {editing ? (
        <textarea
          autoFocus
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            setEditing(false);
            onEditTitle(todo.id, draft);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              (e.target as HTMLTextAreaElement).blur();
            } else if (e.key === "Escape") {
              setDraft(todo.title);
              setEditing(false);
            }
          }}
          className="w-full resize-none rounded-md border border-black/10 bg-transparent p-1 text-sm dark:border-white/10"
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setDraft(todo.title);
            setEditing(true);
          }}
          className={`block w-full text-left text-sm ${
            done ? "text-neutral-400 line-through" : ""
          }`}
        >
          {todo.title}
        </button>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1">
        {people.length === 0 && (
          <span className="text-[11px] text-neutral-400">No people yet</span>
        )}
        {people.map((p) => {
          const active = todo.assigneeUserIds.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onToggleAssignee(todo.id, p.id)}
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition ${
                active
                  ? "bg-teal-600 text-white"
                  : "border border-black/10 text-neutral-500 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
              }`}
              title={active ? `Unassign ${p.name}` : `Assign ${p.name}`}
            >
              {firstName.get(p.id) ?? p.name}
            </button>
          );
        })}

        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            aria-label="Move left"
            disabled={colIndex === 0}
            onClick={() => onStep(todo.id, -1)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-500 hover:bg-black/5 disabled:opacity-25 dark:hover:bg-white/10"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Move right"
            disabled={colIndex === lastColIndex}
            onClick={() => onStep(todo.id, 1)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-500 hover:bg-black/5 disabled:opacity-25 dark:hover:bg-white/10"
          >
            ›
          </button>
          <button
            type="button"
            aria-label="Delete"
            onClick={() => onDelete(todo.id)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-300 hover:bg-red-50 hover:text-red-600 dark:text-neutral-600 dark:hover:bg-red-950/40"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}

function AddCard({ onAdd }: { onAdd: (title: string) => void }) {
  const [text, setText] = useState("");

  function submit() {
    if (!text.trim()) return;
    onAdd(text);
    setText("");
  }

  return (
    <div className="mt-2 flex gap-1.5">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder="Add a card…"
        className="min-w-0 flex-1 rounded-lg border border-black/10 bg-transparent px-2.5 py-1.5 text-sm dark:border-white/10"
      />
      <button
        type="button"
        onClick={submit}
        disabled={!text.trim()}
        aria-label="Add card"
        className="shrink-0 rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-40"
      >
        Add
      </button>
    </div>
  );
}
