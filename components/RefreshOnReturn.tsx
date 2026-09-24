"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * When you come back to the app (switch back to the tab / reopen the home-
 * screen app) after a minute or more, reload the page's data so new events
 * from Google / Outlook and the other person's changes show up.
 */
export default function RefreshOnReturn() {
  const router = useRouter();
  useEffect(() => {
    let hiddenAt = 0;
    const onChange = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 60_000) router.refresh();
    };
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, [router]);
  return null;
}
