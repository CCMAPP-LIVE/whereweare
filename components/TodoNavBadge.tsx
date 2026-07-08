"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const POLL_MS = 15000;

// Mirrors CommentsNavBadge: polls the open-card count and shows it on the
// "The List" nav link so the outstanding total is glanceable from anywhere.
export default function TodoNavBadge() {
  const [open, setOpen] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/todos/count");
        const json = await res.json();
        if (!cancelled && res.ok) setOpen(json.open as number);
      } catch {
        // ignore transient network errors — next poll retries
      }
    };
    load();
    const interval = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <Link
      href="/todos"
      className="flex items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-1.5 hover:bg-black/5 dark:hover:bg-white/10"
    >
      The List
      {open > 0 && (
        <span className="rounded-full bg-teal-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {open}
        </span>
      )}
    </Link>
  );
}
