import { createAdminClient } from "@/lib/supabase/admin";
import { getSystemSettingsServer } from "@/lib/services/configService";
import { createOrderProofToken } from "@/lib/auth/serverAuth";
import { computePricing, isVoucherApplicable, type PricingVoucher } from "@/lib/pricing";

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

export async function createOrderServer(orderInput: {
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
  items: Array<{
    product_id?: string;
    variant_id?: string | null;
    combo_id?: string | null;
    quantity: number;
  }>;
}): Promise<{
  success: boolean;
  orderId?: string;
  orderCode?: string;
  finalAmount?: number;
  proofToken?: string;
  error?: string;
}> {
  let voucherSlotHeld = false;
  let reservedVoucherId: string | null = null;
  let voucherSupabase: ReturnType<typeof createAdminClient> | null = null;

  const releaseReservedVoucherSlot = async (): Promise<void> => {
    if (!voucherSlotHeld || !reservedVoucherId || !voucherSupabase) return;
    voucherSlotHeld = false;
    const releaseId = reservedVoucherId;
    reservedVoucherId = null;
    const ops = createVoucherCasOps(voucherSupabase);
    await releaseVoucherSlot(ops, releaseId);
  };

  try {
    const supabase = createAdminClient();
    voucherSupabase = supabase;

    // 1. Validate Customer Information
    const rawPhone = (orderInput.buyer_phone || orderInput.recipient_phone || "").trim().replace(/\D/g, "");
    const fullName = (orderInput.buyer_name || orderInput.recipient_name || "").trim() || "Khách hàng Gieo Mơ";
    const email = (orderInput.buyer_email || "").trim().toLowerCase() || null;
    const address = orderInput.address_detail
      ? `${orderInput.address_detail}, ${orderInput.district || ""}, ${orderInput.province || "TP. Hồ Chí Minh"}`.replace(/,\s*,/g, ",").trim()
      : null;

    if (!rawPhone || rawPhone.length < 9 || rawPhone.length > 11) {
      return { success: false, error: "Số điện thoại người nhận không hợp lệ (cần từ 9 - 11 chữ số)" };
    }

    if (!orderInput.items || !Array.isArray(orderInput.items) || orderInput.items.length === 0) {
      return { success: false, error: "Giỏ hàng không có sản phẩm nào để đặt" };
    }

    // 2. Fetch Actual Products, Variants & Combos from Database to Re-calculate Subtotal
    let calculatedSubtotal = 0;
    const verifiedOrderItems: Array<{
      product_id: string | null;
      variant_id: string | null;
      combo_id: string | null;
      item_name_snapshot: string;
      variant_name_snapshot: string | null;
      sku_snapshot: string | null;
      quantity: number;
      unit_price: number;
      subtotal: number;
      actualStock: number;
    }> = [];

    for (const item of orderInput.items) {
      const qty = Math.max(1, Math.min(99, Math.floor(Number(item.quantity) || 1)));

      // Combo item
      if (item.combo_id) {
        const { data: combo } = await supabase
          .from("combos")
          .select("combo_id, name, price, status")
          .or(`combo_id.eq.${item.combo_id},slug.eq.${item.combo_id}`)
          .maybeSingle();

        if (!combo || combo.status !== "active") {
          return { success: false, error: `Combo không tồn tại hoặc đã dừng kinh doanh.` };
        }

        const unitPrice = Number(combo.price) || 0;
        const itemSubtotal = unitPrice * qty;
        calculatedSubtotal += itemSubtotal;

        verifiedOrderItems.push({
          product_id: null,
          variant_id: null,
          combo_id: combo.combo_id,
          item_name_snapshot: combo.name,
          variant_name_snapshot: "Set Combo Quà Tặng",
          sku_snapshot: `COMBO-${combo.combo_id.slice(0, 6).toUpperCase()}`,
          quantity: qty,
          unit_price: unitPrice,
          subtotal: itemSubtotal,
          actualStock: 999,
        });
      } else if (item.variant_id) {
        // Variant item
        const { data: variant } = await supabase
          .from("product_variants")
          .select("variant_id, product_id, name, sku, price, stock, products(name, price, status)")
          .eq("variant_id", item.variant_id)
          .maybeSingle();

        if (!variant || (variant.products as any)?.status !== "active") {
          return { success: false, error: "Một trong các phân loại sản phẩm không còn kinh doanh." };
        }

        const currentStock = Number(variant.stock) || 0;
        if (currentStock < qty) {
          return {
            success: false,
            error: `Phân loại "${variant.name}" chỉ còn ${currentStock} sản phẩm trong kho (bạn đặt ${qty}).`,
          };
        }

        const unitPrice = Number(variant.price) || Number((variant.products as any)?.price) || 0;
        const itemSubtotal = unitPrice * qty;
        calculatedSubtotal += itemSubtotal;

        verifiedOrderItems.push({
          product_id: variant.product_id,
          variant_id: variant.variant_id,
          combo_id: null,
          item_name_snapshot: (variant.products as any)?.name || "Sản phẩm",
          variant_name_snapshot: variant.name,
          sku_snapshot: variant.sku || null,
          quantity: qty,
          unit_price: unitPrice,
          subtotal: itemSubtotal,
          actualStock: currentStock,
        });
      } else if (item.product_id) {
        // Simple product without variant
        const { data: product } = await supabase
          .from("products")
          .select("product_id, name, sku, price, stock, status")
          .or(`product_id.eq.${item.product_id},slug.eq.${item.product_id}`)
          .maybeSingle();

        if (!product || product.status !== "active") {
          return { success: false, error: "Một trong các sản phẩm đã chọn không còn kinh doanh." };
        }

        const currentStock = Number(product.stock) || 0;
        if (currentStock < qty) {
          return {
            success: false,
            error: `Sản phẩm "${product.name}" chỉ còn ${currentStock} sản phẩm trong kho.`,
          };
        }

        const unitPrice = Number(product.price) || 0;
        const itemSubtotal = unitPrice * qty;
        calculatedSubtotal += itemSubtotal;

        verifiedOrderItems.push({
          product_id: product.product_id,
          variant_id: null,
          combo_id: null,
          item_name_snapshot: product.name,
          variant_name_snapshot: null,
          sku_snapshot: product.sku || null,
          quantity: qty,
          unit_price: unitPrice,
          subtotal: itemSubtotal,
          actualStock: currentStock,
        });
      }
    }

    if (verifiedOrderItems.length === 0) {
      return { success: false, error: "Không xác thực được sản phẩm trong đơn hàng." };
    }

    // 3. Load System Settings for Shipping Fee calculation
    const settings = await getSystemSettingsServer();
    const baseShippingFee = Number(settings.flatShippingFee) || 25000;
    const deliveryType = orderInput.delivery_type || "home_delivery";

    // 4. Validate Voucher Code Strictly from Database + reserve usage slot (CAS)
    let applicableVoucher: PricingVoucher | null = null;
    const cleanVoucherCode = (orderInput.voucher_code || "").trim().toUpperCase();

    if (cleanVoucherCode) {
      const { data: voucher } = await supabase
        .from("vouchers")
        .select("*")
        .eq("code", cleanVoucherCode)
        .eq("status", "active")
        .maybeSingle();

      if (voucher && isVoucherApplicable(voucher, calculatedSubtotal)) {
        const ops = createVoucherCasOps(supabase);
        const reserve = await reserveVoucherSlot(ops, voucher.voucher_id);
        if (reserve.ok) {
          voucherSlotHeld = true;
          reservedVoucherId = voucher.voucher_id;
          applicableVoucher = voucher;
        } else if (reserve.reason === "db_error") {
          console.error("[createOrderServer] voucher-reserve-db-error", {
            voucherId: voucher.voucher_id,
            error: reserve.errorMessage,
          });
        } else if (reserve.reason === "contention") {
          console.warn("[createOrderServer] voucher-reserve-contention", {
            voucherId: voucher.voucher_id,
          });
        }
      }
    }

    // 5. Compute Final Amount (Server Authoritative)
    const {
      shippingFee,
      voucherDiscount: discountAmount,
      finalAmount,
    } = computePricing({
      subtotal: calculatedSubtotal,
      baseShippingFee,
      deliveryType,
      freeShippingThreshold: settings.freeShippingThreshold,
      voucher: applicableVoucher,
    });

// 6. Deduct Stock Atomically BEFORE inserting order (Prevents overselling race conditions)
// NOTE: We track deducted items to allow rollback if order insertion fails after retries
     const successfullyDeductedItems: Array<{
       variant_id?: string | null;
       product_id?: string | null;
       qty: number;
     }> = [];

     for (const it of verifiedOrderItems) {
       if (it.variant_id) {
         // Atomic conditional decrement: stock must be >= it.quantity
         const { data: updatedVariant, error: deductErr } = await supabase
           .from("product_variants")
           .update({
             stock: Math.max(0, it.actualStock - it.quantity),
             updated_at: new Date().toISOString(),
           })
           .eq("variant_id", it.variant_id)
           .gte("stock", it.quantity)
           .select("variant_id, stock")
           .maybeSingle();

         if (deductErr || !updatedVariant) {
           // Rollback any previously deducted items in this transaction
           for (const prev of successfullyDeductedItems) {
             if (prev.variant_id) {
               const { data: currentV } = await supabase
                 .from("product_variants")
                 .select("stock")
                 .eq("variant_id", prev.variant_id)
                 .maybeSingle();
               if (currentV) {
                 await supabase
                   .from("product_variants")
                   .update({ stock: (currentV.stock || 0) + prev.qty })
                   .eq("variant_id", prev.variant_id);
               }
             } else if (prev.product_id) {
               const { data: currentP } = await supabase
                 .from("products")
                 .select("stock")
                 .eq("product_id", prev.product_id)
                 .maybeSingle();
               if (currentP) {
                 await supabase
                   .from("products")
                   .update({ stock: (currentP.stock || 0) + prev.qty })
                   .eq("product_id", prev.product_id);
               }
             }
           }

            await releaseReservedVoucherSlot();
            return {
             success: false,
              error: `Phân loại "${it.variant_name_snapshot || it.item_name_snapshot}" vừa hết hàng do có khách đặt trước. Vui lòng chọn sản phẩm khác!`,
            };
         }

         successfullyDeductedItems.push({ variant_id: it.variant_id, product_id: it.product_id, qty: it.quantity });

         // Synchronize parent product stock
         if (it.product_id) {
           const { data: allVars } = await supabase
             .from("product_variants")
             .select("stock")
             .eq("product_id", it.product_id);
           const totalStock = (allVars || []).reduce((sum: number, v: any) => sum + (v.stock || 0), 0);
           await supabase
             .from("products")
             .update({ stock: totalStock, updated_at: new Date().toISOString() })
             .eq("product_id", it.product_id);
         }
       } else if (it.product_id && !it.combo_id) {
         // Simple product atomic decrement
         const { data: updatedProd, error: prodDeductErr } = await supabase
           .from("products")
           .update({
             stock: Math.max(0, it.actualStock - it.quantity),
             updated_at: new Date().toISOString(),
           })
           .eq("product_id", it.product_id)
           .gte("stock", it.quantity)
           .select("product_id, stock")
           .maybeSingle();

         if (prodDeductErr || !updatedProd) {
           // Rollback
           for (const prev of successfullyDeductedItems) {
             if (prev.variant_id) {
               const { data: currentV } = await supabase
                 .from("product_variants")
                 .select("stock")
                 .eq("variant_id", prev.variant_id)
                 .maybeSingle();
               if (currentV) {
                 await supabase
                   .from("product_variants")
                   .update({ stock: (currentV.stock || 0) + prev.qty })
                   .eq("variant_id", prev.variant_id);
               }
             } else if (prev.product_id) {
               const { data: currentP } = await supabase
                 .from("products")
                 .select("stock")
                 .eq("product_id", prev.product_id)
                 .maybeSingle();
               if (currentP) {
                 await supabase
                   .from("products")
                   .update({ stock: (currentP.stock || 0) + prev.qty })
                   .eq("product_id", prev.product_id);
               }
             }
           }

            await releaseReservedVoucherSlot();
            return {
              success: false,
              error: `Sản phẩm "${it.item_name_snapshot}" vừa hết hàng do có khách đặt trước. Vui lòng chọn sản phẩm khác!`,
            };
         }

         successfullyDeductedItems.push({ variant_id: null, product_id: it.product_id, qty: it.quantity });
       }
     }

     // Stock has been deducted atomically. If order insertion ultimately fails,
     // we must restore this stock to maintain data integrity.

    // 7. Upsert Customer Record
    let customerId: string | null = null;
    const { data: existingCustomer } = await supabase
      .from("customers")
      .select("customer_id")
      .eq("phone", rawPhone)
      .maybeSingle();

    if (existingCustomer) {
      customerId = existingCustomer.customer_id;
      await supabase
        .from("customers")
        .update({
          full_name: fullName,
          email: email || undefined,
          default_address: address || undefined,
          updated_at: new Date().toISOString(),
        })
        .eq("customer_id", customerId);
    } else {
      const { data: newCustomer } = await supabase
        .from("customers")
        .insert({
          full_name: fullName,
          phone: rawPhone,
          email,
          default_address: address,
        })
        .select("customer_id")
        .single();
      if (newCustomer) customerId = newCustomer.customer_id;
    }

    // 8. Resolve Seller ID & Referral via Server Authority (Query Supabase members)
    let sellerId: string | null = null;
    let assignedShipperId: string | null = null;
    let finalIntroducerInfo = orderInput.introducer_info || "Trực tiếp (Website)";
    let finalSourceType: "landing_page" | "member_referral" = "landing_page";

    const isUuid = (id?: string | null) =>
      Boolean(id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));

    let matchedMember: { member_id: string; full_name: string; referral_code: string | null } | null = null;

    // A. Validate candidate seller_id against active members
    if (isUuid(orderInput.seller_id)) {
      const { data: mById } = await supabase
        .from("members")
        .select("member_id, full_name, referral_code")
        .eq("member_id", orderInput.seller_id)
        .eq("status", "active")
        .maybeSingle();
      if (mById) matchedMember = mById;
    }

    // B. If not matched, lookup by referral_code
    const cleanRef = (orderInput.referral_code || "").trim().toUpperCase();
    if (!matchedMember && cleanRef) {
      const { data: mByCode } = await supabase
        .from("members")
        .select("member_id, full_name, referral_code")
        .ilike("referral_code", cleanRef)
        .eq("status", "active")
        .maybeSingle();
      if (mByCode) matchedMember = mByCode;
    }

    // C. If still not matched, extract referral code or name from introducer_info (e.g. "(MAM-LY)")
    if (!matchedMember && orderInput.introducer_info) {
      const extractedCode = orderInput.introducer_info.match(/\(([A-Za-z0-9_-]+)\)/)?.[1];
      if (extractedCode) {
        const { data: mByExtracted } = await supabase
          .from("members")
          .select("member_id, full_name, referral_code")
          .ilike("referral_code", extractedCode.trim().toUpperCase())
          .eq("status", "active")
          .maybeSingle();
        if (mByExtracted) matchedMember = mByExtracted;
      }
    }

    // D. Apply validated member relationship
    if (matchedMember) {
      sellerId = matchedMember.member_id;
      finalSourceType = "member_referral";
      finalIntroducerInfo = `${matchedMember.full_name} (${matchedMember.referral_code || "Thành viên"})`;

      // If delivery is through acquaintance / member delivery, assign order to this member
      if (deliveryType === "member_delivery") {
        assignedShipperId = matchedMember.member_id;
      }
    }

// 9. Generate Order Code with uniqueness check and insert retry on race condition
    // Database has UNIQUE constraint on order_code (migration 001) so we must handle
    // the rare case where two requests generate the same code between check and insert.
    let randomCode: string = "";
    let codeAttempt = 0;
    const maxAttempts = 5;
    let orderInserted = false;
    let createdOrder: { order_id: string; order_code: string } | null = null;
    let orderError: { code?: string; message?: string } | null = null;

    while (codeAttempt < maxAttempts && !orderInserted) {
      const ts = Date.now().toString().slice(-6);
      const rand = Math.floor(1000 + Math.random() * 9000).toString();
      randomCode = `GM-${ts}${rand}`;

      // Quick check to avoid obvious collisions before attempting insert.
      // NOTE: This check does NOT eliminate race conditions between check and insert.
      // The database UNIQUE constraint is the ultimate guard. If the check query fails,
      // we treat it as an unrecoverable error and abort rather than blindly proceeding.
      const { data: existingCode, error: checkError } = await supabase
        .from("orders")
        .select("order_code")
        .eq("order_code", randomCode)
        .maybeSingle();

      if (checkError) {
        orderError = { code: checkError.code, message: checkError.message };
        break;
      }

      if (existingCode) {
        codeAttempt++;
        continue;
      }

      let dbDeliveryType: "home_delivery" | "pickup_point" | "self_pickup" = "home_delivery";
      if (deliveryType === "pickup_point") dbDeliveryType = "pickup_point";
      else if (deliveryType === "self_pickup" || deliveryType === "member_delivery") dbDeliveryType = "self_pickup";

      const insertResult = await supabase
        .from("orders")
        .insert({
          order_code: randomCode,
          customer_id: customerId!,
          seller_id: sellerId,
          source_type: finalSourceType,
          introducer_info: finalIntroducerInfo,
          assigned_shipper_id: assignedShipperId,
          receiver_name: orderInput.recipient_name || fullName,
          receiver_phone: orderInput.recipient_phone ? orderInput.recipient_phone.replace(/\D/g, "") : rawPhone,
          delivery_type: dbDeliveryType,
          shipping_address_snapshot: address,
          subtotal: calculatedSubtotal,
          shipping_fee: shippingFee,
          voucher_id: reservedVoucherId,
          voucher_discount: discountAmount,
          final_amount: finalAmount,
          order_status: "pending",
          payment_status: "pending",
          delivery_status: "not_ready",
          payment_method: "banking",
          customer_note: orderInput.customer_note || null,
        })
        .select("order_id, order_code")
        .single();

      if (insertResult.error) {
        // PostgreSQL error code 23505 = unique_violation.
        // The orders table has UNIQUE(order_code) and a separate UNIQUE constraint on
        // order_code. We only retry on this specific violation. Other errors (e.g.
        // FK violations, connection issues) are NOT retried to avoid side-effect
        // duplication (stock was already deducted, voucher not yet incremented, etc.).
        if (insertResult.error.code === "23505") {
          codeAttempt++;
          continue;
        }
        orderError = { code: insertResult.error.code, message: insertResult.error.message };
        break;
      }

      createdOrder = insertResult.data;
      orderInserted = true;
    }

    if (!orderInserted || !createdOrder) {
      console.error("[createOrderServer] Order insert failed after retries:", orderError);
      // CRITICAL: Restore stock that was deducted at step 6 since order was not created
      for (const prev of successfullyDeductedItems) {
        if (prev.variant_id) {
          const { data: currentV } = await supabase
            .from("product_variants")
            .select("stock")
            .eq("variant_id", prev.variant_id)
            .maybeSingle();
          if (currentV) {
            await supabase
              .from("product_variants")
              .update({ stock: (currentV.stock || 0) + prev.qty })
              .eq("variant_id", prev.variant_id);
            // Also sync parent product stock
            if (prev.product_id) {
              const { data: allVars } = await supabase
                .from("product_variants")
                .select("stock")
                .eq("product_id", prev.product_id);
              const totalStock = (allVars || []).reduce((sum: number, v: any) => sum + (v.stock || 0), 0);
              await supabase
                .from("products")
                .update({ stock: totalStock, updated_at: new Date().toISOString() })
                .eq("product_id", prev.product_id);
            }
          }
        } else if (prev.product_id) {
          const { data: currentP } = await supabase
            .from("products")
            .select("stock")
            .eq("product_id", prev.product_id)
            .maybeSingle();
          if (currentP) {
            await supabase
              .from("products")
              .update({ stock: (currentP.stock || 0) + prev.qty })
              .eq("product_id", prev.product_id);
          }
        }
      }
      await releaseReservedVoucherSlot();
      return {
        success: false,
        error: orderError?.message || "Không thể tạo mã đơn hàng duy nhất sau nhiều lần thử.",
      };
    }

    // 10. Insert Order Items Snapshot
    const orderItemsToInsert = verifiedOrderItems.map((it) => ({
      order_id: createdOrder.order_id,
      item_name_snapshot: it.item_name_snapshot,
      variant_name_snapshot: it.variant_name_snapshot,
      sku_snapshot: it.sku_snapshot,
      quantity: it.quantity,
      unit_price: it.unit_price,
      subtotal: it.subtotal,
    }));

    const { error: orderItemsError } = await supabase.from("order_items").insert(orderItemsToInsert);
    if (orderItemsError) {
      console.error("[createOrderServer] order-items-insert-failed", {
        orderId: createdOrder.order_id,
        error: orderItemsError.message,
      });
    }

    // 11. Log initial Status History
    try {
      await supabase.from("order_status_history").insert({
        order_id: createdOrder.order_id,
        status_type: "order",
        from_status: null,
        to_status: "pending",
        note: "Đơn hàng được khởi tạo từ website",
      });
    } catch {
      // ignore
    }

    const proofToken = createOrderProofToken(createdOrder.order_code, createdOrder.order_id);

    return {
      success: true,
      orderId: createdOrder.order_id,
      orderCode: createdOrder.order_code,
      finalAmount,
      proofToken,
    };
  } catch (err: any) {
    console.error("[createOrderServer] Exception:", err);
    await releaseReservedVoucherSlot();
    return { success: false, error: err?.message || "Lỗi máy chủ khi xử lý đơn hàng" };
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
      return [];
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
          return (isAdmin || options?.code) ? parsed : undefined;
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
          product_name: it.item_name_snapshot,
          variant_name: it.variant_name_snapshot,
          sku: it.sku_snapshot,
          quantity: it.quantity,
          unit_price: it.unit_price,
          price: it.unit_price,
          subtotal: it.subtotal,
        })),
      };
    });
  } catch (err) {
    console.error("[getOrdersServer] Exception:", err);
    return [];
  }
}
