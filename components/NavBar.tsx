import Link from "next/link";
import { APP_NAME } from "@/lib/constants";

export default function NavBar() {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-black/10 bg-white/80 px-4 py-3 backdrop-blur dark:border-white/10 dark:bg-neutral-900/80">
      <Link href="/" className="flex items-center gap-2 font-semibold">
        <span aria-hidden>📍</span>
        <span>{APP_NAME}</span>
      </Link>
      <nav className="flex items-center gap-1 text-sm">
        <Link
          href="/"
          className="rounded-lg px-3 py-1.5 hover:bg-black/5 dark:hover:bg-white/10"
        >
          Calendar
        </Link>
        <Link
          href="/plan"
          className="rounded-lg px-3 py-1.5 hover:bg-black/5 dark:hover:bg-white/10"
        >
          Plan
        </Link>
        <Link
          href="/users"
          className="rounded-lg px-3 py-1.5 hover:bg-black/5 dark:hover:bg-white/10"
        >
          People
        </Link>
        <Link
          href="/settings"
          className="rounded-lg px-3 py-1.5 hover:bg-black/5 dark:hover:bg-white/10"
        >
          Settings
        </Link>
        <form action="/auth/signout" method="post">
          <button className="rounded-lg px-3 py-1.5 text-neutral-500 hover:bg-black/5 dark:hover:bg-white/10">
            Sign out
          </button>
        </form>
      </nav>
    </header>
  );
}
