import { createAdminClient } from "@/lib/supabase/admin";
import type { Order, OrderItem } from "@/types/database";

/**
 * Creates an order in Supabase PostgreSQL:
 * 1. Upserts customer by phone
 * 2. Creates order record
 * 3. Inserts order items snapshots
 * 4. Logs order status history
 */
export async function createOrderServer(orderData: Partial<Order> & { items: OrderItem[] }): Promise<{
  success: boolean;
  orderId?: string;
  orderCode?: string;
  error?: string;
}> {
  try {
    const supabase = createAdminClient();
    const phone = (orderData.buyer_phone || orderData.recipient_phone || "").trim().replace(/\s+/g, "");
    const fullName = orderData.buyer_name || orderData.recipient_name || "Khách hàng Gieo Mơ";
    const email = orderData.buyer_email || null;
    const address = orderData.address_detail ? `${orderData.address_detail}, ${orderData.district || ""}, ${orderData.province || ""}`.trim() : null;

    if (!phone) {
      return { success: false, error: "Số điện thoại người mua là bắt buộc" };
    }

    // 1. Upsert customer
    let customerId: string | null = null;
    const { data: existingCustomer } = await supabase
      .from("customers")
      .select("customer_id")
      .eq("phone", phone)
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
      const { data: newCustomer, error: custError } = await supabase
        .from("customers")
        .insert({
          full_name: fullName,
          phone: phone,
          email: email,
          default_address: address,
        })
        .select("customer_id")
        .single();

      if (custError) {
        console.error("[createOrderServer] Error creating customer:", custError);
      } else if (newCustomer) {
        customerId = newCustomer.customer_id;
      }
    }

    // If customerId is still null, generate a fallback uuid
    if (!customerId) {
      const { data: fallbackCust } = await supabase
        .from("customers")
        .select("customer_id")
        .eq("phone", phone)
        .maybeSingle();
      customerId = fallbackCust?.customer_id || null;
    }

    // 2. Prepare Order Record
    const orderCode = orderData.order_code || `GM-${Math.floor(100000 + Math.random() * 900000)}`;
    const subtotal = orderData.subtotal ?? 0;
    const shippingFee = orderData.shipping_fee ?? 0;
    const finalAmount = orderData.final_amount ?? (subtotal + shippingFee);

    // Map delivery type to DB enum: 'home_delivery' | 'pickup_point' | 'self_pickup'
    let dbDeliveryType: "home_delivery" | "pickup_point" | "self_pickup" = "home_delivery";
    if (orderData.delivery_type === "pickup_point") dbDeliveryType = "pickup_point";
    else if (orderData.delivery_type === "self_pickup" || orderData.delivery_type === "member_delivery") dbDeliveryType = "self_pickup";

    // Map payment method to DB enum: 'cod' | 'banking' | 'momo'
    let dbPaymentMethod: "cod" | "banking" | "momo" = "banking";
    if (orderData.payment_method === "cod") dbPaymentMethod = "cod";
    else if (orderData.payment_method === "momo") dbPaymentMethod = "momo";

    const { data: createdOrder, error: orderError } = await supabase
      .from("orders")
      .insert({
        order_code: orderCode,
        customer_id: customerId!,
        source_type: "landing_page",
        introducer_info: orderData.introducer_info || "Trực tiếp (Website)",
        receiver_name: orderData.recipient_name || fullName,
        receiver_phone: orderData.recipient_phone || phone,
        delivery_type: dbDeliveryType,
        shipping_address_snapshot: address,
        subtotal: subtotal,
        shipping_fee: shippingFee,
        voucher_discount: orderData.discount_amount || 0,
        final_amount: finalAmount,
        order_status: "pending",
        payment_status: "pending",
        delivery_status: "not_ready",
        payment_method: dbPaymentMethod,
        customer_note: orderData.customer_note || null,
      })
      .select("order_id, order_code")
      .single();

    if (orderError || !createdOrder) {
      console.error("[createOrderServer] Error creating order:", orderError);
      return { success: false, error: orderError?.message || "Lỗi tạo đơn hàng trong cơ sở dữ liệu" };
    }

    // 3. Insert Order Items
    if (orderData.items && orderData.items.length > 0) {
      const itemsToInsert = orderData.items.map((item: any) => ({
        order_id: createdOrder.order_id,
        item_name_snapshot: item.product_name || item.item_name_snapshot || item.product_name_snapshot || "Sản phẩm Mầm Mơ",
        variant_name_snapshot: item.variant_name || item.variant_name_snapshot || null,
        sku_snapshot: item.sku || item.sku_snapshot || null,
        quantity: item.quantity || 1,
        unit_price: item.price ?? item.unit_price ?? item.price_snapshot ?? 0,
        subtotal: item.subtotal ?? ((item.price ?? item.unit_price ?? 0) * (item.quantity || 1)),
      }));

      const { error: itemsError } = await supabase
        .from("order_items")
        .insert(itemsToInsert);

      if (itemsError) {
        console.warn("[createOrderServer] Could not insert items:", itemsError);
      }
    }

    // 4. Log initial status history
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
    };
  } catch (err: any) {
    console.error("[createOrderServer] Unexpected error:", err);
    return { success: false, error: err?.message || "Lỗi không xác định khi lưu đơn" };
  }
}

/**
 * Fetch orders from Supabase (for Admin list or Track order by code/phone)
 */
export async function getOrdersServer(options?: {
  code?: string;
  phone?: string;
  limit?: number;
}) {
  try {
    const supabase = createAdminClient();
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
        created_at,
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
          quantity,
          unit_price,
          subtotal
        )
      `)
      .order("created_at", { ascending: false });

    if (options?.code) {
      query = query.eq("order_code", options.code.trim().toUpperCase());
    } else if (options?.phone) {
      const cleanPhone = options.phone.trim().replace(/\s+/g, "");
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
    return data || [];
  } catch (err) {
    console.error("[getOrdersServer] Exception:", err);
    return [];
  }
}
