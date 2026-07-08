"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_NAME } from "@/lib/constants";
import CommentsNavBadge from "@/components/CommentsNavBadge";
import TodoNavBadge from "@/components/TodoNavBadge";

const LINKS = [
  { href: "/", label: "Calendar" },
  { href: "/plan", label: "Plan" },
  { href: "/school", label: "School" },
  { href: "/birthdays", label: "🎂 Birthdays" },
  { href: "/users", label: "People" },
  { href: "/settings", label: "Settings" },
];

export default function NavBar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header className="nav-safe sticky top-0 z-20 border-b border-black/10 bg-white/80 backdrop-blur dark:border-white/10 dark:bg-neutral-900/80">
      <div className="flex items-center gap-2 px-3 py-3 sm:px-4">
        <Link href="/" aria-label={APP_NAME} className="flex shrink-0 items-center gap-2 font-semibold">
          <span aria-hidden className="text-lg leading-none">
            📍
          </span>
          <span className="hidden whitespace-nowrap sm:inline">{APP_NAME}</span>
        </Link>

        {/* Desktop: full horizontal nav, all items always visible. */}
        <nav className="ml-2 hidden flex-1 items-center justify-end gap-0.5 text-sm sm:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="whitespace-nowrap rounded-lg px-2.5 py-1.5 hover:bg-black/5 dark:hover:bg-white/10"
            >
              {l.label}
            </Link>
          ))}
          <TodoNavBadge />
          <CommentsNavBadge />
          <form action="/auth/signout" method="post" className="shrink-0">
            <button className="whitespace-nowrap rounded-lg px-2.5 py-1.5 text-neutral-500 hover:bg-black/5 dark:hover:bg-white/10">
              Sign out
            </button>
          </form>
        </nav>

        {/* Mobile: a couple of high-frequency links stay visible, everything
            else lives behind the menu button so nothing is hidden off-screen
            in a scrolling strip with no visual hint it scrolls. */}
        <nav className="flex flex-1 items-center justify-end gap-0.5 text-sm sm:hidden">
          <Link
            href="/"
            className="whitespace-nowrap rounded-lg px-2.5 py-1.5 hover:bg-black/5 dark:hover:bg-white/10"
          >
            Calendar
          </Link>
          <TodoNavBadge />
          <CommentsNavBadge />
          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
          >
            <span aria-hidden className="text-lg leading-none">
              {open ? "✕" : "☰"}
            </span>
          </button>
        </nav>
      </div>

      {open && (
        <>
          <div
            className="fixed inset-0 z-10 bg-black/20 sm:hidden"
            onClick={() => setOpen(false)}
          />
          <nav className="relative z-20 border-t border-black/10 bg-white px-3 py-2 dark:border-white/10 dark:bg-neutral-900 sm:hidden">
            <ul className="flex flex-col">
              {LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className={`block rounded-lg px-3 py-2.5 text-sm ${
                      pathname === l.href
                        ? "bg-teal-600/10 font-medium text-teal-700 dark:text-teal-300"
                        : "hover:bg-black/5 dark:hover:bg-white/10"
                    }`}
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-1 border-t border-black/5 pt-1 dark:border-white/5">
              <form action="/auth/signout" method="post">
                <button className="block w-full rounded-lg px-3 py-2.5 text-left text-sm text-neutral-500 hover:bg-black/5 dark:hover:bg-white/10">
                  Sign out
                </button>
              </form>
            </div>
          </nav>
        </>
      )}
    </header>
  );
}
