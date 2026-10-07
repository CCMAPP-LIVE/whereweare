/**
 * UK postcode helpers for the booking form's address fields. Dependency-free
 * so the browser form and the server share one format check.
 */

// Outward code (e.g. "BH23", "SW1A") + inward code ("1AB").
const UK_POSTCODE = /^([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})$/;

/** "bh231ab" -> "BH23 1AB"; null if it isn't shaped like a UK postcode. */
export function normaliseUkPostcode(input: string): string | null {
  const m = input.trim().toUpperCase().replace(/\s+/g, " ").match(UK_POSTCODE);
  return m ? `${m[1]} ${m[2]}` : null;
}

/**
 * Does this (already normalised) postcode actually exist? Uses the free
 * postcodes.io service. If it can't be reached we say yes — a well-formed
 * postcode shouldn't be refused because a third party is down.
 */
export async function isRealUkPostcode(postcode: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(
      `https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}/validate`,
      { signal: controller.signal, cache: "no-store" },
    );
    if (!res.ok) return true;
    const json = (await res.json()) as { result?: boolean };
    return json.result !== false;
  } catch {
    return true;
  } finally {
    clearTimeout(timer);
  }
}
