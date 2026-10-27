import { isSupportedOrderCode, normalizeOrderCode } from "../orders/orderCode.ts";

const CANONICAL_REFERENCE = /(?:^|[^A-Z0-9])GM[\s_-]*(\d{6})[\s_-]*(\d{6})(?![A-Z0-9])/gi;
const LEGACY_REFERENCE = /(?:^|[^A-Z0-9])GM[\s_-]*([A-Z0-9]{3,10})(?![A-Z0-9_-])/gi;

/**
 * Extract persisted order identities from a bank transfer description.
 * Separators may differ, but callers still resolve candidates by exact DB
 * equality and reject ambiguous descriptions; fuzzy matching is never used.
 */
export function extractOrderCodeCandidates(value: unknown): string[] {
  if (typeof value !== "string") return [];
  const text = value.normalize("NFKC").toUpperCase();
  const candidates = new Set<string>();
  const canonicalRanges: Array<[number, number]> = [];

  for (const match of text.matchAll(CANONICAL_REFERENCE)) {
    candidates.add(`GM-${match[1]}-${match[2]}`);
    canonicalRanges.push([match.index, match.index + match[0].length]);
  }
  const legacyText = canonicalRanges.reduce(
    (current, [start, end]) => current.slice(0, start) + " ".repeat(end - start) + current.slice(end),
    text,
  );
  for (const match of legacyText.matchAll(LEGACY_REFERENCE)) {
    const candidate = `GM-${match[1]}`;
    if (isSupportedOrderCode(candidate)) candidates.add(candidate);
  }
  return [...candidates];
}

export function normalizePersistedOrderCode(value: unknown): string | null {
  const normalized = normalizeOrderCode(value);
  return isSupportedOrderCode(normalized) ? normalized : null;
}
