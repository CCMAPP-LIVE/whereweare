"use client";

import { useState } from "react";

export type KidLite = { id: string; name: string };

export default function KidsManager({ initialKids }: { initialKids: KidLite[] }) {
  const [kids, setKids] = useState<KidLite[]>(initialKids);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addKid() {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/kids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.kid) {
        setError(json?.error ?? "Couldn't add");
        return;
      }
      setKids((cur) => [...cur, { id: json.kid.id, name: json.kid.name }]);
      setNewName("");
    } finally {
      setSaving(false);
    }
  }

  async function renameKid(id: string, name: string) {
    setKids((cur) => cur.map((k) => (k.id === id ? { ...k, name } : k)));
    await fetch(`/api/kids/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
  }

  async function deleteKid(id: string) {
    if (!confirm("Remove this kid? Existing events will keep their titles but lose the kid tag."))
      return;
    setKids((cur) => cur.filter((k) => k.id !== id));
    await fetch(`/api/kids/${id}`, { method: "DELETE" });
  }

  return (
    <div className="space-y-2">
      {kids.length === 0 && (
        <p className="text-xs text-neutral-400">None yet.</p>
      )}
      <ul className="space-y-1.5">
        {kids.map((k) => (
          <li
            key={k.id}
            className="flex items-center gap-2 rounded-lg border border-black/10 px-2 py-1.5 dark:border-white/10"
          >
            <input
              value={k.name}
              onChange={(e) =>
                setKids((cur) =>
                  cur.map((x) => (x.id === k.id ? { ...x, name: e.target.value } : x)),
                )
              }
              onBlur={(e) => {
                const next = e.target.value.trim();
                if (next && next !== k.name) renameKid(k.id, next);
              }}
              className="flex-1 rounded-md bg-transparent px-1 py-0.5 text-sm focus:bg-black/5 dark:focus:bg-white/10"
            />
            <button
              onClick={() => deleteKid(k.id)}
              className="text-xs text-neutral-400 hover:text-red-600"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      <div className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addKid();
          }}
          placeholder="Add a kid's name…"
          className="flex-1 rounded-lg border border-black/10 bg-transparent px-2 py-1.5 text-sm dark:border-white/10"
        />
        <button
          onClick={addKid}
          disabled={saving || !newName.trim()}
          className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
        >
          Add
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
