/**
 * Shown instantly while a page's server data loads, so tapping the nav
 * responds straight away instead of waiting on the whole page.
 */
export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="nav-safe sticky top-0 z-20 h-[57px] border-b border-black/10 bg-white/80 dark:border-white/10 dark:bg-neutral-900/80" />
      <div className="mx-auto max-w-5xl space-y-3 px-3 py-4 sm:px-4">
        <div className="h-8 w-48 rounded-lg bg-black/5 dark:bg-white/10" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl bg-black/5 dark:bg-white/10" />
        ))}
      </div>
    </div>
  );
}
