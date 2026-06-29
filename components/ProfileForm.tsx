"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ProfileForm({
  userId,
  initialName,
}: {
  userId: string;
  initialName: string;
}) {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: name })
      .eq("id", userId);
    setSaving(false);
    if (!error) setSaved(true);
    else alert(error.message);
  }

  return (
    <form onSubmit={save} className="flex items-center gap-2">
      <input
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setSaved(false);
        }}
        placeholder="Your name (e.g. David)"
        className="flex-1 rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
      />
      <button
        disabled={saving}
        className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save"}
      </button>
      {saved && <span className="text-sm text-teal-600">✓</span>}
    </form>
  );
}
