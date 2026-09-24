"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Stash shared text for QuickAddChat (which opens pre-filled) and go home. */
export default function ShareToQuickAdd({ text }: { text: string }) {
  const router = useRouter();
  useEffect(() => {
    try {
      if (text.trim()) sessionStorage.setItem("wwa-quickadd-share", text);
    } catch {
      /* storage blocked — just go home */
    }
    router.replace("/");
  }, [text, router]);
  return <p className="p-6 text-sm text-neutral-500">Opening Quick add…</p>;
}
