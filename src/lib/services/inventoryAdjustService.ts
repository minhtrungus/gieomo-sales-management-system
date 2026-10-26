/**
 * Batch 2G — điều chỉnh tồn kho SERVER-AUTHORITATIVE (relative delta,
 * idempotent) qua RPC adjust_variant_stock (migration 019).
 *
 * Thay thế nhánh absolute `stockAdjustment` cũ của /api/inventory
 * (đã gỡ — nó ghi đè mất lượt trừ của order RPC và target products.stock
 * không tồn tại). Client KHÔNG BAO GIỜ gửi absolute stock — chỉ delta.
 *
 * Lớp bảo vệ:
 *   1) DB (migration 019): unique index uq_inventory_adjustments_idempotency_key
 *      + guard stock + delta >= 0 trong RPC, cùng transaction.
 *   2) Ứng dụng: validate payload, map outcome → HTTP fail-closed
 *      (KHÔNG BAO GIỜ trả success giả cho lỗi RPC).
 */

export type AdjustStockInput = {
  variantId: string;
  delta: number;
  reason: string;
  idempotencyKey: string;
  /** Chỉ server mới set (từ session admin) — KHÔNG nhận từ client payload. */
  actorMemberId?: string | null;
};

export type AdjustStockStatus =
  | "applied"
  | "duplicate"
  | "not_found"
  | "insufficient_stock"
  | "idempotency_mismatch"
  | "rpc_unavailable"
  | "invalid"
  | "error";

export type AdjustStockResult = {
  status: AdjustStockStatus;
  /** true CHỈ khi chính call này áp dụng điều chỉnh mới */
  applied: boolean;
  /** true khi key đã dùng trước đó (retry/duplicate — không áp dụng lại) */
  duplicate: boolean;
  stockBefore: number | null;
  stockAfter: number | null;
  message: string;
  retryable: boolean;
};

/** Tên unique constraint do migration 019 tạo (filter 23505 — fail-closed). */
export const ADJUST_LEDGER_CONSTRAINT = "uq_inventory_adjustments_idempotency_key";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_REASON_LEN = 200;
const MAX_KEY_LEN = 128;
const MAX_ABS_DELTA = 1_000_000;

type RpcError = { code?: string; message?: string; details?: string };

type SupabaseLike = {
  rpc(
    name: string,
    args: Record<string, unknown>
  ): PromiseLike<{ data: unknown; error: RpcError | null }>;
};

export type AdjustStockValidation =
  | { ok: true; input: AdjustStockInput }
  | { ok: false; message: string };

/**
 * Validate payload client (route). Không tin client — kể cả idempotencyKey
 * (trim, độ dài). actorMemberId do route lấy từ session, không lấy từ body.
 */
export function validateAdjustStockInput(body: unknown): AdjustStockValidation {
  if (!body || typeof body !== "object") {
    return { ok: false, message: "Payload không hợp lệ" };
  }
  const b = body as Record<string, unknown>;

  const variantId = typeof b.variantId === "string" ? b.variantId.trim() : "";
  if (!UUID_RE.test(variantId)) {
    return { ok: false, message: "variantId phải là UUID hợp lệ" };
  }

  const deltaRaw = b.delta;
  if (typeof deltaRaw !== "number" || !Number.isInteger(deltaRaw) || deltaRaw === 0) {
    return { ok: false, message: "delta phải là số nguyên khác 0" };
  }
  if (Math.abs(deltaRaw) > MAX_ABS_DELTA) {
    return { ok: false, message: `delta vượt giới hạn cho phép (±${MAX_ABS_DELTA})` };
  }

  const reason = typeof b.reason === "string" ? b.reason.trim() : "";
  if (!reason || reason.length > MAX_REASON_LEN) {
    return { ok: false, message: `reason phải từ 1-${MAX_REASON_LEN} ký tự` };
  }

  const idempotencyKey = typeof b.idempotencyKey === "string" ? b.idempotencyKey.trim() : "";
  if (!idempotencyKey || idempotencyKey.length > MAX_KEY_LEN) {
    return { ok: false, message: `idempotencyKey phải từ 1-${MAX_KEY_LEN} ký tự` };
  }

  return {
    ok: true,
    input: {
      variantId: variantId.toLowerCase(),
      delta: deltaRaw,
      reason,
      idempotencyKey,
      actorMemberId: null,
    },
  };
}

function isLedgerUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  if (e.code !== "23505") return false;
  const msg = typeof e.message === "string" ? e.message : "";
  return msg.includes(ADJUST_LEDGER_CONSTRAINT);
}

function isFunctionMissing(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  if (e.code === "PGRST202") return true;
  const msg = typeof e.message === "string" ? e.message : "";
  return /could not find the function public\.adjust_variant_stock/i.test(msg);
}

function toNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Gọi RPC adjust_variant_stock và map outcome → AdjustStockResult.
 * Lỗi/contract lạ KHÔNG BAO GIỜ được coi là thành công.
 */
export async function executeStockAdjustment(
  supabase: SupabaseLike,
  input: AdjustStockInput
): Promise<AdjustStockResult> {
  let data: unknown = null;
  let error: RpcError | null = null;
  try {
    ({ data, error } = await supabase.rpc("adjust_variant_stock", {
      p_variant_id: input.variantId,
      p_delta: input.delta,
      p_reason: input.reason,
      p_idempotency_key: input.idempotencyKey,
      p_actor_member_id: input.actorMemberId ?? null,
    }));
  } catch (caught: unknown) {
    const err = caught as { message?: string } | null;
    return {
      status: "error",
      applied: false,
      duplicate: false,
      stockBefore: null,
      stockAfter: null,
      message: err?.message || "Không gọi được adjust_variant_stock",
      retryable: true,
    };
  }

  if (error) {
    if (isLedgerUniqueViolation(error)) {
      // 2 request đồng thời cùng key, khác variant — cả tx rollback
      // (at-most-once giữ nguyên) → fail-closed, không tái sử dụng kết quả.
      return {
        status: "idempotency_mismatch",
        applied: false,
        duplicate: false,
        stockBefore: null,
        stockAfter: null,
        message: "idempotencyKey đã được dùng đồng thời cho một điều chỉnh khác — thao tác bị hủy an toàn",
        retryable: false,
      };
    }
    const details = String((error as { details?: string }).details || "");
    if (details.includes("B2G:IDEMPOTENCY_PAYLOAD_MISMATCH")) {
      return {
        status: "idempotency_mismatch",
        applied: false,
        duplicate: false,
        stockBefore: null,
        stockAfter: null,
        message: "idempotencyKey đã dùng cho điều chỉnh khác — không tái sử dụng",
        retryable: false,
      };
    }
    if (details.includes("B2G:INVALID_ARGUMENTS")) {
      return {
        status: "invalid",
        applied: false,
        duplicate: false,
        stockBefore: null,
        stockAfter: null,
        message: error.message || "Dữ liệu điều chỉnh không hợp lệ",
        retryable: false,
      };
    }
    if (isFunctionMissing(error)) {
      return {
        status: "rpc_unavailable",
        applied: false,
        duplicate: false,
        stockBefore: null,
        stockAfter: null,
        message: "RPC adjust_variant_stock chưa tồn tại — cần apply migration 019 trước khi điều chỉnh tồn kho server",
        retryable: true,
      };
    }
    return {
      status: "error",
      applied: false,
      duplicate: false,
      stockBefore: null,
      stockAfter: null,
      message: error.message || "Lỗi điều chỉnh tồn kho",
      retryable: true,
    };
  }

  if (!data || typeof data !== "object") {
    return {
      status: "error",
      applied: false,
      duplicate: false,
      stockBefore: null,
      stockAfter: null,
      message: "Kết quả không hợp lệ từ adjust_variant_stock",
      retryable: true,
    };
  }

  const r = data as Record<string, unknown>;
  const outcome = typeof r.outcome === "string" ? r.outcome : "";
  const stockBefore = toNum(r.stockBefore);
  const stockAfter = toNum(r.stockAfter);

  if (outcome === "applied") {
    return {
      status: "applied",
      applied: true,
      duplicate: false,
      stockBefore,
      stockAfter,
      message: "Đã áp dụng điều chỉnh tồn kho",
      retryable: false,
    };
  }
  if (outcome === "duplicate") {
    return {
      status: "duplicate",
      applied: false,
      duplicate: true,
      stockBefore,
      stockAfter,
      message: "Điều chỉnh đã được áp dụng trước đó (idempotent)",
      retryable: false,
    };
  }
  if (outcome === "not_found") {
    return {
      status: "not_found",
      applied: false,
      duplicate: false,
      stockBefore: null,
      stockAfter: null,
      message: "Không tìm thấy biến thể sản phẩm",
      retryable: false,
    };
  }
  if (outcome === "insufficient_stock") {
    return {
      status: "insufficient_stock",
      applied: false,
      duplicate: false,
      stockBefore,
      stockAfter: null,
      message: `Tồn kho không đủ (còn ${stockBefore ?? "?"}, delta ${input.delta})`,
      retryable: false,
    };
  }

  // Contract không xác định — KHÔNG BAO GIỜ trả success giả
  return {
    status: "error",
    applied: false,
    duplicate: false,
    stockBefore: null,
    stockAfter: null,
    message: `Kết quả không hợp lệ từ adjust_variant_stock: ${outcome || "empty"}`,
    retryable: true,
  };
}

export type AdjustStockHttpResult =
  | { ok: true; result: AdjustStockResult }
  | { ok: false; message: string };

/**
 * Client (browser) — gửi adjustStock lên /api/inventory.
 * HTTP 200 với outcome duplicate được coi là ok (idempotent).
 * Network/parse lỗi throw → caller GIỮ NGUYÊN idempotencyKey để retry.
 */
export async function postAdjustStock(input: {
  variantId: string;
  delta: number;
  reason: string;
  idempotencyKey: string;
}): Promise<AdjustStockHttpResult> {
  let res: Response;
  try {
    res = await fetch("/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "adjustStock",
        variantId: input.variantId,
        delta: input.delta,
        reason: input.reason,
        idempotencyKey: input.idempotencyKey,
      }),
    });
  } catch {
    // Network/timeout — kết quả KHÔNG xác định: caller retry cùng key
    throw new Error(
      "Không kết nối được máy chủ — điều chỉnh CHƯA được ghi nhận. Bấm thử lại (sẽ dùng cùng mã thao tác)."
    );
  }

  let parsedBody: unknown = null;
  try {
    parsedBody = await res.json();
  } catch {
    throw new Error(
      "Phản hồi máy chủ không hợp lệ — kết quả KHÔNG xác định. Bấm thử lại (sẽ dùng cùng mã thao tác)."
    );
  }

  // Map body → AdjustStockResult (server đã classify; tôn trọng outcome)
  const body = parsedBody && typeof parsedBody === "object"
    ? parsedBody as Record<string, unknown>
    : {};
  const outcome = typeof body.outcome === "string" ? body.outcome : "";
  if (res.ok && (outcome === "applied" || outcome === "duplicate")) {
    return {
      ok: true,
      result: {
        status: outcome,
        applied: outcome === "applied",
        duplicate: outcome === "duplicate",
        stockBefore: toNum(body.stockBefore),
        stockAfter: toNum(body.stockAfter),
        message: typeof body.message === "string" ? body.message : "",
        retryable: false,
      },
    };
  }

  const message =
    typeof body.error === "string" && body.error
      ? body.error
      : `Điều chỉnh thất bại (HTTP ${res.status})`;
  return { ok: false, message };
}
