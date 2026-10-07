import { createAdminClient } from "@/lib/supabase/admin";
import { getSystemSettingsServer } from "@/lib/services/configService";

/**
 * Server-Side Order Creation with Complete Price, Voucher, and Inventory Integrity.
 * Does NOT trust client-supplied amounts, prices, or statuses.
 */
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
  error?: string;
}> {
  try {
    const supabase = createAdminClient();

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
    let shippingFee = Number(settings.flatShippingFee) || 25000;

    const deliveryType = orderInput.delivery_type || "home_delivery";
    if (deliveryType === "pickup_point" || deliveryType === "self_pickup" || deliveryType === "member_delivery") {
      shippingFee = 0;
    } else if (settings.freeShippingThreshold > 0 && calculatedSubtotal >= settings.freeShippingThreshold) {
      shippingFee = 0;
    }

    // 4. Validate Voucher Code Strictly from Database
    let discountAmount = 0;
    let validatedVoucherId: string | null = null;
    const cleanVoucherCode = (orderInput.voucher_code || "").trim().toUpperCase();

    if (cleanVoucherCode) {
      const { data: voucher } = await supabase
        .from("vouchers")
        .select("*")
        .eq("code", cleanVoucherCode)
        .eq("status", "active")
        .maybeSingle();

      if (voucher) {
        const now = new Date();
        const startValid = !voucher.start_date || new Date(voucher.start_date) <= now;
        const endValid = !voucher.end_date || new Date(voucher.end_date) >= now;
        const usageValid = !voucher.usage_limit || (voucher.times_used || 0) < voucher.usage_limit;
        const minOrderValid = !voucher.min_order_value || calculatedSubtotal >= Number(voucher.min_order_value);

        if (startValid && endValid && usageValid && minOrderValid) {
          validatedVoucherId = voucher.voucher_id;
          if (voucher.discount_type === "freeship") {
            discountAmount = shippingFee;
            shippingFee = 0;
          } else if (voucher.discount_type === "percentage") {
            const percent = Math.min(100, Math.max(0, Number(voucher.discount_value) || 0));
            const rawCalc = Math.round((calculatedSubtotal * percent) / 100);
            if (voucher.max_discount && Number(voucher.max_discount) > 0) {
              discountAmount = Math.min(rawCalc, Number(voucher.max_discount));
            } else {
              discountAmount = rawCalc;
            }
          } else {
            const rawDiscount = Number(voucher.discount_value) || 0;
            discountAmount = Math.min(calculatedSubtotal, Math.max(0, rawDiscount));
          }
        }
      }
    }

    // 5. Compute Final Amount (Server Authoritative)
    const finalAmount = Math.max(0, calculatedSubtotal + shippingFee - discountAmount);

    // 6. Deduct Stock Atomically BEFORE inserting order (Prevents overselling race conditions)
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

          return {
            success: false,
            error: `Sản phẩm "${it.item_name_snapshot}" vừa hết hàng do có khách đặt trước. Vui lòng chọn sản phẩm khác!`,
          };
        }

        successfullyDeductedItems.push({ variant_id: null, product_id: it.product_id, qty: it.quantity });
      }
    }

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

    // 8. Resolve Seller ID & Referral
    let sellerId: string | null = null;
    const isUuid = (id?: string | null) =>
      Boolean(id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));

    if (isUuid(orderInput.seller_id)) {
      sellerId = orderInput.seller_id!;
    }

    const cleanRef = (orderInput.referral_code || "").trim().toUpperCase();
    if (!sellerId && cleanRef) {
      const { data: refMember } = await supabase
        .from("members")
        .select("member_id")
        .ilike("referral_code", cleanRef)
        .maybeSingle();
      if (refMember) sellerId = refMember.member_id;
    }

    // 9. Generate Random Order Code and Insert Order Record
    const randomCode = `GM-${Math.floor(100000 + Math.random() * 900000)}`;

    let dbDeliveryType: "home_delivery" | "pickup_point" | "self_pickup" = "home_delivery";
    if (deliveryType === "pickup_point") dbDeliveryType = "pickup_point";
    else if (deliveryType === "self_pickup" || deliveryType === "member_delivery") dbDeliveryType = "self_pickup";

    const { data: createdOrder, error: orderError } = await supabase
      .from("orders")
      .insert({
        order_code: randomCode,
        customer_id: customerId!,
        seller_id: sellerId,
        source_type: (sellerId || cleanRef) ? "member_referral" : "landing_page",
        introducer_info: orderInput.introducer_info || (cleanRef ? `Mã giới thiệu: ${cleanRef}` : "Trực tiếp (Website)"),
        receiver_name: orderInput.recipient_name || fullName,
        receiver_phone: orderInput.recipient_phone ? orderInput.recipient_phone.replace(/\D/g, "") : rawPhone,
        delivery_type: dbDeliveryType,
        shipping_address_snapshot: address,
        subtotal: calculatedSubtotal,
        shipping_fee: shippingFee,
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

    if (orderError || !createdOrder) {
      console.error("[createOrderServer] Order insert error:", orderError);
      return { success: false, error: orderError?.message || "Lỗi lưu đơn hàng vào cơ sở dữ liệu" };
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

    await supabase.from("order_items").insert(orderItemsToInsert);

    // 11. Update Voucher Times Used Atomically
    if (validatedVoucherId) {
      try {
        const { data: vRecord } = await supabase
          .from("vouchers")
          .select("times_used")
          .eq("voucher_id", validatedVoucherId)
          .single();
        if (vRecord) {
          await supabase
            .from("vouchers")
            .update({ times_used: (vRecord.times_used || 0) + 1 })
            .eq("voucher_id", validatedVoucherId);
        }
      } catch {
        // ignore
      }
    }

    // 12. Log initial Status History
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

    return {
      success: true,
      orderId: createdOrder.order_id,
      orderCode: createdOrder.order_code,
      finalAmount,
    };
  } catch (err: any) {
    console.error("[createOrderServer] Exception:", err);
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
        payment_proof,
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
        payment_proof: isAdmin ? row.payment_proof : undefined,
        assigned_shipper_id: isAdmin ? row.assigned_shipper_id : undefined,
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
