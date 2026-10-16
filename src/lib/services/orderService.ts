import { createAdminClient } from "@/lib/supabase/admin";
import { createOrderProofToken } from "@/lib/auth/serverAuth";
import { validateOrderCreateLines } from "@/lib/orderCreateInput";
import {
  buildCanonicalOrderPayload,
  buildOrderIdempotencyScope,
  hashCanonicalOrderPayload,
} from "@/lib/services/orderRequestHash";

/**
 * Server-Side Order Creation with Complete Price, Voucher, and Inventory Integrity.
 * Does NOT trust client-supplied amounts, prices, or statuses.
 */

export interface VoucherCasOps {
  readSnapshot(voucherId: string): Promise<{
    row: { times_used: unknown; usage_limit: unknown } | null;
    error: string | null;
  }>;
  casIncrement(voucherId: string, snapshot: number): Promise<{ rowsAffected: number | null; error: string | null }>;
  casDecrement(voucherId: string, snapshot: number): Promise<{ rowsAffected: number | null; error: string | null }>;
}

export type VoucherReserveOutcome =
  | { ok: true; timesUsed: number }
  | { ok: false; reason: "not_found" | "limit" | "contention" | "db_error"; errorMessage?: string };

const VOUCHER_RESERVE_MAX_ATTEMPTS = 5;
const VOUCHER_RELEASE_MAX_ATTEMPTS = 3;

function normalizeTimesUsed(value: unknown): number | null {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  return null;
}

type NormalizedUsageLimit = { kind: "unlimited" } | { kind: "limited"; value: number } | { kind: "invalid" };

function normalizeUsageLimit(value: unknown): NormalizedUsageLimit {
  if (value === null || value === undefined) return { kind: "unlimited" };
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return { kind: "limited", value };
  return { kind: "invalid" };
}

export async function reserveVoucherSlot(
  ops: VoucherCasOps,
  voucherId: string,
  maxAttempts: number = VOUCHER_RESERVE_MAX_ATTEMPTS
): Promise<VoucherReserveOutcome> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let snapshot: Awaited<ReturnType<VoucherCasOps["readSnapshot"]>>;
    try {
      snapshot = await ops.readSnapshot(voucherId);
    } catch (err) {
      return {
        ok: false,
        reason: "db_error",
        errorMessage: err instanceof Error ? err.message : "Không đọc được voucher",
      };
    }
    if (snapshot.error) return { ok: false, reason: "db_error", errorMessage: snapshot.error };
    if (!snapshot.row) return { ok: false, reason: "not_found" };

    const timesUsed = normalizeTimesUsed(snapshot.row.times_used);
    if (timesUsed === null) {
      return { ok: false, reason: "db_error", errorMessage: "times_used không hợp lệ" };
    }

    const limit = normalizeUsageLimit(snapshot.row.usage_limit);
    if (limit.kind === "invalid") {
      return { ok: false, reason: "db_error", errorMessage: "usage_limit không hợp lệ" };
    }
    if (limit.kind === "limited" && timesUsed >= limit.value) {
      return { ok: false, reason: "limit" };
    }

    let cas: { rowsAffected: number | null; error: string | null };
    try {
      cas = await ops.casIncrement(voucherId, timesUsed);
    } catch (err) {
      return {
        ok: false,
        reason: "db_error",
        errorMessage: err instanceof Error ? err.message : "Không cập nhật được voucher",
      };
    }
    if (cas.error) return { ok: false, reason: "db_error", errorMessage: cas.error };
    if (cas.rowsAffected === 1) return { ok: true, timesUsed };
    if (cas.rowsAffected === 0) continue;
    return { ok: false, reason: "db_error", errorMessage: "Không xác định được số hàng cập nhật khi giữ chỗ" };
  }
  return { ok: false, reason: "contention" };
}

export type VoucherReleaseOutcome = "released" | "not_found" | "invalid_counter" | "failed";

export async function releaseVoucherSlot(
  ops: VoucherCasOps,
  voucherId: string,
  maxAttempts: number = VOUCHER_RELEASE_MAX_ATTEMPTS
): Promise<VoucherReleaseOutcome> {
  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const snapshot = await ops.readSnapshot(voucherId);
      if (snapshot.error) {
        console.error("[createOrderServer] voucher-release-read-failed", { voucherId, attempt, error: snapshot.error });
        continue;
      }
      if (!snapshot.row) {
        console.warn("[createOrderServer] voucher-release-skipped", { voucherId, reason: "not_found" });
        return "not_found";
      }
      const timesUsed = normalizeTimesUsed(snapshot.row.times_used);
      if (timesUsed === null) {
        console.error("[createOrderServer] voucher-release-invalid-counter", {
          voucherId,
          value: snapshot.row.times_used,
        });
        return "invalid_counter";
      }
      if (timesUsed === 0) {
        console.error("[createOrderServer] voucher-release-invalid-counter", {
          voucherId,
          reason: "counter_already_zero",
        });
        return "invalid_counter";
      }
      const cas = await ops.casDecrement(voucherId, timesUsed);
      if (cas.error) {
        console.error("[createOrderServer] voucher-release-cas-failed", { voucherId, attempt, error: cas.error });
        continue;
      }
      if (cas.rowsAffected === 1) return "released";
      if (cas.rowsAffected === 0) continue;
      console.error("[createOrderServer] voucher-release-cas-failed", {
        voucherId,
        attempt,
        reason: "unknown_rows_affected",
      });
    }
    console.error("[createOrderServer] voucher-release-failed", { voucherId, attempts: maxAttempts });
    return "failed";
  } catch (err) {
    console.error("[createOrderServer] voucher-release-exception", {
      voucherId,
      error: err instanceof Error ? err.message : String(err),
    });
    return "failed";
  }
}

export function createVoucherCasOps(supabase: ReturnType<typeof createAdminClient>): VoucherCasOps {
  return {
    async readSnapshot(voucherId) {
      const { data, error } = await supabase
        .from("vouchers")
        .select("times_used, usage_limit")
        .eq("voucher_id", voucherId)
        .maybeSingle();
      if (error) return { row: null, error: error.message };
      if (data === null || data === undefined) return { row: null, error: null };
      if (typeof data !== "object") return { row: null, error: "Dữ liệu voucher không hợp lệ" };
      const record = data as { times_used?: unknown; usage_limit?: unknown };
      return { row: { times_used: record.times_used, usage_limit: record.usage_limit }, error: null };
    },
    async casIncrement(voucherId, snapshot) {
      const { data, error } = await supabase
        .from("vouchers")
        .update({ times_used: snapshot + 1 })
        .eq("voucher_id", voucherId)
        .eq("times_used", snapshot)
        .select("voucher_id");
      if (error) return { rowsAffected: null, error: error.message };
      if (Array.isArray(data)) return { rowsAffected: data.length, error: null };
      return { rowsAffected: null, error: "Phản hồi cập nhật giữ chỗ không hợp lệ" };
    },
    async casDecrement(voucherId, snapshot) {
      const { data, error } = await supabase
        .from("vouchers")
        .update({ times_used: snapshot - 1 })
        .eq("voucher_id", voucherId)
        .eq("times_used", snapshot)
        .gt("times_used", 0)
        .select("voucher_id");
      if (error) return { rowsAffected: null, error: error.message };
      if (Array.isArray(data)) return { rowsAffected: data.length, error: null };
      return { rowsAffected: null, error: "Phản hồi cập nhật giải phóng không hợp lệ" };
    },
  };
}

export interface OrderCreateInput {
  buyer_name?: string;
  buyer_phone?: string;
  buyer_email?: string | null;
  recipient_name?: string;
  recipient_phone?: string;
  delivery_type?: string;
  address_detail?: string;
  district?: string;
  province?: string;
  customer_note?: string;
  voucher_code?: string | null;
  referral_code?: string | null;
  seller_id?: string | null;
  introducer_info?: string;
  source_type?: string;
  payment_method?: string;
  idempotency_key?: string;
  items: Array<{
    product_id?: string;
    variant_id?: string | null;
    combo_id?: string | null;
    quantity: number;
  }>;
}

export interface CreateOrderResult {
  success: boolean;
  orderId?: string;
  orderCode?: string;
  finalAmount?: number;
  proofToken?: string;
  replayed?: boolean;
  conflict?: boolean;
  error?: string;
}

interface AtomicOrderRpcResult {
  outcome?: string;
  order_id?: string;
  order_code?: string;
  final_amount?: number | string;
  replayed?: boolean;
}

function orderRpcError(message: string): CreateOrderResult {
  if (message.includes("D3:HASH_MISMATCH")) {
    return {
      success: false,
      conflict: true,
      error: "Khóa gửi đơn này đã được dùng với nội dung khác. Vui lòng bắt đầu một đơn hàng mới.",
    };
  }

  const knownErrors: Record<string, string> = {
    "D3:INVALID_IDEMPOTENCY_KEY": "Khóa gửi đơn không hợp lệ. Vui lòng tải lại trang và thử lại.",
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
    "D3:COMBO_COMPONENTS_UNMAPPED": "Combo chưa được cấu hình đầy đủ thành phần tồn kho.",
    "D3:VOUCHER_UNAVAILABLE": "Voucher không hợp lệ, đã hết lượt hoặc chưa đủ điều kiện.",
    "D3:STOCK_INSUFFICIENT": "Sản phẩm không còn đủ tồn kho cho đơn hàng này.",
    "D3:INVALID_ACTOR": "Phiên người tạo đơn không còn hợp lệ.",
  };

  const match = Object.entries(knownErrors).find(([code]) => message.includes(code));
  return { success: false, error: match?.[1] || "Không thể tạo đơn hàng nguyên tử." };
}

export async function createOrderServer(
  orderInput: OrderCreateInput,
  identity?: { memberId?: string | null }
): Promise<CreateOrderResult> {
  const lineValidation = validateOrderCreateLines(orderInput);
  if (!lineValidation.ok) {
    return { success: false, error: lineValidation.error };
  }

  const idempotencyKey = orderInput.idempotency_key?.trim();
  if (!idempotencyKey || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
    return orderRpcError("D3:INVALID_IDEMPOTENCY_KEY");
  }

  const canonicalPayload = buildCanonicalOrderPayload({ ...orderInput }, lineValidation.items);
  const scopeKey = buildOrderIdempotencyScope(identity?.memberId, canonicalPayload.buyer_phone);
  const requestHash = hashCanonicalOrderPayload(canonicalPayload);
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
    if (error) return orderRpcError(error.message);

    const result = data as AtomicOrderRpcResult | null;
    if (
      result?.outcome !== "created" ||
      typeof result.order_id !== "string" ||
      typeof result.order_code !== "string"
    ) {
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
    };
  } catch (error) {
    return orderRpcError(error instanceof Error ? error.message : String(error));
  }
}

function maskName(name?: string | null): string {
  if (!name) return "Khách hàng";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 1) + "***";
  return parts.map((p, idx) => (idx === 0 || idx === parts.length - 1 ? p.slice(0, 1) + "***" : "***")).join(" ");
}

function maskPhoneStr(phone?: string | null): string {
  if (!phone) return "";
  const clean = phone.replace(/\D/g, "");
  if (clean.length < 7) return clean;
  return clean.slice(0, 3) + "****" + clean.slice(-3);
}

function maskAddressStr(addr?: string | null): string {
  if (!addr) return "";
  const parts = addr.split(",");
  if (parts.length <= 2) return "***";
  return `***, ${parts.slice(1).join(",").trim()}`;
}

export function canExposeOrderPaymentProof(isAdmin: boolean, hasPhoneVerification: boolean): boolean {
  return isAdmin || hasPhoneVerification;
}

/**
 * Fetch orders from Supabase.
 * - Admin: Full access with unmasked PII.
 * - Customer:
 *   - If both code and phone provided: verified match.
 *   - If only code provided: masked PII to prevent customer enumeration.
 *   - If only phone provided without code: rejected for unauthenticated users.
 */
export async function getOrdersServer(options?: {
  code?: string;
  phone?: string;
  limit?: number;
  isAdmin?: boolean;
}) {
  try {
    const supabase = createAdminClient();
    const isAdmin = Boolean(options?.isAdmin);

    // 1. Unauthenticated users cannot query all orders or query by phone alone
    if (!isAdmin) {
      if (!options?.code) {
        return [];
      }
    }

    let query = supabase
      .from("orders")
      .select(`
        order_id,
        order_code,
        receiver_name,
        receiver_phone,
        delivery_type,
        shipping_address_snapshot,
        subtotal,
        shipping_fee,
        voucher_discount,
        final_amount,
        order_status,
        payment_status,
        delivery_status,
        payment_method,
        customer_note,
        internal_note,
        assigned_shipper_id,
        source_type,
        introducer_info,
        seller_id,
        created_at,
        confirmed_at,
        completed_at,
        cancelled_at,
        customers (
          customer_id,
          full_name,
          phone,
          email
        ),
        order_items (
          order_item_id,
          item_name_snapshot,
          variant_name_snapshot,
          sku_snapshot,
          quantity,
          unit_price,
          subtotal
        ),
        order_inventory_reservations (
          variant_id,
          quantity,
          product_variants!variant_id (
            variant_id,
            name,
            sku,
            products!product_id (
              name
            )
          )
        )
      `)
      .order("created_at", { ascending: false });

    if (options?.code) {
      query = query.eq("order_code", options.code.trim().toUpperCase());
    }

    if (options?.phone) {
      const cleanPhone = options.phone.trim().replace(/\D/g, "");
      query = query.eq("receiver_phone", cleanPhone);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[getOrdersServer] DB Error:", error);
      // P0: throw instead of returning [] — an empty array is indistinguishable
      // from "no orders", which makes API clients wipe locally cached orders.
      throw new Error(`order_query_failed: ${error.message || "database error"}`);
    }

    const hasPhoneVerification = Boolean(options?.phone && options.phone.trim().length >= 9);

    return (data || []).map((row: any) => {
      const rawBuyerName = row.customers?.full_name || row.receiver_name || "Khách hàng";
      const rawBuyerPhone = row.customers?.phone || row.receiver_phone || "";
      const rawRecipientName = row.receiver_name || rawBuyerName;
      const rawRecipientPhone = row.receiver_phone || rawBuyerPhone;
      const rawAddress = row.shipping_address_snapshot || "";

      // If requester is not admin and has not verified phone match, mask PII
      const shouldMask = !isAdmin && !hasPhoneVerification;

      return {
        order_id: row.order_id,
        order_code: row.order_code,
        buyer_name: shouldMask ? maskName(rawBuyerName) : rawBuyerName,
        buyer_phone: shouldMask ? maskPhoneStr(rawBuyerPhone) : rawBuyerPhone,
        buyer_email: shouldMask ? "" : (row.customers?.email || ""),
        recipient_name: shouldMask ? maskName(rawRecipientName) : rawRecipientName,
        recipient_phone: shouldMask ? maskPhoneStr(rawRecipientPhone) : rawRecipientPhone,
        address_detail: shouldMask ? maskAddressStr(rawAddress) : rawAddress,
        delivery_type: row.delivery_type,
        subtotal: row.subtotal,
        shipping_fee: row.shipping_fee,
        voucher_discount: row.voucher_discount,
        final_amount: row.final_amount,
        order_status: row.order_status,
        payment_status: row.payment_status,
        delivery_status: row.delivery_status,
        payment_method: row.payment_method,
        customer_note: shouldMask ? undefined : row.customer_note,
        internal_note: isAdmin ? row.internal_note : undefined,
        payment_proof: (() => {
          const parsed = row.internal_note?.match(/\[Ảnh biên lai\]:\s*(https?:\/\/[^\s|]+|data:image\/[^\s|]+)/)?.[1] || null;
          return canExposeOrderPaymentProof(isAdmin, hasPhoneVerification) ? parsed : undefined;
        })(),
        has_payment_proof: Boolean(
          row.internal_note?.match(/\[Ảnh biên lai\]:\s*(https?:\/\/[^\s|]+|data:image\/[^\s|]+)/)?.[1] ||
          row.internal_note?.includes("[Khách đã nộp ảnh biên lai CK")
        ),
        seller_id: row.seller_id || null,
        source_type: row.source_type || "landing_page",
        introducer_info: row.introducer_info || null,
        referral_code: row.seller_id ? (row.introducer_info?.match(/\(([^)]+)\)/)?.[1] || null) : null,
        assigned_shipper_id: row.assigned_shipper_id || null,
        created_at: row.created_at,
        confirmed_at: row.confirmed_at,
        completed_at: row.completed_at,
        cancelled_at: row.cancelled_at,
        items: (row.order_items || []).map((it: any) => ({
          order_item_id: it.order_item_id,
          order_id: row.order_id,
          item_name_snapshot: it.item_name_snapshot,
          product_name_snapshot: it.item_name_snapshot,
          variant_name_snapshot: it.variant_name_snapshot ?? null,
          product_name: it.item_name_snapshot,
          variant_name: it.variant_name_snapshot,
          sku: it.sku_snapshot,
          sku_snapshot: it.sku_snapshot,
          quantity: it.quantity,
          unit_price: it.unit_price,
          price: it.unit_price,
          subtotal: it.subtotal,
        })),
        packing_items: (row.order_inventory_reservations || []).map((reservation: {
          variant_id: string;
          quantity: number;
          product_variants?: {
            name?: string | null;
            sku?: string | null;
            products?: { name?: string | null } | Array<{ name?: string | null }> | null;
          } | Array<{
            name?: string | null;
            sku?: string | null;
            products?: { name?: string | null } | Array<{ name?: string | null }> | null;
          }> | null;
        }) => {
          const variant = Array.isArray(reservation.product_variants)
            ? reservation.product_variants[0]
            : reservation.product_variants;
          const product = Array.isArray(variant?.products) ? variant.products[0] : variant?.products;
          return {
            variant_id: reservation.variant_id,
            product_name: product?.name || "Sản phẩm",
            variant_name: variant?.name || "Phân loại",
            sku: variant?.sku || null,
            quantity: reservation.quantity,
          };
        }),
      };
    });
  } catch (err) {
    console.error("[getOrdersServer] Exception:", err);
    // P0: rethrow so the API route returns success:false and clients
    // never treat a failed query as an empty order list.
    throw err;
  }
}
