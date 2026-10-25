import type { Order } from "@/types/database";

export type CanonicalOrderResult =
  | { kind: "verified"; order: Order }
  | { kind: "not_found" }
  | { kind: "reference_mismatch" }
  | { kind: "invalid_server_state" };

const PAYMENT_STATUSES = new Set(["pending", "paid", "failed", "refunded"]);
const PAYMENT_METHODS = new Set(["banking", "cod", "momo"]);

/**
 * Fail closed before rendering a payment result or QR from an API response.
 * Query-string amount/payment values are intentionally absent from this contract.
 */
export function resolveCanonicalSuccessOrder(
  requestedCode: string,
  candidates: unknown
): CanonicalOrderResult {
  if (!Array.isArray(candidates) || candidates.length === 0) return { kind: "not_found" };

  const exact = candidates.find((candidate) => {
    if (!candidate || typeof candidate !== "object") return false;
    const value = candidate as Partial<Order>;
    return value.order_code === requestedCode || value.order_id === requestedCode;
  }) as Partial<Order> | undefined;

  if (!exact) return { kind: "reference_mismatch" };

  const amount = Number(exact.final_amount);
  if (
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    !PAYMENT_STATUSES.has(String(exact.payment_status)) ||
    !PAYMENT_METHODS.has(String(exact.payment_method))
  ) {
    return { kind: "invalid_server_state" };
  }

  return { kind: "verified", order: exact as Order };
}
