import { createAdminClient } from "@/lib/supabase/admin";

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
  confirmed_at?: string | null;
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

/**
 * Server-side 3-Way Reconciliation Engine: Orders ↔ Payments ↔ Inventory
 */
export async function getReconciliationDataServer(options?: ReconciliationFilterOptions): Promise<{
  summary: ReconciliationSummary;
  records: ReconciliationRecord[];
  total_count: number;
}> {
  const supabase = createAdminClient();

  // 1. Fetch orders with customer info & order_items
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
      shipping_address_snapshot,
      subtotal,
      shipping_fee,
      voucher_discount,
      final_amount,
      customer_note,
      internal_note,
      payment_method,
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

  if (options?.start_date) {
    ordersQuery = ordersQuery.gte("created_at", options.start_date);
  }
  if (options?.end_date) {
    ordersQuery = ordersQuery.lte("created_at", options.end_date);
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

  // 2. Fetch all payments linked to these orders in a single batch
  const orderIds = rawOrders.map((o) => o.order_id);
  let rawPayments: any[] = [];
  if (orderIds.length > 0) {
    const { data: paymentsData, error: paymentsError } = await supabase
      .from("payments")
      .select("payment_id, order_id, amount, payment_method, payment_status, transaction_code, created_at, confirmed_at")
      .in("order_id", orderIds)
      .order("created_at", { ascending: true });

    if (!paymentsError && paymentsData) {
      rawPayments = paymentsData;
    }
  }

  // Map payments by order_id
  const paymentsByOrderId = new Map<string, any[]>();
  for (const pay of rawPayments) {
    const existing = paymentsByOrderId.get(pay.order_id) || [];
    existing.push(pay);
    paymentsByOrderId.set(pay.order_id, existing);
  }

  // 3. Fetch catalog variants and products to verify inventory consistency
  const { data: catalogVariants } = await supabase
    .from("product_variants")
    .select("variant_id, product_id, name, sku, price, stock");

  const { data: catalogProducts } = await supabase
    .from("products")
    .select("product_id, name, sku, price, stock, status");

  const variantMap = new Map<string, any>();
  (catalogVariants || []).forEach((v) => variantMap.set(v.variant_id, v));

  const productMap = new Map<string, any>();
  (catalogProducts || []).forEach((p) => productMap.set(p.product_id, p));

  // 4. Run 3-Way Reconciliation on each order
  const reconciledRecords: ReconciliationRecord[] = [];

  for (const o of rawOrders) {
    const orderFinalAmount = Number(o.final_amount) || 0;
    const orderItems: any[] = o.order_items || [];
    const relatedPayments = paymentsByOrderId.get(o.order_id) || [];

    // Calculate paid amount
    // Consider payments with status = 'paid' or payments recorded with positive amount
    const paidRecords = relatedPayments.filter(
      (p) => p.payment_status === "paid" || p.status === "paid" || !p.payment_status
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
      } else if (it.product_id && !it.combo_id) {
        const product = productMap.get(it.product_id);
        if (!product) {
          inventoryState = "UNVERIFIED";
          inventoryNote = "Sản phẩm không còn trong catalog hiện tại";
        } else {
          currentStock = Number(product.stock);
          if (currentStock < 0) {
            inventoryState = "MISMATCH";
            inventoryNote = `Tồn kho sản phẩm bị âm (${currentStock})`;
            hasInventoryMismatch = true;
          } else {
            inventoryState = "CONSISTENT";
            inventoryNote = `Còn ${currentStock} sp trong kho`;
          }
        }
      } else if (it.combo_id) {
        inventoryState = "CONSISTENT";
        inventoryNote = "Set Combo quà tặng";
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

    if (isOrderCancelled) {
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
      shipping_address: o.shipping_address_snapshot,
      customer_email: (o.customers as any)?.email || null,
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
        confirmed_at: p.confirmed_at,
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
      const matchCode = r.order_code.toLowerCase().includes(q);
      const matchName = r.receiver_name.toLowerCase().includes(q);
      const matchPhone = r.receiver_phone.toLowerCase().includes(q);
      const matchTx = r.payments.some((p) => (p.transaction_code || "").toLowerCase().includes(q));
      return matchCode || matchName || matchPhone || matchTx;
    });
  }

  const totalCount = filtered.length;
  const offset = options?.offset || 0;
  const limit = options?.limit || 100;
  const paginated = filtered.slice(offset, offset + limit);

  return {
    summary,
    records: paginated,
    total_count: totalCount,
  };
}
