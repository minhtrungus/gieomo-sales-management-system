const LEGACY_ORDER_CODE = /^GM-[A-Z0-9]{3,10}$/;
const CANONICAL_ORDER_CODE = /^GM-\d{6}-\d{6}$/;

export function normalizeOrderCode(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

/**
 * Accepted persisted identities:
 * - legacy clients/admin: GM-369817 (also older three-character sequences)
 * - atomic checkout writer: GM-YYMMDD-000001
 */
export function isSupportedOrderCode(value: string): boolean {
  return LEGACY_ORDER_CODE.test(value) || CANONICAL_ORDER_CODE.test(value);
}
