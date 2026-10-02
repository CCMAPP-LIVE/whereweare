/**
 * An account's logo, or a coloured initials badge when none is uploaded.
 * Fixed height with natural width, so wide wordmarks (like Brainshed's) and
 * square marks both fit. Plain <img>: logos come from Supabase storage and
 * are tiny, so the Next image optimiser would add a hop for no benefit.
 */
export default function AccountLogo({
  logoUrl,
  email,
  size = "md",
}: {
  logoUrl: string | null;
  email: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const h = size === "lg" ? "h-12" : size === "md" ? "h-8" : "h-6";
  const maxW = size === "lg" ? "max-w-[260px]" : size === "md" ? "max-w-[160px]" : "max-w-[110px]";

  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoUrl} alt="" className={`${h} ${maxW} w-auto shrink-0 object-contain`} />
    );
  }

  // "david@brainshed.ai" -> "B"
  const label = (email?.split("@")[1] ?? email ?? "?").charAt(0).toUpperCase();
  const box = size === "lg" ? "h-12 w-12 text-xl" : size === "md" ? "h-8 w-8 text-sm" : "h-6 w-6 text-xs";
  return (
    <span
      aria-hidden
      className={`${box} flex shrink-0 items-center justify-center rounded-lg bg-teal-600 font-semibold text-white`}
    >
      {label}
    </span>
  );
}
