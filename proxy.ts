import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Customer-facing booking domain. On these hosts the ONLY thing reachable is
 * booking pages — meyouwhen.com/brainshed shows the "brainshed" link — never
 * the family app, its login or its APIs.
 */
const BOOKING_HOSTS = new Set(["meyouwhen.com", "www.meyouwhen.com"]);
const SLUG_PATH = /^\/([a-z0-9][a-z0-9-]{1,48}[a-z0-9])\/?$/;
const LEGACY_PATH = /^\/book\/([a-z0-9][a-z0-9-]{1,48}[a-z0-9])\/?$/;

function bookingHost(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // What a booking page itself needs: its booking API, Next's assets, icons.
  if (
    pathname.startsWith("/api/book/") ||
    pathname === "/api/waitlist" ||
    pathname.startsWith("/brand/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/icons/") ||
    pathname === "/apple-icon"
  ) {
    return NextResponse.next();
  }

  // Short customer links: /brainshed -> the /book/brainshed page.
  const slug = pathname.match(SLUG_PATH);
  if (slug) return NextResponse.rewrite(new URL(`/book/${slug[1]}`, request.url));

  // Old-style /book/<name> on this domain -> the short form.
  const legacy = pathname.match(LEGACY_PATH);
  if (legacy) return NextResponse.redirect(new URL(`/${legacy[1]}`, request.url), 308);

  // Home page, and anything else: the simple booking landing page.
  return NextResponse.rewrite(new URL("/book", request.url));
}

export async function proxy(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").toLowerCase().split(":")[0];
  if (BOOKING_HOSTS.has(host)) return bookingHost(request);
  return updateSession(request);
}

export const config = {
  matcher: [
    // Run on everything except Next internals and common static assets.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
