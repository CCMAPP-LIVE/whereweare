"use client";

import { useState } from "react";

export type HelperLite = { id: string; name: string };

export default function HelpersManager({
  initialHelpers,
}: {
  initialHelpers: HelperLite[];
}) {
  const [helpers, setHelpers] = useState<HelperLite[]>(initialHelpers);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addHelper() {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/helpers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.helper) {
        setError(json?.error ?? "Couldn't add");
        return;
      }
      setHelpers((cur) => [...cur, { id: json.helper.id, name: json.helper.name }]);
      setNewName("");
    } finally {
      setSaving(false);
    }
  }

  async function renameHelper(id: string, name: string) {
    setHelpers((cur) => cur.map((h) => (h.id === id ? { ...h, name } : h)));
    await fetch(`/api/helpers/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
  }

  async function deleteHelper(id: string) {
    if (
      !confirm(
        "Remove this helper? Existing events will keep their titles but lose the helper tag.",
      )
    )
      return;
    setHelpers((cur) => cur.filter((h) => h.id !== id));
    await fetch(`/api/helpers/${id}`, { method: "DELETE" });
  }

  return (
    <div className="space-y-2">
      {helpers.length === 0 && <p className="text-xs text-neutral-400">None yet.</p>}
      <ul className="space-y-1.5">
        {helpers.map((h) => (
          <li
            key={h.id}
            className="flex items-center gap-2 rounded-lg border border-black/10 px-2 py-1.5 dark:border-white/10"
          >
            <input
              value={h.name}
              onChange={(e) =>
                setHelpers((cur) =>
                  cur.map((x) => (x.id === h.id ? { ...x, name: e.target.value } : x)),
                )
              }
              onBlur={(e) => {
                const next = e.target.value.trim();
                if (next && next !== h.name) renameHelper(h.id, next);
              }}
              className="flex-1 rounded-md bg-transparent px-1 py-0.5 text-sm focus:bg-black/5 dark:focus:bg-white/10"
            />
            <button
              onClick={() => deleteHelper(h.id)}
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
            if (e.key === "Enter") addHelper();
          }}
          placeholder="Add a helper's name…"
          className="flex-1 rounded-lg border border-black/10 bg-transparent px-2 py-1.5 text-sm dark:border-white/10"
        />
        <button
          onClick={addHelper}
          disabled={saving || !newName.trim()}
          className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
        >
          Add
        </button>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
