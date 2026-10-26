import { createAdminClient } from "@/lib/supabase/admin";

type CatalogVariantRow = {
  variant_id: string;
  product_id: string;
  name: string;
  sku: string | null;
  price: number | null;
  stock: number;
};

type CatalogProductRow = { product_id: string; name: string; status: string };

type PaymentRow = {
  payment_id: string;
  order_id: string;
  amount: number;
  payment_method: string;
  payment_status?: string | null;
  status?: string | null;
  transaction_code?: string | null;
  created_at: string;
};

type LightweightOrderItem = {
  order_item_id: string;
  product_id?: string | null;
  variant_id?: string | null;
  combo_id?: string | null;
  quantity: number;
  variant_name_snapshot?: string | null;
  item_name_snapshot?: string | null;
  sku_snapshot?: string | null;
  unit_price?: number | null;
  subtotal?: number | null;
};

type LightweightOrder = {
  order_id: string;
  order_code: string;
  created_at: string;
  order_status: string;
  payment_status: string;
  delivery_status: string;
  receiver_name: string;
  receiver_phone: string;
  subtotal: number;
  shipping_fee: number;
  voucher_discount: number;
  final_amount: number;
  customer_note?: string | null;
  internal_note?: string | null;
  order_items?: LightweightOrderItem[] | null;
};

type DetailedOrderItem = LightweightOrderItem & {
  item_name_snapshot?: string | null;
};

type DetailedOrder = {
  order_id: string;
  shipping_address_snapshot?: string | null;
  customers?: { email?: string | null } | null;
  order_items?: DetailedOrderItem[] | null;
};

// In-memory catalog cache for 3-way reconciliation (TTL 30s)
let catalogMemoryCache: {
  variants: CatalogVariantRow[];
  products: CatalogProductRow[];
  timestamp: number;
} | null = null;
const CATALOG_CACHE_TTL_MS = 30_000;

/**
 * Batch 3B — reset catalog cache (tests / force refresh).
 * Mirror pattern resetPaymentConfirmInFlight: module-level cache cần
 * reset giữa các test để mỗi test kiểm thử được query thật, không
 * vô tình đọc cache 30s của test trước.
 */
export function resetReconciliationCatalogCache(): void {
  catalogMemoryCache = null;
}

// Batch 3C — pagination bounds + payments chunking.
// limit được clamp server-side: hợp lệ trong [1, MAX_PAGE_SIZE], sai/không
// có → DEFAULT_PAGE_SIZE. offset âm/không số → 0.
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 200;
// Chunk `.in("order_id", ids)` để tránh URL overflow (PostgREST query string)
// khi số orders lớn — mỗi chunk tối đa PAYMENTS_CHUNK_SIZE IDs.
const PAYMENTS_CHUNK_SIZE = 500;
// Batch C — số samples orphan payment trả về trong summary (payload ổn định).
const ORPHAN_PAYMENT_SAMPLE_LIMIT = 20;

function clampPagination(limit?: number, offset?: number): { limit: number; offset: number } {
  const parsedLimit = Number(limit);
  const limitOut =
    Number.isFinite(parsedLimit) && parsedLimit >= 1
      ? Math.min(Math.floor(parsedLimit), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;
  const parsedOffset = Number(offset);
  const offsetOut =
    Number.isFinite(parsedOffset) && parsedOffset >= 0 ? Math.floor(parsedOffset) : 0;
  return { limit: limitOut, offset: offsetOut };
}

/**
 * Batch 3C — Phase B enrich: merge chi tiết hiển thị (customer email,
 * shipping address, item snapshots đầy đủ) vào record đã classify ở Phase A.
 *
 * Inventory state/note/stock GIỮ NGUYÊN từ Phase A — KHÔNG classify lại
 * trong Phase B (tránh drift nếu catalog cache 30s refresh giữa hai query
 * của cùng một request; classification chỉ chạy một lần trên dữ liệu
 * lightweight nhưng đủ cột để verdict).
 */
function enrichRecordWithDetails(
  rec: ReconciliationRecord,
  detail: DetailedOrder | undefined
): ReconciliationRecord {
  if (!detail) {
    // Race hiếm: order bị xóa giữa Phase A và Phase B — giữ record
    // lightweight (đã classify đủ) thay vì drop khỏi trang.
    return rec;
  }
  const invByItemId = new Map(rec.items.map((i) => [i.order_item_id, i]));
  const fullItems: ReconciliationItemBreakdown[] = (detail.order_items || []).map((it) => {
    const inv = invByItemId.get(it.order_item_id);
    return {
      order_item_id: it.order_item_id,
      product_id: it.product_id,
      variant_id: it.variant_id,
      combo_id: it.combo_id,
      item_name: it.item_name_snapshot || "Sản phẩm",
      variant_name: it.variant_name_snapshot || null,
      sku: it.sku_snapshot || null,
      quantity_ordered: Number(it.quantity) || 0,
      unit_price: Number(it.unit_price) || 0,
      subtotal: Number(it.subtotal) || 0,
      current_catalog_stock: inv?.current_catalog_stock ?? null,
      inventory_state: inv?.inventory_state ?? "UNVERIFIED",
      inventory_note:
        inv?.inventory_note ?? "Không tìm thấy dòng phân loại khi tải trang chi tiết",
    };
  });
  // Item có ở Phase A nhưng thiếu trong detail (race giữa hai query)
  // → giữ entry lightweight, không mất dữ liệu classify.
  for (const [id, inv] of invByItemId) {
    if (!fullItems.some((i) => i.order_item_id === id)) fullItems.push(inv);
  }
  return {
    ...rec,
    shipping_address: detail.shipping_address_snapshot ?? rec.shipping_address ?? null,
    customer_email: detail.customers?.email || null,
    items: fullItems,
    items_count: fullItems.length,
  };
}

export type ReconciliationStatus =
  | "OK"
  | "UNPAID"
  | "UNDERPAID"
  | "OVERPAID"
  | "PAYMENT_MISMATCH"
  | "INVENTORY_MISMATCH"
  | "NEEDS_REVIEW";

export interface ReconciliationItemBreakdown {
  order_item_id: string;
  product_id?: string | null;
  variant_id?: string | null;
  combo_id?: string | null;
  item_name: string;
  variant_name?: string | null;
  sku?: string | null;
  quantity_ordered: number;
  unit_price: number;
  subtotal: number;
  current_catalog_stock?: number | null;
  variant_status?: string | null;
  inventory_state: "CONSISTENT" | "MISMATCH" | "UNVERIFIED";
  inventory_note?: string;
}

export interface ReconciliationPaymentBreakdown {
  payment_id: string;
  amount: number;
  payment_method: string;
  status: string;
  transaction_code?: string | null;
  created_at: string;
}

export interface ReconciliationRecord {
  order_id: string;
  order_code: string;
  created_at: string;
  order_status: string;
  payment_status: string;
  delivery_status: string;
  receiver_name: string;
  receiver_phone: string;
  shipping_address?: string | null;
  customer_email?: string | null;
  customer_note?: string | null;
  internal_note?: string | null;
  
  // Order financial figures
  subtotal: number;
  shipping_fee: number;
  voucher_discount: number;
  expected_amount: number; // final_amount
  
  // Payment reconciliation
  paid_amount: number;
  payment_difference: number; // paid_amount - expected_amount
  payments_count: number;
  payments: ReconciliationPaymentBreakdown[];
  
  // Inventory reconciliation
  items_count: number;
  items: ReconciliationItemBreakdown[];
  inventory_status: "OK" | "MISMATCH" | "UNVERIFIED";
  
  // Final 3-way reconciliation verdict
  reconciliation_status: ReconciliationStatus;
  reconciliation_reason: string;
  action_recommended?: string;
}

export interface ReconciliationOrphanPayments {
  count: number;
  null_order_id_count: number;
  missing_order_count: number;
  samples: Array<{
    payment_id: string;
    order_id: string | null;
    amount: number;
    created_at: string;
  }>;
}

export interface ReconciliationSummary {
  total_orders: number;
  total_expected_revenue: number;
  total_paid_revenue: number;
  total_net_difference: number;

  status_counts: {
    ok: number;
    unpaid: number;
    underpaid: number;
    overpaid: number;
    payment_mismatch: number;
    inventory_mismatch: number;
    needs_review: number;
    action_required_total: number;
  };

  // Batch C — orphan payment detector (READ-ONLY): payment không gắn order
  // hợp lệ (order_id null hoặc trỏ tới order không tồn tại trong DB).
  orphan_payments: ReconciliationOrphanPayments;
}

export interface ReconciliationFilterOptions {
  search?: string;
  reconciliation_status?: string;
  order_status?: string;
  payment_status?: string;
  start_date?: string;
  end_date?: string;
  action_required_only?: boolean;
  limit?: number;
  offset?: number;
}

/** C10 — date-only (YYYY-MM-DD) end_date → bao trọn cả ngày (T23:59:59.999Z). */
function normalizeReconciliationEndDate(endDate: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(endDate)
    ? `${endDate}T23:59:59.999Z`
    : endDate;
}

/**
 * Server-side 3-Way Reconciliation Engine: Orders ↔ Payments ↔ Inventory
 *
 * Batch 3C — hai phase:
 *   Phase A — lightweight full scan: select cột cần cho classification
 *     (KHÔNG customers, KHÔNG item snapshots hiển thị), sort
 *     created_at DESC + order_id DESC (tie-break chống skip/dup giữa trang),
 *     payments theo chunks (chống URL overflow). Classify + summary +
 *     in-memory filters trên TOÀN BỘ rows khớp DB filters.
 *   Phase B — detailed fetch: chỉ tải chi tiết (customers + item snapshots)
 *     cho đúng page IDs (≤ limit IDs) rồi enrich — không classify lại.
 */
export async function getReconciliationDataServer(options?: ReconciliationFilterOptions): Promise<{
  summary: ReconciliationSummary;
  records: ReconciliationRecord[];
  total_count: number;
}> {
  const supabase = createAdminClient();
  const { limit, offset } = clampPagination(options?.limit, options?.offset);

  // 1. Phase A — fetch lightweight orders (đủ cột classify, thiếu cột hiển thị)
  let ordersQuery = supabase
    .from("orders")
    .select(`
      order_id,
      order_code,
      created_at,
      order_status,
      payment_status,
      delivery_status,
      receiver_name,
      receiver_phone,
      subtotal,
      shipping_fee,
      voucher_discount,
      final_amount,
      customer_note,
      internal_note,
      order_items (
        order_item_id,
        product_id,
        variant_id,
        combo_id,
        quantity,
        variant_name_snapshot
      )
    `)
    .order("created_at", { ascending: false })
    .order("order_id", { ascending: false });

  if (options?.start_date) {
    ordersQuery = ordersQuery.gte("created_at", options.start_date);
  }
  if (options?.end_date) {
    // C10 — date-only (YYYY-MM-DD) phải bao trọn cả ngày end: append
    // T23:59:59.999Z. Trước đây so với midnight UTC → loại trừ trọn ngày cuối.
    ordersQuery = ordersQuery.lte("created_at", normalizeReconciliationEndDate(options.end_date));
  }
  if (options?.order_status && options.order_status !== "all") {
    ordersQuery = ordersQuery.eq("order_status", options.order_status);
  }
  if (options?.payment_status && options.payment_status !== "all") {
    ordersQuery = ordersQuery.eq("payment_status", options.payment_status);
  }

  const { data: rawOrders, error: ordersError } = await ordersQuery;
  if (ordersError || !rawOrders) {
    console.error("[reconciliationService] Error querying orders:", ordersError);
    throw new Error("Không thể tải dữ liệu đối soát đơn hàng");
  }

  // 2. Phase A — fetch payments theo CHUNKS (Batch 3C): mỗi lần tối đa
  //    PAYMENTS_CHUNK_SIZE IDs — tránh URL overflow của `.in()` PostgREST
  //    khi số orders lớn. Chunk đầu lỗi → throw ngay (không nuốt).
  const orderRows: LightweightOrder[] = rawOrders;
  const orderIds = orderRows.map((order) => order.order_id);
  const rawPayments: PaymentRow[] = [];
  for (let i = 0; i < orderIds.length; i += PAYMENTS_CHUNK_SIZE) {
    const batchIds = orderIds.slice(i, i + PAYMENTS_CHUNK_SIZE);
    // Hotfix P1-F6: CHỈ select cột có căn cứ trong schema 001
    // (payments không có confirmed_at — select cột không tồn tại khiến
    // PostgREST trả lỗi PGRST204 cho TOÀN bộ truy vấn).
    const { data: paymentsData, error: paymentsError } = await supabase
      .from("payments")
      .select("payment_id, order_id, amount, payment_method, payment_status, transaction_code, created_at")
      .in("order_id", batchIds)
      .order("created_at", { ascending: true });

    // Lỗi đọc payments KHÔNG được nuốt thành "không có giao dịch":
    // ném lỗi (mirror nhánh orders ở trên) → route trả 500 → UI báo lỗi,
    // phân biệt rõ "query thất bại" với "orders không có payment record".
    if (paymentsError || !paymentsData) {
      console.error("[reconciliationService] Error querying payments:", paymentsError);
      throw new Error("Không thể tải dữ liệu thanh toán đối soát");
    }
    rawPayments.push(...paymentsData);
  }

  // Map payments by order_id
  const paymentsByOrderId = new Map<string, PaymentRow[]>();
  for (const pay of rawPayments) {
    const existing = paymentsByOrderId.get(pay.order_id) || [];
    existing.push(pay);
    paymentsByOrderId.set(pay.order_id, existing);
  }

  // 2b. Batch C — ORPHAN PAYMENT DETECTOR (read-only): payment không gắn
  //     order hợp lệ. Hai loại:
  //       (a) order_id IS NULL — không có đơn để gắn.
  //       (b) order_id trỏ tới order KHÔNG tồn tại trong DB (FK chết / đơn
  //           bị xóa). Chống false-positive: payment gắn đơn ngoài cửa sổ
  //           thời gian (đơn tạo trước start_date) được xác minh bằng query
  //           orders .in() riêng → KHÔNG đếm là orphan.
  //     Giới hạn có chủ đích (chống unbound scan — mirror C4): quét payments
  //     theo created_at trong CÙNG cửa sổ thời gian với orders; payment tạo
  //     ngoài cửa sổ không được đếm (kể cả khi order_id chết).
  //     Lỗi query → THROW (không nuốt thành count=0 — mirror Phase A).
  interface OrphanPaymentWindowRow {
    payment_id: string;
    order_id: string | null;
    amount: number;
    created_at: string;
  }
  let orphanNullPayments: OrphanPaymentWindowRow[] = [];
  let orphanMissingPayments: OrphanPaymentWindowRow[] = [];
  {
    let windowQuery = supabase
      .from("payments")
      .select("payment_id, order_id, amount, created_at")
      .order("created_at", { ascending: true });
    if (options?.start_date) {
      windowQuery = windowQuery.gte("created_at", options.start_date);
    }
    if (options?.end_date) {
      windowQuery = windowQuery.lte(
        "created_at",
        normalizeReconciliationEndDate(options.end_date)
      );
    }
    const { data: windowPayments, error: windowPaymentsError } = await windowQuery;
    if (windowPaymentsError || !windowPayments) {
      console.error(
        "[reconciliationService] Error scanning payments for orphans:",
        windowPaymentsError
      );
      throw new Error("Không thể quét thanh toán mồ côi");
    }

    const orderIdSet = new Set(orderIds);
    const nullOrphans = windowPayments.filter((p) => p.order_id == null);
    const missingCandidates = windowPayments.filter(
      (p) => p.order_id != null && !orderIdSet.has(p.order_id)
    );

    const candidateIds = [...new Set(missingCandidates.map((p) => p.order_id as string))];
    const existingOutsideWindowIds = new Set<string>();
    if (candidateIds.length > 0) {
      const { data: existRows, error: existError } = await supabase
        .from("orders")
        .select("order_id")
        .in("order_id", candidateIds);
      if (existError || !existRows) {
        console.error(
          "[reconciliationService] Error verifying orphan candidate orders:",
          existError
        );
        throw new Error("Không thể xác minh thanh toán mồ côi");
      }
      for (const row of existRows as Array<{ order_id: string }>) {
        existingOutsideWindowIds.add(row.order_id);
      }
    }

    orphanNullPayments = nullOrphans;
    orphanMissingPayments = missingCandidates.filter(
      (p) => !existingOutsideWindowIds.has(p.order_id as string)
    );
  }

  // 3. Fetch catalog variants and products with in-memory caching (TTL 30s) and parallel fetching
  let catalogVariants: CatalogVariantRow[] = [];
  let catalogProducts: CatalogProductRow[] = [];

  if (catalogMemoryCache && Date.now() - catalogMemoryCache.timestamp < CATALOG_CACHE_TTL_MS) {
    catalogVariants = catalogMemoryCache.variants;
    catalogProducts = catalogMemoryCache.products;
  } else {
    // Batch 3B — catalog query chỉ select cột có căn cứ schema đã xác minh:
    //   product_variants (001:112-126): variant_id, product_id, name, sku,
    //     price, stock — stock là NGUỒN TỒN KHO DUY NHẤT (001:120).
    //   products (001:88-105): KHÔNG có cột stock, KHÔNG có cột sku.
    //     Trước 3B query chọn "sku, price, stock" → PostgREST PGRST204 →
    //     data=null → nuốt thành catalog rỗng (productsRes.data || []) →
    //     MỌI dòng product không biến thể bị gắn nhãn "không còn trong
    //     catalog" (finding sai). Giờ chỉ select product_id, name, status.
    // Lỗi catalog KHÔNG được nuốt thành danh sách rỗng: ném lỗi (mirror
    // nhánh orders/payments) → route 500 → UI báo reconciliation không
    // hoàn chỉnh, phân biệt rõ "query thất bại" với "catalog trống thật".
    const [variantsRes, productsRes] = await Promise.all([
      supabase.from("product_variants").select("variant_id, product_id, name, sku, price, stock"),
      supabase.from("products").select("product_id, name, status"),
    ]);

    if (variantsRes.error || !variantsRes.data) {
      console.error("[reconciliationService] Error querying product_variants:", variantsRes.error);
      throw new Error("Không thể tải dữ liệu phân loại sản phẩm đối soát");
    }
    if (productsRes.error || !productsRes.data) {
      console.error("[reconciliationService] Error querying products:", productsRes.error);
      throw new Error("Không thể tải dữ liệu sản phẩm đối soát");
    }

    catalogVariants = variantsRes.data;
    catalogProducts = productsRes.data;

    catalogMemoryCache = {
      variants: catalogVariants,
      products: catalogProducts,
      timestamp: Date.now(),
    };
  }

  const variantMap = new Map<string, CatalogVariantRow>();
  catalogVariants.forEach((v) => variantMap.set(v.variant_id, v));

  const productMap = new Map<string, CatalogProductRow>();
  catalogProducts.forEach((p) => productMap.set(p.product_id, p));

  // 4. Run 3-Way Reconciliation on each order
  const reconciledRecords: ReconciliationRecord[] = [];

  for (const o of orderRows) {
    const orderFinalAmount = Number(o.final_amount) || 0;
    const orderItems: LightweightOrderItem[] = o.order_items || [];
    const relatedPayments = paymentsByOrderId.get(o.order_id) || [];

    // Calculate paid amount
    // Consider payments with status = 'paid' hoặc legacy rows thiếu status.
    // (Batch 3E dọn dead code p.status — cột status không tồn tại/không select.)
    const paidRecords = relatedPayments.filter(
      (p) => p.payment_status === "paid" || !p.payment_status
    );
    const pendingPaymentRecords = relatedPayments.filter(
      (p) => p.payment_status === "pending"
    );
    const totalPaidAmount = paidRecords.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const difference = totalPaidAmount - orderFinalAmount;

    // Inventory breakdown & verification
    let hasInventoryMismatch = false;
    const itemBreakdowns: ReconciliationItemBreakdown[] = [];

    for (const it of orderItems) {
      const qty = Number(it.quantity) || 0;
      let inventoryState: "CONSISTENT" | "MISMATCH" | "UNVERIFIED" = "CONSISTENT";
      let inventoryNote = "Tồn kho hợp lệ";
      let currentStock: number | null = null;

      if (qty <= 0) {
        inventoryState = "MISMATCH";
        inventoryNote = `Số lượng đặt mua không hợp lệ (${qty})`;
        hasInventoryMismatch = true;
      } else if (it.variant_id) {
        const variant = variantMap.get(it.variant_id);
        if (!variant) {
          inventoryState = "UNVERIFIED";
          inventoryNote = "Phân loại sản phẩm không còn trong catalog hiện tại";
        } else {
          currentStock = Number(variant.stock);
          if (currentStock < 0) {
            inventoryState = "MISMATCH";
            inventoryNote = `Tồn kho phân loại bị âm (${currentStock})`;
            hasInventoryMismatch = true;
          } else {
            inventoryState = "CONSISTENT";
            inventoryNote = `Còn ${currentStock} sp trong kho`;
          }
        }
      } else if (it.combo_id) {
        inventoryState = "CONSISTENT";
        inventoryNote = "Set Combo quà tặng";
      } else if (it.variant_name_snapshot) {
        // Batch 3B — variant_id NULL nhưng snapshot variant còn giá trị:
        // FK order_items.variant_id → product_variants ON DELETE SET NULL
        // (001:254) — biến thể đã bị xóa, snapshot giữ lịch sử. KHÔNG
        // ghép snapshot theo tên/SKU với variant hiện tại (không có contract
        // duy nhất). KHÔNG đọc product.stock — không có cột đó (001:88-105).
        inventoryState = "UNVERIFIED";
        inventoryNote =
          "Phân loại sản phẩm đã bị xóa khỏi catalog — không thể đối chiếu tồn kho theo snapshot";
      } else if (it.product_id) {
        const product = productMap.get(it.product_id);
        if (!product) {
          inventoryState = "UNVERIFIED";
          inventoryNote = "Sản phẩm không còn trong catalog hiện tại";
        } else {
          // Batch 3B — products KHÔNG có cột stock (001:88-105): dòng
          // không biến thể không kiểm tồn kho theo schema (parity với
          // writer 016/orderService Batch 2C). currentStock giữ null —
          // không suy diễn số lượng từ nguồn không có căn cứ.
          currentStock = null;
          inventoryState = "CONSISTENT";
          inventoryNote = "Sản phẩm không biến thể — không kiểm tồn kho theo schema";
        }
      } else {
        // Không có variant_id, combo_id, product_id → không xác định
        // được định danh nào để đối chiếu. Không kết luận giả "hợp lệ".
        inventoryState = "UNVERIFIED";
        inventoryNote = "Không xác định được định danh sản phẩm/phân loại để đối chiếu";
      }

      itemBreakdowns.push({
        order_item_id: it.order_item_id,
        product_id: it.product_id,
        variant_id: it.variant_id,
        combo_id: it.combo_id,
        item_name: it.item_name_snapshot || "Sản phẩm",
        variant_name: it.variant_name_snapshot || null,
        sku: it.sku_snapshot || null,
        quantity_ordered: qty,
        unit_price: Number(it.unit_price) || 0,
        subtotal: Number(it.subtotal) || 0,
        current_catalog_stock: currentStock,
        inventory_state: inventoryState,
        inventory_note: inventoryNote,
      });
    }

    const overallInventoryStatus: "OK" | "MISMATCH" | "UNVERIFIED" = hasInventoryMismatch
      ? "MISMATCH"
      : itemBreakdowns.some((i) => i.inventory_state === "UNVERIFIED")
      ? "UNVERIFIED"
      : "OK";

    // 5. Determine 3-Way Reconciliation Verdict
    let recStatus: ReconciliationStatus = "OK";
    let recReason = "Đơn hàng, Thanh toán và Tồn kho hoàn toàn khớp chuẩn.";
    let actionRecommended: string | undefined = undefined;

    const isOrderCancelled = o.order_status === "cancelled";
    const isOrderMarkedPaid = o.payment_status === "paid";

    const hasManualPaymentAdjustment =
      typeof o.internal_note === "string" && o.internal_note.includes("[ĐIỀU CHỈNH THANH TOÁN]");

    if (hasManualPaymentAdjustment) {
      recStatus = "NEEDS_REVIEW";
      recReason = "Xác nhận tiền mặt đã được quản trị viên điều chỉnh; payment ledger gốc vẫn được giữ để truy vết.";
      actionRecommended = "Đọc audit log và payment_confirmation_adjustments trước khi xác nhận lại. Không suy đoán rằng tiền đã được hoàn.";
    } else if (pendingPaymentRecords.length > 0) {
      const pendingAmount = pendingPaymentRecords.reduce(
        (sum, payment) => sum + (Number(payment.amount) || 0),
        0
      );
      recStatus = "NEEDS_REVIEW";
      recReason = `${pendingPaymentRecords.length} giao dịch (${pendingAmount.toLocaleString("vi-VN")}đ) đang chờ đối soát và chưa được áp dụng vào trạng thái thanh toán của đơn.`;
      actionRecommended = isOrderMarkedPaid
        ? "Đơn đã được đánh dấu thanh toán. Kiểm tra giao dịch đến sau để hoàn tiền hoặc xử lý như khoản đóng góp; không xác nhận lại tự động."
        : "Kiểm tra mã giao dịch, số tiền và lịch sử đơn trước khi xác nhận hoặc từ chối.";
    } else if (isOrderCancelled) {
      recStatus = "NEEDS_REVIEW";
      recReason = "Đơn hàng đã hủy trên hệ thống.";
      actionRecommended = totalPaidAmount > 0
        ? `Đơn đã hủy nhưng có ghi nhận ${totalPaidAmount.toLocaleString("vi-VN")}đ. Cần kiểm tra hoàn tiền cho khách.`
        : "Đơn đã hủy thành công, không phát sinh dòng tiền.";
    } else if (hasInventoryMismatch) {
      recStatus = "INVENTORY_MISMATCH";
      recReason = "Phát hiện bất thường về dữ liệu tồn kho của sản phẩm đặt mua.";
      actionRecommended = "Kiểm tra lại bảng product_variants để khắc phục lỗi tồn kho âm hoặc ID sai lệch.";
    } else if (relatedPayments.length > 1 && totalPaidAmount !== orderFinalAmount) {
      recStatus = "NEEDS_REVIEW";
      recReason = `Có ${relatedPayments.length} giao dịch thanh toán liên quan với tổng tiền ${totalPaidAmount.toLocaleString("vi-VN")}đ (kỳ vọng ${orderFinalAmount.toLocaleString("vi-VN")}đ).`;
      actionRecommended = "Kiểm tra thủ công các mã giao dịch ngân hàng để tránh trùng lặp.";
    } else if (totalPaidAmount === 0) {
      if (isOrderMarkedPaid) {
        recStatus = "PAYMENT_MISMATCH";
        recReason = "Đơn hàng ghi nhận trạng thái 'Đã thanh toán' nhưng không tìm thấy bản ghi giao dịch ngân hàng nào.";
        actionRecommended = "Kiểm tra xem đơn được duyệt thủ công hay do lỗi đồng bộ.";
      } else {
        recStatus = "UNPAID";
        recReason = "Khách hàng chưa thanh toán đơn hàng này.";
        actionRecommended = "Nhắc khách thanh toán hoặc hủy đơn nếu quá hạn.";
      }
    } else if (totalPaidAmount < orderFinalAmount) {
      recStatus = "UNDERPAID";
      recReason = `Khách chuyển thiếu ${(orderFinalAmount - totalPaidAmount).toLocaleString("vi-VN")}đ (Đã nhận: ${totalPaidAmount.toLocaleString("vi-VN")}đ / Cần: ${orderFinalAmount.toLocaleString("vi-VN")}đ).`;
      actionRecommended = "Liên hệ khách hàng để thu nốt số tiền còn thiếu trước khi giao hàng.";
    } else if (totalPaidAmount > orderFinalAmount) {
      recStatus = "OVERPAID";
      recReason = `Khách chuyển dư ${(totalPaidAmount - orderFinalAmount).toLocaleString("vi-VN")}đ (Đã nhận: ${totalPaidAmount.toLocaleString("vi-VN")}đ / Cần: ${orderFinalAmount.toLocaleString("vi-VN")}đ).`;
      actionRecommended = "Xác nhận với khách hàng để hoàn lại tiền thừa hoặc ghi nhận đóng góp gây quỹ.";
    } else {
      // totalPaidAmount === orderFinalAmount
      if (!isOrderMarkedPaid) {
        recStatus = "PAYMENT_MISMATCH";
        recReason = "Đã nhận đủ 100% tiền nhưng trạng thái đơn chưa chuyển sang 'Đã thanh toán'.";
        actionRecommended = "Cập nhật payment_status của đơn sang 'paid' để tiếp tục giao hàng.";
      } else {
        recStatus = "OK";
        recReason = "Khớp 3 chiều: Đơn hàng hợp lệ, tiền đã nhận đủ 100%, tồn kho nhất quán.";
      }
    }

    reconciledRecords.push({
      order_id: o.order_id,
      order_code: o.order_code,
      created_at: o.created_at,
      order_status: o.order_status,
      payment_status: o.payment_status,
      delivery_status: o.delivery_status,
      receiver_name: o.receiver_name,
      receiver_phone: o.receiver_phone,
      // Batch 3C — Phase A lightweight KHÔNG select các cột hiển thị này;
      // enrich trong Phase B (enrichRecordWithDetails) cho đúng page rows.
      shipping_address: null,
      customer_email: null,
      customer_note: o.customer_note,
      internal_note: o.internal_note,
      subtotal: Number(o.subtotal) || 0,
      shipping_fee: Number(o.shipping_fee) || 0,
      voucher_discount: Number(o.voucher_discount) || 0,
      expected_amount: orderFinalAmount,
      paid_amount: totalPaidAmount,
      payment_difference: difference,
      payments_count: relatedPayments.length,
      payments: relatedPayments.map((p) => ({
        payment_id: p.payment_id,
        amount: Number(p.amount) || 0,
        payment_method: p.payment_method || "banking",
        status: p.payment_status || p.status || "pending",
        transaction_code: p.transaction_code,
        created_at: p.created_at,
      })),
      items_count: itemBreakdowns.length,
      items: itemBreakdowns,
      inventory_status: overallInventoryStatus,
      reconciliation_status: recStatus,
      reconciliation_reason: recReason,
      action_recommended: actionRecommended,
    });
  }

  // 6. Compute Global Summary KPI across all records
  const totalOrders = reconciledRecords.length;
  let totalExpectedRevenue = 0;
  let totalPaidRevenue = 0;
  let okCount = 0;
  let unpaidCount = 0;
  let underpaidCount = 0;
  let overpaidCount = 0;
  let paymentMismatchCount = 0;
  let inventoryMismatchCount = 0;
  let needsReviewCount = 0;

  for (const r of reconciledRecords) {
    totalExpectedRevenue += r.expected_amount;
    totalPaidRevenue += r.paid_amount;

    switch (r.reconciliation_status) {
      case "OK":
        okCount++;
        break;
      case "UNPAID":
        unpaidCount++;
        break;
      case "UNDERPAID":
        underpaidCount++;
        break;
      case "OVERPAID":
        overpaidCount++;
        break;
      case "PAYMENT_MISMATCH":
        paymentMismatchCount++;
        break;
      case "INVENTORY_MISMATCH":
        inventoryMismatchCount++;
        break;
      case "NEEDS_REVIEW":
        needsReviewCount++;
        break;
    }
  }

  const actionRequiredTotal =
    unpaidCount +
    underpaidCount +
    overpaidCount +
    paymentMismatchCount +
    inventoryMismatchCount +
    needsReviewCount;

  // Batch C — tổng hợp orphan payments. Samples sort created_at DESC,
  // giới hạn ORPHAN_PAYMENT_SAMPLE_LIMIT để payload ổn định với dữ liệu lớn.
  const orphanAll = [...orphanNullPayments, ...orphanMissingPayments].sort((a, b) =>
    (a.created_at ?? "") < (b.created_at ?? "") ? 1 : -1
  );
  const orphanPayments: ReconciliationOrphanPayments = {
    count: orphanAll.length,
    null_order_id_count: orphanNullPayments.length,
    missing_order_count: orphanMissingPayments.length,
    samples: orphanAll.slice(0, ORPHAN_PAYMENT_SAMPLE_LIMIT).map((p) => ({
      payment_id: p.payment_id,
      order_id: p.order_id ?? null,
      amount: p.amount,
      created_at: p.created_at,
    })),
  };

  const summary: ReconciliationSummary = {
    total_orders: totalOrders,
    total_expected_revenue: totalExpectedRevenue,
    total_paid_revenue: totalPaidRevenue,
    total_net_difference: totalPaidRevenue - totalExpectedRevenue,
    status_counts: {
      ok: okCount,
      unpaid: unpaidCount,
      underpaid: underpaidCount,
      overpaid: overpaidCount,
      payment_mismatch: paymentMismatchCount,
      inventory_mismatch: inventoryMismatchCount,
      needs_review: needsReviewCount,
      action_required_total: actionRequiredTotal,
    },
    orphan_payments: orphanPayments,
  };

  // 7. In-memory Filter Application for Query Results
  let filtered = reconciledRecords;

  if (options?.action_required_only) {
    filtered = filtered.filter((r) => r.reconciliation_status !== "OK");
  } else if (options?.reconciliation_status && options.reconciliation_status !== "all") {
    filtered = filtered.filter((r) => r.reconciliation_status === options.reconciliation_status);
  }

  if (options?.search && options.search.trim() !== "") {
    const q = options.search.trim().toLowerCase();
    filtered = filtered.filter((r) => {
      const matchCode = (r.order_code ?? "").toLowerCase().includes(q);
      const matchName = (r.receiver_name ?? "").toLowerCase().includes(q);
      const matchPhone = (r.receiver_phone ?? "").toLowerCase().includes(q);
      const matchTx = (r.payments ?? []).some((p) => ((p.transaction_code ?? "").toLowerCase()).includes(q));
      return matchCode || matchName || matchPhone || matchTx;
    });
  }

  const totalCount = filtered.length;
  const pageSlice = filtered.slice(offset, offset + limit);

  // 8. Phase B — detailed fetch CHỈ cho page IDs (≤ limit IDs):
  //    customers + item snapshots hiển thị đầy đủ. KHÔNG classify lại —
  //    enrich merge inventory state từ Phase A (xem enrichRecordWithDetails).
  //    Thứ tự records theo pageSlice (đã sort Phase A), KHÔNG phụ thuộc
  //    thứ tự DB trả về.
  let records: ReconciliationRecord[] = [];
  if (pageSlice.length > 0) {
    const pageIds = pageSlice.map((r) => r.order_id);
    const { data: detailedOrders, error: detailError } = await supabase
      .from("orders")
      .select(`
        order_id,
        shipping_address_snapshot,
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
      .in("order_id", pageIds);

    if (detailError || !detailedOrders) {
      console.error("[reconciliationService] Error querying order details:", detailError);
      throw new Error("Không thể tải dữ liệu chi tiết đối soát");
    }

    const detailById = new Map<string, DetailedOrder>(
      (detailedOrders as DetailedOrder[]).map((detail) => [detail.order_id, detail])
    );
    records = pageSlice.map((rec) =>
      enrichRecordWithDetails(rec, detailById.get(rec.order_id))
    );
  }

  return {
    summary,
    records,
    total_count: totalCount,
  };
}
