"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const POLL_MS = 15000;

export default function CommentsNavBadge() {
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/messages/unread");
        const json = await res.json();
        if (!cancelled && res.ok) setTotal(json.total as number);
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
      href="/comments"
      className="flex items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-1.5 hover:bg-black/5 dark:hover:bg-white/10"
    >
      Comments
      {total > 0 && (
        <span className="rounded-full bg-teal-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {total}
        </span>
      )}
    </Link>
  );
}
