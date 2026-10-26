import { createAdminClient } from "@/lib/supabase/admin";
import { verifyOrderProofToken } from "@/lib/auth/serverAuth";

type DbReadError = { code?: string | null; message?: string | null };
type PackingReservation = { order_id: string; variant_id: string; quantity: number };
type PackingVariant = {
  variant_id: string;
  name?: string | null;
  sku?: string | null;
  products?: { name?: string | null } | Array<{ name?: string | null }> | null;
};
type OrderItemRow = {
  order_item_id: string;
  product_id?: string | null;
  variant_id?: string | null;
  combo_id?: string | null;
  item_name_snapshot: string;
  variant_name_snapshot?: string | null;
  sku_snapshot?: string | null;
  quantity: number;
  unit_price: number;
  subtotal: number;
};
type OrderQueryRow = {
  order_id: string;
  order_code: string;
  receiver_name?: string | null;
  receiver_phone?: string | null;
  delivery_type?: string | null;
  shipping_address_snapshot?: string | null;
  subtotal: number;
  shipping_fee: number;
  voucher_discount: number;
  final_amount: number;
  order_status: string;
  payment_status: string;
  delivery_status: string;
  payment_method: string;
  customer_note?: string | null;
  internal_note?: string | null;
  assigned_shipper_id?: string | null;
  source_type?: string | null;
  introducer_info?: string | null;
  seller_id?: string | null;
  created_at: string;
  confirmed_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  customers?: { full_name?: string | null; phone?: string | null; email?: string | null } |
    Array<{ full_name?: string | null; phone?: string | null; email?: string | null }> | null;
  order_items?: OrderItemRow[] | null;
};

export function canExposeOrderPaymentProof(
  isAdmin: boolean,
  hasOrderBoundProof: boolean,
): boolean {
  return isAdmin || hasOrderBoundProof;
}

function isMissingPackingReservationTable(error: DbReadError | null | undefined): boolean {
  if (!error) return false;
  const message = String(error.message || "").toLowerCase();
  return (
    (error.code === "PGRST205" || error.code === "42P01") &&
    message.includes("order_inventory_reservations")
  );
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

/**
 * Fetch orders from Supabase.
 * - Admin: Full access with unmasked PII.
 * - Customer:
 *   - code + exact receiver phone, or an order-bound proof token.
 *   - code alone never returns an order.
 */
export async function getOrdersServer(options?: {
  code?: string;
  phone?: string;
  proofToken?: string;
  limit?: number;
  isAdmin?: boolean;
}) {
  try {
    const supabase = createAdminClient();
    const isAdmin = Boolean(options?.isAdmin);

    // 1. Unauthenticated users cannot query all orders or query by phone alone
    if (!isAdmin) {
      if (!options?.code || (!options?.phone && !options?.proofToken)) {
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
          product_id,
          variant_id,
          combo_id,
          item_name_snapshot,
          variant_name_snapshot,
          sku_snapshot,
          quantity,
          unit_price,
          subtotal
        )
      `)
      .order("created_at", { ascending: false });

    if (options?.code) {
      query = query.eq("order_code", options.code.trim().toUpperCase());
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[getOrdersServer] base-order-read-failed", { code: error.code || "unknown" });
      throw new Error("Không thể tải danh sách đơn hàng.");
    }

    const packingByOrder = new Map<string, Array<{
      variant_id: string;
      quantity: number;
      product_name: string;
      variant_name: string;
      sku: string | null;
    }>>();
    const orderIds = (data || []).map((row: OrderQueryRow) => row.order_id).filter(Boolean);

    if (orderIds.length > 0) {
      const reservationResult = await supabase
        .from("order_inventory_reservations")
        .select("order_id, variant_id, quantity")
        .in("order_id", orderIds);

      if (reservationResult.error) {
        if (isMissingPackingReservationTable(reservationResult.error)) {
          // Snapshots created before the packing-reservation migration still have
          // valid orders. Packing metadata is optional for this read path.
          console.warn("[getOrdersServer] packing-reservations-unavailable", {
            code: reservationResult.error.code || "unknown",
          });
        } else {
          console.error("[getOrdersServer] packing-reservation-read-failed", {
            code: reservationResult.error.code || "unknown",
          });
          throw new Error("Không thể tải dữ liệu đóng gói của đơn hàng.");
        }
      } else {
        const reservations = reservationResult.data || [];
        const variantIds = [...new Set(
          reservations.map((row: PackingReservation) => row.variant_id).filter(Boolean),
        )];
        const variantById = new Map<string, PackingVariant>();

        if (variantIds.length > 0) {
          const variantResult = await supabase
            .from("product_variants")
            .select("variant_id, name, sku, products(name)")
            .in("variant_id", variantIds);
          if (variantResult.error) {
            console.error("[getOrdersServer] packing-variant-read-failed", {
              code: variantResult.error.code || "unknown",
            });
            throw new Error("Không thể tải dữ liệu đóng gói của đơn hàng.");
          }
          for (const variant of variantResult.data || []) {
            variantById.set(variant.variant_id, variant);
          }
        }

        for (const reservation of reservations) {
          const variant = variantById.get(reservation.variant_id);
          const product = Array.isArray(variant?.products) ? variant.products[0] : variant?.products;
          const rows = packingByOrder.get(reservation.order_id) || [];
          rows.push({
            variant_id: reservation.variant_id,
            product_name: product?.name || "Sản phẩm",
            variant_name: variant?.name || "Phân loại",
            sku: variant?.sku || null,
            quantity: reservation.quantity,
          });
          packingByOrder.set(reservation.order_id, rows);
        }
      }
    }

    return (data || []).flatMap((sourceRow: OrderQueryRow) => {
      const customer = Array.isArray(sourceRow.customers) ? sourceRow.customers[0] : sourceRow.customers;
      const row = { ...sourceRow, customers: customer };
      const inputPhone = options?.phone?.replace(/\D/g, "") || "";
      const buyerPhone = String(customer?.phone || "").replace(/\D/g, "");
      const receiverPhone = String(row.receiver_phone || "").replace(/\D/g, "");
      const hasPhoneVerification = Boolean(
        inputPhone.length >= 9 && (inputPhone === buyerPhone || inputPhone === receiverPhone)
      );
      const hasProofVerification = Boolean(
        options?.proofToken && verifyOrderProofToken(options.proofToken, row.order_code, row.order_id)
      );
      if (!isAdmin && !hasPhoneVerification && !hasProofVerification) return [];

      const rawBuyerName = row.customers?.full_name || row.receiver_name || "Khách hàng";
      const rawBuyerPhone = row.customers?.phone || row.receiver_phone || "";
      const rawRecipientName = row.receiver_name || rawBuyerName;
      const rawRecipientPhone = row.receiver_phone || rawBuyerPhone;
      const rawAddress = row.shipping_address_snapshot || "";

      const shouldMask = !isAdmin && !hasPhoneVerification && !hasProofVerification;

      return [{
        order_id: row.order_id,
        order_code: row.order_code,
        buyer_name: shouldMask ? maskName(rawBuyerName) : rawBuyerName,
        buyer_phone: shouldMask ? maskPhoneStr(rawBuyerPhone) : rawBuyerPhone,
        buyer_email: shouldMask ? "" : (customer?.email || ""),
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
          return canExposeOrderPaymentProof(isAdmin, hasProofVerification) ? parsed : undefined;
        })(),
        has_payment_proof: Boolean(
          row.internal_note?.match(/\[Ảnh biên lai\]:\s*(https?:\/\/[^\s|]+|data:image\/[^\s|]+)/)?.[1] ||
          row.internal_note?.includes("[Khách đã nộp ảnh biên lai CK")
        ),
        seller_id: isAdmin ? (row.seller_id || null) : undefined,
        source_type: isAdmin ? (row.source_type || "landing_page") : undefined,
        introducer_info: isAdmin ? (row.introducer_info || null) : undefined,
        referral_code: isAdmin && row.seller_id ? (row.introducer_info?.match(/\(([^)]+)\)/)?.[1] || null) : undefined,
        assigned_shipper_id: isAdmin ? (row.assigned_shipper_id || null) : undefined,
        created_at: row.created_at,
        confirmed_at: row.confirmed_at,
        completed_at: row.completed_at,
        cancelled_at: row.cancelled_at,
        items: (row.order_items || []).map((it: OrderItemRow) => ({
          order_item_id: it.order_item_id,
          order_id: row.order_id,
          product_id: it.product_id ?? null,
          variant_id: it.variant_id ?? null,
          combo_id: it.combo_id ?? null,
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
        packing_items: isAdmin ? (packingByOrder.get(row.order_id) || []) : undefined,
      }];
    });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Không thể tải")) throw err;
    console.error("[getOrdersServer] unexpected-read-failure");
    throw new Error("Không thể tải danh sách đơn hàng.");
  }
}
