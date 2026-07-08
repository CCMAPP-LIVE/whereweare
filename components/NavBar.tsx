import Link from "next/link";
import { APP_NAME } from "@/lib/constants";
import CommentsNavBadge from "@/components/CommentsNavBadge";
import TodoNavBadge from "@/components/TodoNavBadge";

export default function NavBar() {
  return (
    <header className="nav-safe sticky top-0 z-20 flex items-center gap-2 border-b border-black/10 bg-white/80 px-3 py-3 backdrop-blur dark:border-white/10 dark:bg-neutral-900/80 sm:px-4">
      {/* Logo hides on phones — the "Calendar" link below is the home affordance
          there, and dropping it frees the whole width for the nav. */}
      <Link
        href="/"
        aria-label={APP_NAME}
        className="hidden shrink-0 items-center gap-2 font-semibold sm:flex"
      >
        <span aria-hidden className="text-lg leading-none">
          📍
        </span>
        <span className="whitespace-nowrap">{APP_NAME}</span>
      </Link>
      {/* Horizontally scrollable so the links never overflow on a narrow phone. */}
      <nav className="scrollbar-none flex flex-1 items-center justify-between gap-0.5 overflow-x-auto text-sm sm:justify-end">
        <Link
          href="/"
          className="whitespace-nowrap rounded-lg px-2.5 py-1.5 hover:bg-black/5 dark:hover:bg-white/10"
        >
          Calendar
        </Link>
        <Link
          href="/plan"
          className="whitespace-nowrap rounded-lg px-2.5 py-1.5 hover:bg-black/5 dark:hover:bg-white/10"
        >
          Plan
        </Link>
        <Link
          href="/school"
          className="whitespace-nowrap rounded-lg px-2.5 py-1.5 hover:bg-black/5 dark:hover:bg-white/10"
        >
          School
        </Link>
        <Link
          href="/birthdays"
          className="whitespace-nowrap rounded-lg px-2.5 py-1.5 hover:bg-black/5 dark:hover:bg-white/10"
        >
          🎂 Birthdays
        </Link>
        <TodoNavBadge />
        <CommentsNavBadge />
        <Link
          href="/users"
          className="whitespace-nowrap rounded-lg px-2.5 py-1.5 hover:bg-black/5 dark:hover:bg-white/10"
        >
          People
        </Link>
        <Link
          href="/settings"
          className="whitespace-nowrap rounded-lg px-2.5 py-1.5 hover:bg-black/5 dark:hover:bg-white/10"
        >
          Settings
        </Link>
        <form action="/auth/signout" method="post" className="shrink-0">
          <button className="whitespace-nowrap rounded-lg px-2.5 py-1.5 text-neutral-500 hover:bg-black/5 dark:hover:bg-white/10">
            Sign out
          </button>
        </form>
      </nav>
    </header>
  );
}
