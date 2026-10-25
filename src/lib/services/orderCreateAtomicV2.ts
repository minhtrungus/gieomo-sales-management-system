import { createAdminClient } from "@/lib/supabase/admin";
import { createOrderProofToken } from "@/lib/auth/serverAuth";
import { validateOrderCreateLines } from "@/lib/orderCreateInput";
import {
  buildCanonicalOrderPayloadV2,
  buildOrderIdempotencyScopeV2,
  hashCanonicalOrderPayloadV2,
} from "@/lib/services/orderRequestHashV2";

export interface AtomicOrderCreateInput extends Record<string, unknown> {
  idempotency_key?: string;
  items: Array<{
    product_id?: string;
    variant_id?: string | null;
    combo_id?: string | null;
    quantity: number;
  }>;
}

export type AtomicOrderCreateResult = {
  success: boolean;
  orderId?: string;
  orderCode?: string;
  finalAmount?: number;
  proofToken?: string;
  replayed?: boolean;
  error?: string;
  idempotency?:
    | "created"
    | "replayed"
    | "processing"
    | "hash_mismatch"
    | "failed_terminal"
    | "needs_reconciliation"
    | "replay_cancelled";
};

type RpcResult = {
  outcome?: string;
  order_id?: string;
  order_code?: string;
  final_amount?: number | string;
  replayed?: boolean;
};

const MIGRATION_MISSING_ERROR =
  "Chức năng tạo đơn nguyên tử chưa được áp dụng (cần migration 025). Vui lòng thử lại sau hoặc liên hệ quản trị.";

function rpcError(message: string): AtomicOrderCreateResult {
  if (/could not find the function|PGRST202|42883/i.test(message)) {
    return { success: false, error: MIGRATION_MISSING_ERROR };
  }
  if (message.includes("D3:HASH_MISMATCH")) {
    return {
      success: false,
      idempotency: "hash_mismatch",
      error: "Khóa gửi đơn đã được dùng với nội dung khác.",
    };
  }
  if (message.includes("D3:IN_PROGRESS")) {
    return { success: false, idempotency: "processing", error: "Đơn hàng đang được xử lý." };
  }

  const knownErrors: Record<string, string> = {
    "D3:INVALID_IDEMPOTENCY_KEY": "Khóa gửi đơn không hợp lệ.",
    "D3:INVALID_SCOPE": "Phạm vi idempotency không hợp lệ.",
    "D3:INVALID_REQUEST_HASH": "Dấu vân tay yêu cầu không hợp lệ.",
    "D3:INVALID_ITEMS": "Giỏ hàng không có sản phẩm hợp lệ.",
    "D3:INVALID_PHONE": "Số điện thoại người nhận không hợp lệ.",
    "D3:INVALID_DELIVERY_TYPE": "Hình thức giao hàng không hợp lệ.",
    "D3:INVALID_PAYMENT_METHOD": "Phương thức thanh toán không hợp lệ.",
    "D3:INVALID_QUANTITY": "Số lượng sản phẩm không hợp lệ.",
    "D3:INVALID_LINE_IDENTITY": "Một dòng sản phẩm có định danh không hợp lệ.",
    "D3:INVALID_PRODUCT": "Một sản phẩm không còn kinh doanh.",
    "D3:INVALID_VARIANT": "Một phân loại sản phẩm không còn kinh doanh.",
    "D3:VARIANT_PRODUCT_MISMATCH": "Phân loại sản phẩm không thuộc sản phẩm đã chọn.",
    "D3:INVALID_COMBO": "Một combo không còn kinh doanh.",
    "D3:INVALID_COMBO_COMPONENT": "Một thành phần combo không còn kinh doanh.",
    "D3:COMBO_COMPONENTS_UNMAPPED": "Combo chưa được cấu hình đầy đủ tồn kho.",
    "D3:VOUCHER_UNAVAILABLE": "Voucher không hợp lệ, đã hết lượt hoặc chưa đủ điều kiện.",
    "D3:STOCK_INSUFFICIENT": "Sản phẩm không còn đủ tồn kho.",
    "D3:INVALID_ACTOR": "Phiên người tạo đơn không còn hợp lệ.",
  };
  const match = Object.entries(knownErrors).find(([code]) => message.includes(code));
  return {
    success: false,
    idempotency: match ? "failed_terminal" : undefined,
    error: match?.[1] || "Không thể tạo đơn hàng nguyên tử.",
  };
}

export async function createOrderServerAtomicV2(
  orderInput: AtomicOrderCreateInput,
  identity?: { memberId?: string | null }
): Promise<AtomicOrderCreateResult> {
  const lineValidation = validateOrderCreateLines(orderInput);
  if (!lineValidation.ok) {
    return { success: false, idempotency: "failed_terminal", error: lineValidation.error };
  }

  const idempotencyKey = orderInput.idempotency_key?.trim();
  if (!idempotencyKey || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
    return rpcError("D3:INVALID_IDEMPOTENCY_KEY");
  }

  const canonicalPayload = buildCanonicalOrderPayloadV2(orderInput, lineValidation.items);
  const scopeKey = buildOrderIdempotencyScopeV2(identity?.memberId, canonicalPayload.buyer_phone);
  const requestHash = hashCanonicalOrderPayloadV2(canonicalPayload);
  const rpcPayload = {
    ...canonicalPayload,
    idempotency_key: idempotencyKey,
    scope_key: scopeKey,
    request_hash: requestHash,
    actor_member_id: identity?.memberId ?? null,
  };

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("create_order_atomic", { p: rpcPayload });
    if (error) return rpcError(error.message);

    const result = data as RpcResult | null;
    if (result?.outcome !== "created" || typeof result.order_id !== "string" || typeof result.order_code !== "string") {
      return { success: false, error: "Máy chủ không trả về kết quả tạo đơn hợp lệ." };
    }
    const finalAmount = Number(result.final_amount);
    if (!Number.isFinite(finalAmount) || finalAmount < 0) {
      return { success: false, error: "Máy chủ trả về tổng tiền không hợp lệ." };
    }
    return {
      success: true,
      orderId: result.order_id,
      orderCode: result.order_code,
      finalAmount,
      proofToken: createOrderProofToken(result.order_code, result.order_id),
      replayed: result.replayed === true,
      idempotency: result.replayed === true ? "replayed" : "created",
    };
  } catch (error) {
    return rpcError(error instanceof Error ? error.message : String(error));
  }
}

