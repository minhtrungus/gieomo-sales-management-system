"use client";

import type { Order, OrderStatus, PaymentStatus, DeliveryStatus, PickupPoint, ContactMessage, Voucher, Warehouse, ProductCategory, Combo } from "@/types/database";
import { MOCK_ORDERS, MOCK_VOUCHERS, MOCK_PRODUCTS, MOCK_WAREHOUSES, MOCK_CATEGORIES, MOCK_COMBOS, type ExtendedProduct, type ExtendedCombo } from "./mockData";

export type { ExtendedProduct, ExtendedCombo };

export interface PaymentRecord {
  paymentId: string;
  orderCode: string;
  amount: number;
  paymentMethod: string;
  transactionCode: string;
  status: "pending" | "paid";
  createdAt: string;
}

const SEED_PAYMENTS: PaymentRecord[] = [
  {
    paymentId: "pay-369817",
    orderCode: "GM-369817",
    amount: 110000,
    paymentMethod: "banking",
    transactionCode: "MB-3698170",
    status: "pending",
    createdAt: "Vừa xong",
  },
  {
    paymentId: "pay-1",
    orderCode: "GM-260901",
    amount: 145000,
    paymentMethod: "banking",
    transactionCode: "MB-8891231",
    status: "paid",
    createdAt: "14:30 21/09/2026",
  },
  {
    paymentId: "pay-2",
    orderCode: "GM-260902",
    amount: 85000,
    paymentMethod: "banking",
    transactionCode: "MB-8891235",
    status: "pending",
    createdAt: "09:15 22/09/2026",
  },
  {
    paymentId: "pay-3",
    orderCode: "GM-260904",
    amount: 145000,
    paymentMethod: "banking",
    transactionCode: "MB-8891240",
    status: "pending",
    createdAt: "15:20 22/09/2026",
  },
];

let cachedOrders: Order[] | null = null;
let cachedPayments: PaymentRecord[] | null = null;
let cachedVouchers: Voucher[] | null = null;
let cachedProducts: ExtendedProduct[] | null = null;
let cachedWarehouses: Warehouse[] | null = null;

export function getStoredOrders(): Order[] {
  if (typeof window === "undefined") return MOCK_ORDERS;
  if (cachedOrders !== null) return cachedOrders;
  try {
    const raw = localStorage.getItem("gieomo_orders");
    let orders: Order[] = raw ? JSON.parse(raw) : [...MOCK_ORDERS];

    // Ensure all seed orders (GM-369817, Mai Lan's 15 orders, etc.) are present
    let hasAdded = false;
    for (const mockOrd of MOCK_ORDERS) {
      if (!orders.some((o) => o.order_code === mockOrd.order_code)) {
        orders.push(mockOrd);
        hasAdded = true;
      }
    }

    if (hasAdded || !raw) {
      localStorage.setItem("gieomo_orders", JSON.stringify(orders));
    }
    cachedOrders = orders;
    return orders;
  } catch (e) {
    console.error("Error reading gieomo_orders from localStorage", e);
    return MOCK_ORDERS;
  }
}

export function saveNewOrder(newOrder: Order): void {
  if (typeof window === "undefined") return;
  try {
    // Auto-assign fulfillment warehouse if not specified
    if (!newOrder.warehouse_id) {
      if (newOrder.delivery_type === "pickup_point" && newOrder.pickup_point_id === "pp-3") {
        newOrder.warehouse_id = "wh-2";
        newOrder.warehouse_name = "Kho Cơ Sở 2 (Thủ Đức)";
      } else {
        newOrder.warehouse_id = "wh-1";
        newOrder.warehouse_name = "Kho Trung Tâm (Quận 3)";
      }
    }

    const orders = getStoredOrders();
    const updated = [newOrder, ...orders.filter((o) => o.order_id !== newOrder.order_id && o.order_code !== newOrder.order_code)];
    cachedOrders = updated;
    localStorage.setItem("gieomo_orders", JSON.stringify(updated));

    // Deduct inventory stock atomically
    if (newOrder.items && newOrder.items.length > 0) {
      try {
        const products = getStoredProducts();
        const targetWhId = newOrder.warehouse_id || "wh-1";
        let prodsChanged = false;

        const updatedProds = products.map((prod) => {
          let prodModified = false;
          const updatedVariants = prod.variants?.map((v) => {
            const matchingItem = newOrder.items?.find(
              (it) => it.product_id === prod.product_id && (it.variant_id ? it.variant_id === v.variant_id : true)
            );
            if (matchingItem) {
              prodModified = true;
              prodsChanged = true;
              const qty = matchingItem.quantity || 1;
              const stocks = { ...(v.warehouse_stocks || {}) };
              let wh1 = v.stock_warehouse_1 ?? Math.ceil((v.stock || 0) * 0.7);
              let wh2 = v.stock_warehouse_2 ?? ((v.stock || 0) - wh1);
              if (targetWhId === "wh-1") {
                wh1 = Math.max(0, wh1 - qty);
              } else if (targetWhId === "wh-2") {
                wh2 = Math.max(0, wh2 - qty);
              }
              const currentTargetStock = stocks[targetWhId] ?? (targetWhId === "wh-1" ? wh1 : targetWhId === "wh-2" ? wh2 : 0);
              stocks[targetWhId] = Math.max(0, currentTargetStock - qty);
              const newTotalStock = Math.max(0, (v.stock || 0) - qty);
              return {
                ...v,
                stock: newTotalStock,
                stock_warehouse_1: wh1,
                stock_warehouse_2: wh2,
                warehouse_stocks: stocks,
              };
            }
            return v;
          });
          return prodModified ? { ...prod, variants: updatedVariants } : prod;
        });

        if (prodsChanged) {
          cachedProducts = updatedProds;
          localStorage.setItem("gieomo_products", JSON.stringify(updatedProds));
          window.dispatchEvent(new Event("gieomo_products_updated"));
        }
      } catch (e) {
        console.error("Error deducting inventory stock", e);
      }
    }

    // Auto-sync customer record
    try {
      const custRaw = localStorage.getItem("gieomo_customers");
      const custList = custRaw ? JSON.parse(custRaw) : [];
      const cleanPhone = (newOrder.buyer_phone || newOrder.recipient_phone || "").replace(/\s+/g, "");
      if (cleanPhone) {
        const existingIdx = custList.findIndex((c: any) => c.phone?.replace(/\s+/g, "") === cleanPhone);
        if (existingIdx >= 0) {
          custList[existingIdx].totalOrders = (custList[existingIdx].totalOrders || 0) + 1;
          custList[existingIdx].totalSpent = (custList[existingIdx].totalSpent || 0) + (newOrder.final_amount || 0);
          if (newOrder.buyer_name) custList[existingIdx].fullName = newOrder.buyer_name;
          if (newOrder.buyer_email) custList[existingIdx].email = newOrder.buyer_email;
          if (newOrder.address_detail) custList[existingIdx].address = `${newOrder.address_detail}, ${newOrder.district || ""}, ${newOrder.province || ""}`;
        } else {
          custList.unshift({
            customerId: `cust-${Date.now()}`,
            fullName: newOrder.buyer_name || newOrder.recipient_name || "Khách hàng",
            phone: cleanPhone,
            email: newOrder.buyer_email || "",
            address: `${newOrder.address_detail || ""}, ${newOrder.district || ""}, ${newOrder.province || ""}`,
            totalOrders: 1,
            totalSpent: newOrder.final_amount || 0,
            createdAt: newOrder.created_at,
          });
        }
        localStorage.setItem("gieomo_customers", JSON.stringify(custList));
        window.dispatchEvent(new Event("gieomo_customers_updated"));
      }
    } catch {
      // ignore
    }

    // If banking payment method, automatically add to payments list
    if (newOrder.payment_method === "banking") {
      const payments = getStoredPayments();
      const newPay: PaymentRecord = {
        paymentId: `pay-${newOrder.order_id}`,
        orderCode: newOrder.order_code,
        amount: newOrder.final_amount,
        paymentMethod: "banking",
        transactionCode: `MB-${Math.floor(1000000 + Math.random() * 9000000)}`,
        status: newOrder.payment_status === "paid" ? "paid" : "pending",
        createdAt: "Vừa xong",
      };
      const updatedPayments = [newPay, ...payments.filter((p) => p.orderCode !== newOrder.order_code)];
      localStorage.setItem("gieomo_payments", JSON.stringify(updatedPayments));
    }

    // Add notification to admin notifications mailbox
    try {
      const notifRaw = localStorage.getItem("gieomo_admin_notifications");
      const notifs = notifRaw ? JSON.parse(notifRaw) : [];
      const newNotif = {
        id: `notif-ord-${Date.now()}`,
        type: "order",
        title: `Đơn hàng mới #${newOrder.order_code}`,
        desc: `Khách hàng ${newOrder.buyer_name || "Khách"} vừa hoàn tất đặt đơn trị giá ${newOrder.final_amount.toLocaleString("vi-VN")}đ.`,
        created_at: new Date().toISOString(),
        read: false,
        starred: false,
        link: `/admin/orders/${newOrder.order_id}`,
        meta: {
          order_code: newOrder.order_code,
          amount: newOrder.final_amount,
          customer: newOrder.buyer_name,
        },
      };
      localStorage.setItem("gieomo_admin_notifications", JSON.stringify([newNotif, ...notifs]));
      window.dispatchEvent(new Event("gieomo_notifications_updated"));
    } catch {
      // ignore
    }

    // Sync order to Supabase PostgreSQL database
    fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newOrder),
    }).catch((err) => {
      console.warn("[saveNewOrder] Failed to sync order to Supabase:", err);
    });

    window.dispatchEvent(new Event("gieomo_orders_updated"));
  } catch (e) {
    console.error("Error saving new order", e);
  }
}

export function updateStoredOrderStatus(orderId: string, newStatus: OrderStatus): void {
  if (typeof window === "undefined") return;
  try {
    const orders = getStoredOrders();
    const updated = orders.map((o) =>
      o.order_id === orderId || o.order_code === orderId
        ? {
            ...o,
            order_status: newStatus,
            completed_at: newStatus === "completed" ? new Date().toISOString() : o.completed_at,
          }
        : o
    );
    cachedOrders = updated;
    localStorage.setItem("gieomo_orders", JSON.stringify(updated));

    // Sync order status update to Supabase
    fetch("/api/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId,
        orderStatus: newStatus,
      }),
    }).catch((err) => {
      console.warn("[updateStoredOrderStatus] Failed to sync status to Supabase:", err);
    });

    // Restore stock if order is cancelled
    if (newStatus === "cancelled") {
      const cancelledOrder = orders.find((o) => o.order_id === orderId || o.order_code === orderId);
      if (cancelledOrder && cancelledOrder.items && cancelledOrder.items.length > 0) {
        try {
          const prods = getStoredProducts();
          const targetWhId = cancelledOrder.warehouse_id || "wh-1";
          let prodsChanged = false;
          const restored = prods.map((prod) => {
            let prodModified = false;
            const updatedVariants = prod.variants?.map((v) => {
              const matchingItem = cancelledOrder.items?.find(
                (it) => it.product_id === prod.product_id && (it.variant_id ? it.variant_id === v.variant_id : true)
              );
              if (matchingItem) {
                prodModified = true;
                prodsChanged = true;
                const qty = matchingItem.quantity || 1;
                const stocks = { ...(v.warehouse_stocks || {}) };
                let wh1 = v.stock_warehouse_1 ?? 0;
                let wh2 = v.stock_warehouse_2 ?? 0;
                if (targetWhId === "wh-1") wh1 += qty;
                else if (targetWhId === "wh-2") wh2 += qty;
                stocks[targetWhId] = (stocks[targetWhId] ?? 0) + qty;
                return {
                  ...v,
                  stock: (v.stock || 0) + qty,
                  stock_warehouse_1: wh1,
                  stock_warehouse_2: wh2,
                  warehouse_stocks: stocks,
                };
              }
              return v;
            });
            return prodModified ? { ...prod, variants: updatedVariants } : prod;
          });
          if (prodsChanged) {
            cachedProducts = restored;
            localStorage.setItem("gieomo_products", JSON.stringify(restored));
            window.dispatchEvent(new Event("gieomo_products_updated"));
          }
        } catch {
          // ignore
        }
      }
    }

    window.dispatchEvent(new Event("gieomo_orders_updated"));
  } catch (e) {
    console.error("Error updating order status", e);
  }
}

export function updateStoredPaymentStatus(orderCodeOrId: string, paymentStatus: PaymentStatus): void {
  if (typeof window === "undefined") return;
  try {
    const orders = getStoredOrders();
    let justPaidOrder: Order | null = null;

    const updated = orders.map((o) => {
      if (o.order_id === orderCodeOrId || o.order_code === orderCodeOrId) {
        if (o.payment_status !== "paid" && paymentStatus === "paid") {
          justPaidOrder = { ...o, payment_status: paymentStatus };
        }
        return {
          ...o,
          payment_status: paymentStatus,
          updated_at: new Date().toISOString(),
        };
      }
      return o;
    });

    cachedOrders = updated;
    localStorage.setItem("gieomo_orders", JSON.stringify(updated));

    // Guard: Only fire payment notification when payment has been completed (paid)
    if (justPaidOrder) {
      try {
        const notifRaw = localStorage.getItem("gieomo_admin_notifications");
        const notifs = notifRaw ? JSON.parse(notifRaw) : [];
        const newNotif = {
          id: `notif-paid-${Date.now()}`,
          type: "payment",
          title: `💰 Đơn hàng #${(justPaidOrder as Order).order_code} đã thanh toán thành công`,
          desc: `Nhận ${(justPaidOrder as Order).final_amount.toLocaleString("vi-VN")}đ từ ${(justPaidOrder as Order).buyer_name || "Khách hàng"}.`,
          created_at: new Date().toISOString(),
          read: false,
          starred: true,
          link: `/admin/orders/${(justPaidOrder as Order).order_id}`,
        };
        localStorage.setItem("gieomo_admin_notifications", JSON.stringify([newNotif, ...notifs]));
      } catch {
        // ignore
      }
    }

    // Sync payment status to Supabase
    fetch("/api/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: orderCodeOrId,
        paymentStatus,
      }),
    }).catch((err) => {
      console.warn("[updateStoredPaymentStatus] Failed to sync payment status to Supabase:", err);
    });

    window.dispatchEvent(new Event("gieomo_orders_updated"));
  } catch (e) {
    console.error("Error updating payment status", e);
  }
}

export function updateStoredOrderNotes(orderId: string, notes: { customer_note?: string; internal_note?: string }): void {
  if (typeof window === "undefined") return;
  try {
    const orders = getStoredOrders();
    const updated = orders.map((o) =>
      o.order_id === orderId || o.order_code === orderId
        ? {
            ...o,
            customer_note: notes.customer_note !== undefined ? notes.customer_note : o.customer_note,
            internal_note: notes.internal_note !== undefined ? notes.internal_note : o.internal_note,
            updated_at: new Date().toISOString(),
          }
        : o
    );
    cachedOrders = updated;
    localStorage.setItem("gieomo_orders", JSON.stringify(updated));
    window.dispatchEvent(new Event("gieomo_orders_updated"));
  } catch (e) {
    console.error("Error updating order notes", e);
  }
}

export function updateStoredOrderWarehouse(orderId: string, warehouseId: string): void {
  if (typeof window === "undefined") return;
  try {
    const orders = getStoredOrders();
    const warehouseName = warehouseId === "wh-2" ? "Kho Cơ Sở 2 (Thủ Đức)" : "Kho Trung Tâm (Quận 3)";
    const updated = orders.map((o) =>
      o.order_id === orderId || o.order_code === orderId
        ? {
            ...o,
            warehouse_id: warehouseId,
            warehouse_name: warehouseName,
            updated_at: new Date().toISOString(),
          }
        : o
    );
    cachedOrders = updated;
    localStorage.setItem("gieomo_orders", JSON.stringify(updated));
    window.dispatchEvent(new Event("gieomo_orders_updated"));
  } catch (e) {
    console.error("Error updating order warehouse", e);
  }
}

export function getStoredPayments(): PaymentRecord[] {
  if (typeof window === "undefined") return SEED_PAYMENTS;
  if (cachedPayments !== null) return cachedPayments;
  try {
    const raw = localStorage.getItem("gieomo_payments");
    let payments: PaymentRecord[] = raw ? JSON.parse(raw) : [...SEED_PAYMENTS];
    const targetPay = SEED_PAYMENTS.find((p) => p.orderCode === "GM-369817");
    if (targetPay && !payments.some((p) => p.orderCode === "GM-369817")) {
      payments = [targetPay, ...payments];
      localStorage.setItem("gieomo_payments", JSON.stringify(payments));
    } else if (!raw) {
      localStorage.setItem("gieomo_payments", JSON.stringify(payments));
    }
    cachedPayments = payments;
    return payments;
  } catch (e) {
    console.error("Error reading gieomo_payments", e);
    return SEED_PAYMENTS;
  }
}

export function approveStoredPayment(paymentId: string): void {
  if (typeof window === "undefined") return;
  try {
    const payments = getStoredPayments();
    let approvedOrderCode = "";
    const updatedPayments = payments.map((p) => {
      if (p.paymentId === paymentId) {
        approvedOrderCode = p.orderCode;
        return { ...p, status: "paid" as const };
      }
      return p;
    });
    cachedPayments = updatedPayments;
    localStorage.setItem("gieomo_payments", JSON.stringify(updatedPayments));

    if (approvedOrderCode) {
      updateStoredPaymentStatus(approvedOrderCode, "paid");
    }
    window.dispatchEvent(new Event("gieomo_orders_updated"));
  } catch (e) {
    console.error("Error approving payment", e);
  }
}

// === PICKUP POINTS STORE ===

export const SEED_PICKUP_POINTS: PickupPoint[] = [
  {
    pickup_point_id: "pp-1",
    name: "Điểm 1 — ĐH Kinh Tế TP.HCM (Cơ sở B)",
    address: "279 Nguyễn Tri Phương, Phường 5, Quận 10, TP.HCM",
    contact_name: "Nguyễn Thị Mai Lan (Ban Điều Phối)",
    contact_phone: "0901 234 567",
    opening_hours: "Thứ 2 - Thứ 6: 11h30 - 13h00 & 16h30 - 18h00",
    location_guide: "Bàn trực thiện nguyện Gieo Mơ tại sảnh tòa B1 (đối diện thang máy)",
    status: "active",
  },
  {
    pickup_point_id: "pp-2",
    name: "Điểm 2 — Trụ sở Dự Án Mầm Mơ (Quận 3)",
    address: "145 Nam Kỳ Khởi Nghĩa, Phường Võ Thị Sáu, Quận 3, TP.HCM",
    contact_name: "Trần Minh Quân (Phụ trách Kho)",
    contact_phone: "0987 654 321",
    opening_hours: "Thứ 2 - Thứ 7: 08h30 - 18h30",
    location_guide: "Phòng 204 lầu 2, bấm chuông Mầm Mơ hoặc gọi trước khi tới",
    status: "active",
  },
  {
    pickup_point_id: "pp-3",
    name: "Điểm 3 — KTX Đại Học Quốc Gia (Khu B)",
    address: "Khu B KTX ĐHQG-HCM, TP. Dĩ An / Thủ Đức",
    contact_name: "Lê Hoàng Phúc (Tình nguyện viên)",
    contact_phone: "0912 345 678",
    opening_hours: "Mỗi tối: 19h00 - 21h30 (Hẹn trước)",
    location_guide: "Sảnh nhà B3, liên hệ Zalo hoặc gọi Phúc trước 15 phút",
    status: "active",
  },
];

export function getStoredPickupPoints(): PickupPoint[] {
  if (typeof window === "undefined") return SEED_PICKUP_POINTS;
  try {
    const raw = localStorage.getItem("gieomo_pickup_points");
    if (!raw) {
      localStorage.setItem("gieomo_pickup_points", JSON.stringify(SEED_PICKUP_POINTS));
      return SEED_PICKUP_POINTS;
    }
    return JSON.parse(raw);
  } catch {
    return SEED_PICKUP_POINTS;
  }
}

export function saveStoredPickupPoint(point: PickupPoint): void {
  if (typeof window === "undefined") return;
  try {
    const list = getStoredPickupPoints();
    const existingIndex = list.findIndex((p) => p.pickup_point_id === point.pickup_point_id);
    let updated: PickupPoint[];
    if (existingIndex >= 0) {
      updated = list.map((p) => (p.pickup_point_id === point.pickup_point_id ? point : p));
    } else {
      updated = [point, ...list];
    }
    localStorage.setItem("gieomo_pickup_points", JSON.stringify(updated));
    window.dispatchEvent(new Event("gieomo_pickup_points_updated"));
  } catch (e) {
    console.error("Error saving pickup point", e);
  }
}

export function deleteStoredPickupPoint(pointId: string): void {
  if (typeof window === "undefined") return;
  try {
    const list = getStoredPickupPoints();
    const updated = list.filter((p) => p.pickup_point_id !== pointId);
    localStorage.setItem("gieomo_pickup_points", JSON.stringify(updated));
    window.dispatchEvent(new Event("gieomo_pickup_points_updated"));
  } catch (e) {
    console.error("Error deleting pickup point", e);
  }
}

// === CONTACT MESSAGES STORE ===

const SEED_CONTACT_MESSAGES: ContactMessage[] = [
  {
    id: "msg-1",
    name: "Đặng Thị Thảo",
    email: "thaodang@gmail.com",
    phone: "0908123456",
    message: "Chào Mầm Mơ, mình là cựu sinh viên muốn tài trợ thêm 20 túi vải cho các em học sinh ở điểm trường miền núi. Bên mình có hỗ trợ xuất hoá đơn hoặc giấy chứng nhận đóng góp không ạ?",
    status: "unread",
    created_at: new Date(Date.now() - 3600000 * 4).toISOString(),
  },
  {
    id: "msg-2",
    name: "Vũ Hải Nam",
    email: "hainam.vu@company.vn",
    phone: "0918765432",
    message: "Doanh nghiệp của mình muốn đặt 50 set combo quà tặng cuối năm cho nhân viên, vui lòng liên hệ lại mình qua SĐT nhé!",
    status: "read",
    created_at: new Date(Date.now() - 3600000 * 28).toISOString(),
  },
];

export function getStoredContactMessages(): ContactMessage[] {
  if (typeof window === "undefined") return SEED_CONTACT_MESSAGES;
  try {
    const raw = localStorage.getItem("gieomo_contact_messages");
    if (!raw) {
      localStorage.setItem("gieomo_contact_messages", JSON.stringify(SEED_CONTACT_MESSAGES));
      return SEED_CONTACT_MESSAGES;
    }
    return JSON.parse(raw);
  } catch {
    return SEED_CONTACT_MESSAGES;
  }
}

export function saveContactMessage(msg: Omit<ContactMessage, "id" | "status" | "created_at">): ContactMessage {
  const newMsg: ContactMessage = {
    ...msg,
    id: `msg-${Date.now()}`,
    status: "unread",
    created_at: new Date().toISOString(),
  };

  if (typeof window !== "undefined") {
    try {
      const list = getStoredContactMessages();
      const updated = [newMsg, ...list];
      localStorage.setItem("gieomo_contact_messages", JSON.stringify(updated));

      // Add admin notification
      const notifRaw = localStorage.getItem("gieomo_admin_notifications");
      const notifs = notifRaw ? JSON.parse(notifRaw) : [];
      const newNotif = {
        id: `notif-msg-${Date.now()}`,
        type: "system",
        title: `Tin nhắn liên hệ mới từ ${newMsg.name}`,
        desc: newMsg.message.slice(0, 100) + (newMsg.message.length > 100 ? "..." : ""),
        created_at: new Date().toISOString(),
        read: false,
        starred: false,
        link: "/admin/messages",
        meta: {
          sender: newMsg.name,
          email: newMsg.email,
          phone: newMsg.phone,
        },
      };
      localStorage.setItem("gieomo_admin_notifications", JSON.stringify([newNotif, ...notifs]));
      window.dispatchEvent(new Event("gieomo_messages_updated"));
    } catch (e) {
      console.error("Error saving contact message", e);
    }
  }

  return newMsg;
}

export function updateContactMessageStatus(id: string, status: "unread" | "read" | "replied"): void {
  if (typeof window === "undefined") return;
  try {
    const list = getStoredContactMessages();
    const updated = list.map((m) => (m.id === id ? { ...m, status } : m));
    localStorage.setItem("gieomo_contact_messages", JSON.stringify(updated));
    window.dispatchEvent(new Event("gieomo_messages_updated"));
  } catch (e) {
    console.error("Error updating contact message status", e);
  }
}

// === SEPAY WEBHOOK PAYMENT CONFIRMATION HELPER ===

export function confirmOrderPaymentFromWebhook(orderCode: string, amount: number, transactionId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const orders = getStoredOrders();
    const normalizedCode = orderCode.trim().toUpperCase();
    const target = orders.find((o) => o.order_code.toUpperCase() === normalizedCode);

    if (!target) return false;

    // Update order
    updateStoredPaymentStatus(target.order_code, "paid");
    if (target.order_status === "pending") {
      updateStoredOrderStatus(target.order_code, "confirmed");
    }

    // Update payment record
    const payments = getStoredPayments();
    const newPay: PaymentRecord = {
      paymentId: `pay-sepay-${transactionId}`,
      orderCode: target.order_code,
      amount: amount,
      paymentMethod: "banking",
      transactionCode: `SEPAY-${transactionId}`,
      status: "paid",
      createdAt: new Date().toLocaleString("vi-VN"),
    };
    localStorage.setItem("gieomo_payments", JSON.stringify([newPay, ...payments.filter((p) => p.orderCode !== target.order_code)]));

    // Create notification
    const notifRaw = localStorage.getItem("gieomo_admin_notifications");
    const notifs = notifRaw ? JSON.parse(notifRaw) : [];
    const newNotif = {
      id: `notif-sepay-${Date.now()}`,
      type: "payment",
      title: `⚡ SePay đã tự động duyệt đơn #${target.order_code}`,
      desc: `Nhận ${amount.toLocaleString("vi-VN")}đ qua chuyển khoản ngân hàng (Mã GD: ${transactionId}).`,
      created_at: new Date().toISOString(),
      read: false,
      starred: true,
      link: `/admin/orders/${target.order_id}`,
    };
    localStorage.setItem("gieomo_admin_notifications", JSON.stringify([newNotif, ...notifs]));
    window.dispatchEvent(new Event("gieomo_orders_updated"));
    return true;
  } catch (e) {
    console.error("Error confirming payment via webhook helper", e);
    return false;
  }
}

// === MEMBER & SHIPPER ASSIGNMENT HELPERS ===

export interface StoredMember {
  memberId: string;
  fullName: string;
  email: string;
  role: "admin" | "btc_sale";
  referralCode: string;
  phone: string;
  totalOrders: number;
  totalRevenue: number;
  status: "active" | "inactive";
  joinedDate: string;
  password?: string;
}

const SEED_MEMBERS: StoredMember[] = [
  {
    memberId: "mem-0",
    fullName: "BTC Mầm Mơ (Trưởng ban)",
    email: "admin@mammo.vn",
    role: "admin",
    referralCode: "MAM-ADMIN",
    phone: "0123456789",
    totalOrders: 28,
    totalRevenue: 4850000,
    status: "active",
    joinedDate: "15/08/2026",
    password: "••••••••",
  },
  {
    memberId: "mem-1",
    fullName: "Nguyễn Thị Mai Lan",
    email: "mailan@mammo.vn",
    role: "btc_sale",
    referralCode: "MAM-LAN",
    phone: "0901112233",
    totalOrders: 15,
    totalRevenue: 2450000,
    status: "active",
    joinedDate: "20/08/2026",
    password: "••••••••",
  },
  {
    memberId: "mem-2",
    fullName: "Trần Minh Quang",
    email: "minhquang@mammo.vn",
    role: "btc_sale",
    referralCode: "MAM-QUANG",
    phone: "0904445566",
    totalOrders: 8,
    totalRevenue: 1120000,
    status: "active",
    joinedDate: "01/09/2026",
    password: "••••••••",
  },
];

export function getStoredMembers(): StoredMember[] {
  if (typeof window === "undefined") return SEED_MEMBERS;
  try {
    const raw = localStorage.getItem("gieomo_members");
    if (!raw) {
      localStorage.setItem("gieomo_members", JSON.stringify(SEED_MEMBERS));
      return SEED_MEMBERS;
    }
    return JSON.parse(raw);
  } catch {
    return SEED_MEMBERS;
  }
}

export function saveStoredMembers(members: StoredMember[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("gieomo_members", JSON.stringify(members));
    window.dispatchEvent(new Event("gieomo_members_updated"));
  } catch (e) {
    console.error("Error saving members to storage", e);
  }
}

export function updateOrderShipper(
  orderCode: string,
  shipperId: string | null,
  shipperName: string | null
): void {
  if (typeof window === "undefined") return;
  try {
    const orders = getStoredOrders();
    const updated = orders.map((o) => {
      if (o.order_code === orderCode) {
        return {
          ...o,
          assigned_shipper_id: shipperId,
          assigned_shipper_name: shipperName,
          delivery_status: (shipperId ? "out_for_delivery" : o.delivery_status) as DeliveryStatus,
        };
      }
      return o;
    });
    localStorage.setItem("gieomo_orders", JSON.stringify(updated));
    cachedOrders = updated;
    window.dispatchEvent(new Event("gieomo_orders_updated"));
  } catch (e) {
    console.error("Error updating shipper", e);
  }
}

// ==========================================
// VOUCHERS STORE (BÁN HÀNG & QUẢN TRỊ ƯU ĐÃI)
// ==========================================

export function getStoredVouchers(): Voucher[] {
  if (typeof window === "undefined") {
    return MOCK_VOUCHERS.map((v) => ({ ...v, visibility: v.visibility || "public" }));
  }
  if (cachedVouchers !== null) return cachedVouchers;
  try {
    const raw = localStorage.getItem("gieomo_vouchers");
    let vouchers: Voucher[] = raw ? JSON.parse(raw) : [...MOCK_VOUCHERS];

    let hasAdded = false;
    for (const mockV of MOCK_VOUCHERS) {
      if (!vouchers.some((v) => v.code === mockV.code)) {
        vouchers.push({ ...mockV, visibility: mockV.visibility || "public" });
        hasAdded = true;
      }
    }
    vouchers = vouchers.map((v) => ({ ...v, visibility: v.visibility || "public" }));

    if (hasAdded || !raw) {
      localStorage.setItem("gieomo_vouchers", JSON.stringify(vouchers));
    }
    cachedVouchers = vouchers;
    return vouchers;
  } catch (e) {
    console.error("Error reading gieomo_vouchers from localStorage", e);
    return MOCK_VOUCHERS.map((v) => ({ ...v, visibility: v.visibility || "public" }));
  }
}

export function saveNewVoucher(voucher: Voucher): void {
  if (typeof window === "undefined") return;
  try {
    const list = getStoredVouchers();
    const updated = [
      { ...voucher, visibility: voucher.visibility || "public" },
      ...list.filter((v) => v.voucher_id !== voucher.voucher_id && v.code !== voucher.code),
    ];
    cachedVouchers = updated;
    localStorage.setItem("gieomo_vouchers", JSON.stringify(updated));
    window.dispatchEvent(new Event("gieomo_vouchers_updated"));
  } catch (e) {
    console.error("Error saving new voucher", e);
  }
}

export function updateStoredVoucher(voucher: Voucher): void {
  if (typeof window === "undefined") return;
  try {
    const list = getStoredVouchers();
    const updated = list.map((v) =>
      v.voucher_id === voucher.voucher_id ? { ...voucher, visibility: voucher.visibility || "public" } : v
    );
    cachedVouchers = updated;
    localStorage.setItem("gieomo_vouchers", JSON.stringify(updated));
    window.dispatchEvent(new Event("gieomo_vouchers_updated"));
  } catch (e) {
    console.error("Error updating voucher", e);
  }
}

export function deleteStoredVoucher(voucherId: string): void {
  if (typeof window === "undefined") return;
  try {
    const list = getStoredVouchers();
    const updated = list.filter((v) => v.voucher_id !== voucherId);
    cachedVouchers = updated;
    localStorage.setItem("gieomo_vouchers", JSON.stringify(updated));
    window.dispatchEvent(new Event("gieomo_vouchers_updated"));
  } catch (e) {
    console.error("Error deleting voucher", e);
  }
}

// ==========================================
// PRODUCTS STORE (TOÀN BỘ SẢN PHẨM & CỬA HÀNG)
// ==========================================

export function getStoredProducts(): ExtendedProduct[] {
  if (typeof window === "undefined") return MOCK_PRODUCTS;
  if (cachedProducts !== null) return cachedProducts;
  try {
    const raw = localStorage.getItem("gieomo_products");
    let products: ExtendedProduct[] = raw ? JSON.parse(raw) : [...MOCK_PRODUCTS];

    let hasAdded = false;
    for (const mockP of MOCK_PRODUCTS) {
      if (!products.some((p) => p.product_id === mockP.product_id || p.slug === mockP.slug)) {
        products.push(mockP);
        hasAdded = true;
      }
    }

    if (hasAdded || !raw) {
      localStorage.setItem("gieomo_products", JSON.stringify(products));
    }
    cachedProducts = products;
    return products;
  } catch (e) {
    console.error("Error reading gieomo_products from localStorage", e);
    return MOCK_PRODUCTS;
  }
}

export function getStoredProductBySlug(slug: string): ExtendedProduct | undefined {
  const products = getStoredProducts();
  return products.find((p) => p.slug === slug);
}

export function saveNewProduct(product: ExtendedProduct): void {
  // Ensure variants have warehouse stock values
  const normalizedVariants = product.variants?.map((v) => ({
    ...v,
    stock_warehouse_1: v.stock_warehouse_1 ?? Math.ceil((v.stock || 0) * 0.7),
    stock_warehouse_2: v.stock_warehouse_2 ?? (v.stock - (v.stock_warehouse_1 ?? Math.ceil((v.stock || 0) * 0.7))),
  }));

  const productToSave: ExtendedProduct = {
    ...product,
    variants: normalizedVariants,
  };

  // Sync with mock data array in memory
  if (!MOCK_PRODUCTS.some((p) => p.product_id === productToSave.product_id || p.slug === productToSave.slug)) {
    MOCK_PRODUCTS.unshift(productToSave);
  }

  if (typeof window === "undefined") return;
  try {
    const list = getStoredProducts();
    const updated = [
      productToSave,
      ...list.filter((p) => p.product_id !== productToSave.product_id && p.slug !== productToSave.slug),
    ];
    cachedProducts = updated;
    localStorage.setItem("gieomo_products", JSON.stringify(updated));
    window.dispatchEvent(new Event("gieomo_products_updated"));
  } catch (e) {
    console.error("Error saving new product", e);
  }
}

export function updateStoredProduct(product: ExtendedProduct): void {
  if (!MOCK_PRODUCTS.some((p) => p.product_id === product.product_id)) {
    MOCK_PRODUCTS.unshift(product);
  } else {
    const idx = MOCK_PRODUCTS.findIndex((p) => p.product_id === product.product_id);
    if (idx !== -1) MOCK_PRODUCTS[idx] = product;
  }

  if (typeof window === "undefined") return;
  try {
    const list = getStoredProducts();
    const updated = list.map((p) => (p.product_id === product.product_id ? product : p));
    cachedProducts = updated;
    localStorage.setItem("gieomo_products", JSON.stringify(updated));
    window.dispatchEvent(new Event("gieomo_products_updated"));
  } catch (e) {
    console.error("Error updating product", e);
  }
}

export function deleteStoredProduct(productId: string): void {
  const mIdx = MOCK_PRODUCTS.findIndex((p) => p.product_id === productId);
  if (mIdx !== -1) MOCK_PRODUCTS.splice(mIdx, 1);

  if (typeof window === "undefined") return;
  try {
    const list = getStoredProducts();
    const updated = list.filter((p) => p.product_id !== productId);
    cachedProducts = updated;
    localStorage.setItem("gieomo_products", JSON.stringify(updated));
    window.dispatchEvent(new Event("gieomo_products_updated"));
  } catch (e) {
    console.error("Error deleting product", e);
  }
}

// ==========================================
// WAREHOUSES STORE (QUẢN LÝ KHO HÀNG)
// ==========================================

export function getStoredWarehouses(): Warehouse[] {
  if (typeof window === "undefined") return MOCK_WAREHOUSES;
  if (cachedWarehouses !== null) return cachedWarehouses;
  try {
    const raw = localStorage.getItem("gieomo_warehouses");
    let warehouses: Warehouse[] = raw ? JSON.parse(raw) : [...MOCK_WAREHOUSES];

    let hasAdded = false;
    for (const mockWh of MOCK_WAREHOUSES) {
      if (!warehouses.some((w) => w.warehouse_id === mockWh.warehouse_id || w.code === mockWh.code)) {
        warehouses.push(mockWh);
        hasAdded = true;
      }
    }

    if (hasAdded || !raw) {
      localStorage.setItem("gieomo_warehouses", JSON.stringify(warehouses));
    }
    cachedWarehouses = warehouses;
    return warehouses;
  } catch (e) {
    console.error("Error reading gieomo_warehouses from localStorage", e);
    return MOCK_WAREHOUSES;
  }
}

export function saveNewWarehouse(warehouse: Warehouse): void {
  if (typeof window === "undefined") return;
  try {
    let list = getStoredWarehouses();
    if (warehouse.is_default) {
      list = list.map((w) => ({ ...w, is_default: false }));
    }
    const updated = [
      warehouse,
      ...list.filter((w) => w.warehouse_id !== warehouse.warehouse_id && w.code !== warehouse.code),
    ];
    cachedWarehouses = updated;
    localStorage.setItem("gieomo_warehouses", JSON.stringify(updated));

    // Initialize stock = 0 for this new warehouse across all products
    try {
      const prods = getStoredProducts();
      const updatedProds = prods.map((p) => ({
        ...p,
        variants: p.variants?.map((v) => {
          const stocks = { ...(v.warehouse_stocks || {}) };
          if (stocks[warehouse.warehouse_id] === undefined) {
            stocks[warehouse.warehouse_id] = 0;
          }
          return {
            ...v,
            warehouse_stocks: stocks,
          };
        }),
      }));
      cachedProducts = updatedProds;
      localStorage.setItem("gieomo_products", JSON.stringify(updatedProds));
      window.dispatchEvent(new Event("gieomo_products_updated"));
    } catch {
      // ignore
    }

    window.dispatchEvent(new Event("gieomo_warehouses_updated"));
  } catch (e) {
    console.error("Error saving new warehouse", e);
  }
}

export function updateStoredWarehouse(warehouse: Warehouse): void {
  if (typeof window === "undefined") return;
  try {
    let list = getStoredWarehouses();
    if (warehouse.is_default) {
      list = list.map((w) => ({ ...w, is_default: false }));
    }
    const updated = list.map((w) => (w.warehouse_id === warehouse.warehouse_id ? warehouse : w));
    cachedWarehouses = updated;
    localStorage.setItem("gieomo_warehouses", JSON.stringify(updated));
    window.dispatchEvent(new Event("gieomo_warehouses_updated"));
  } catch (e) {
    console.error("Error updating warehouse", e);
  }
}

export function deleteStoredWarehouse(warehouseId: string): void {
  if (typeof window === "undefined") return;
  try {
    const list = getStoredWarehouses();
    const updated = list.filter((w) => w.warehouse_id !== warehouseId);
    if (updated.length > 0 && !updated.some((w) => w.is_default)) {
      updated[0].is_default = true;
    }
    cachedWarehouses = updated;
    localStorage.setItem("gieomo_warehouses", JSON.stringify(updated));
    window.dispatchEvent(new Event("gieomo_warehouses_updated"));
  } catch (e) {
    console.error("Error deleting warehouse", e);
  }
}

/**
 * Update stock for a specific warehouse, variant and product
 */
export function updateProductWarehouseStock(
  productId: string,
  variantId: string,
  warehouseId: string,
  newStock: number
): void {
  if (typeof window === "undefined") return;
  try {
    const products = getStoredProducts();
    const safeStock = Math.max(0, Math.floor(newStock));

    const updated = products.map((p) => {
      if (p.product_id !== productId) return p;

      const updatedVariants = p.variants?.map((v) => {
        if (v.variant_id !== variantId) return v;

        const stocks = { ...(v.warehouse_stocks || {}) };
        stocks[warehouseId] = safeStock;

        // Legacy compatibility
        let wh1 = v.stock_warehouse_1 ?? Math.ceil((v.stock || 0) * 0.7);
        let wh2 = v.stock_warehouse_2 ?? ((v.stock || 0) - wh1);
        if (warehouseId === "wh-1") wh1 = safeStock;
        if (warehouseId === "wh-2") wh2 = safeStock;

        // Calculate total stock as sum of all known warehouse stocks
        const allWhs = getStoredWarehouses();
        let total = 0;
        for (const wh of allWhs) {
          if (stocks[wh.warehouse_id] !== undefined) {
            total += stocks[wh.warehouse_id];
          } else if (wh.warehouse_id === "wh-1") {
            total += wh1;
          } else if (wh.warehouse_id === "wh-2") {
            total += wh2;
          }
        }

        return {
          ...v,
          stock: total,
          stock_warehouse_1: wh1,
          stock_warehouse_2: wh2,
          warehouse_stocks: stocks,
        };
      });

      const totalProdStock = (updatedVariants || []).reduce((sum, v) => sum + (v.stock || 0), 0);

      return {
        ...p,
        stock: totalProdStock,
        variants: updatedVariants,
      };
    });

    cachedProducts = updated;
    localStorage.setItem("gieomo_products", JSON.stringify(updated));
    window.dispatchEvent(new Event("gieomo_products_updated"));
  } catch (e) {
    console.error("Error updating product warehouse stock", e);
  }
}

// === SITE SETTINGS STORE ===

export interface SiteSettings {
  siteName: string;
  contactPhone: string;
  contactEmail: string;
  officeAddress?: string;
  flatShippingFee: number;
  freeShippingThreshold: number;
  bankName: string;
  bankNumber: string;
  bankHolder: string;
  qrMode: "auto" | "upload";
  qrImageUrl: string;
  activePalette: string;
  coverTheme: string;
  faviconPreview: string;
  avatarPreview: string;
}

export const DEFAULT_SETTINGS: SiteSettings = {
  siteName: "Gieo Mơ",
  contactPhone: "0123456789",
  contactEmail: "gieomo@mammo.vn",
  officeAddress: "TP. Hồ Chí Minh, Việt Nam",
  flatShippingFee: 25000,
  freeShippingThreshold: 200000,
  bankNumber: "03456789999",
  bankHolder: "CLB MAM MO GIEO MO",
  bankName: "MB Bank (Quân Đội)",
  qrMode: "auto",
  qrImageUrl: "/images/logo_gieo mơ.jpg",
  activePalette: "soft-green",
  coverTheme: "emerald",
  faviconPreview: "/images/logo_gieo mơ.jpg",
  avatarPreview: "/images/logo_gieo mơ.jpg",
};

let cachedSettings: SiteSettings | null = null;
let hasSyncedSettingsWithServer = false;

export function syncSettingsFromServer(): void {
  if (typeof window === "undefined" || hasSyncedSettingsWithServer) return;
  hasSyncedSettingsWithServer = true;
  fetch("/api/settings")
    .then((res) => res.json())
    .then((data) => {
      if (data?.success && data?.settings) {
        cachedSettings = { ...DEFAULT_SETTINGS, ...data.settings };
        localStorage.setItem("gieomo_site_settings", JSON.stringify(cachedSettings));
        window.dispatchEvent(new Event("gieomo_settings_updated"));
      }
    })
    .catch((err) => {
      console.warn("Could not sync settings from server:", err);
    });
}

export function getStoredSettings(): SiteSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  if (!hasSyncedSettingsWithServer) {
    syncSettingsFromServer();
  }
  if (cachedSettings !== null) return cachedSettings;
  try {
    const raw = localStorage.getItem("gieomo_site_settings");
    if (!raw) {
      localStorage.setItem("gieomo_site_settings", JSON.stringify(DEFAULT_SETTINGS));
      cachedSettings = DEFAULT_SETTINGS;
      return DEFAULT_SETTINGS;
    }
    const parsed = JSON.parse(raw);
    const merged = { ...DEFAULT_SETTINGS, ...parsed };
    cachedSettings = merged;
    return merged;
  } catch (e) {
    console.error("Error reading gieomo_site_settings", e);
    return DEFAULT_SETTINGS;
  }
}

export function saveStoredSettings(settings: Partial<SiteSettings>): void {
  if (typeof window === "undefined") return;
  try {
    const current = getStoredSettings();
    const updated: SiteSettings = { ...current, ...settings };
    cachedSettings = updated;
    localStorage.setItem("gieomo_site_settings", JSON.stringify(updated));
    window.dispatchEvent(new Event("gieomo_settings_updated"));

    // Sync to Supabase DB in background
    fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    }).catch((err) => {
      console.error("Failed to sync settings to Supabase DB:", err);
    });
  } catch (e) {
    console.error("Error saving gieomo_site_settings", e);
  }
}

// === CATEGORIES STORE ===

let cachedCategories: ProductCategory[] | null = null;

export function getStoredCategories(): ProductCategory[] {
  if (typeof window === "undefined") return MOCK_CATEGORIES;
  if (cachedCategories !== null) return cachedCategories;
  try {
    const raw = localStorage.getItem("gieomo_categories");
    let categories: ProductCategory[] = raw ? JSON.parse(raw) : [...MOCK_CATEGORIES];

    let hasAdded = false;
    for (const mockCat of MOCK_CATEGORIES) {
      if (!categories.some((c) => c.category_id === mockCat.category_id)) {
        categories.push(mockCat);
        hasAdded = true;
      }
    }

    if (hasAdded || !raw) {
      localStorage.setItem("gieomo_categories", JSON.stringify(categories));
    }
    cachedCategories = categories;
    return categories;
  } catch (e) {
    console.error("Error reading gieomo_categories", e);
    return MOCK_CATEGORIES;
  }
}

export function saveNewCategory(cat: ProductCategory): void {
  if (typeof window === "undefined") return;
  try {
    const categories = getStoredCategories();
    const updated = [cat, ...categories.filter((c) => c.category_id !== cat.category_id && c.slug !== cat.slug)];
    cachedCategories = updated;
    localStorage.setItem("gieomo_categories", JSON.stringify(updated));
    window.dispatchEvent(new Event("gieomo_categories_updated"));
  } catch (e) {
    console.error("Error saving new category", e);
  }
}

export function updateStoredCategory(cat: ProductCategory): void {
  if (typeof window === "undefined") return;
  try {
    const categories = getStoredCategories();
    const updated = categories.map((c) => (c.category_id === cat.category_id ? cat : c));
    cachedCategories = updated;
    localStorage.setItem("gieomo_categories", JSON.stringify(updated));
    window.dispatchEvent(new Event("gieomo_categories_updated"));
  } catch (e) {
    console.error("Error updating category", e);
  }
}

export function deleteStoredCategory(categoryId: string): void {
  if (typeof window === "undefined") return;
  try {
    const categories = getStoredCategories();
    const updated = categories.filter((c) => c.category_id !== categoryId);
    cachedCategories = updated;
    localStorage.setItem("gieomo_categories", JSON.stringify(updated));
    window.dispatchEvent(new Event("gieomo_categories_updated"));
  } catch (e) {
    console.error("Error deleting category", e);
  }
}

// === COMBOS STORE ===

let cachedCombos: ExtendedCombo[] | null = null;

export function getStoredCombos(): ExtendedCombo[] {
  if (typeof window === "undefined") return MOCK_COMBOS;
  if (cachedCombos !== null) return cachedCombos;
  try {
    const raw = localStorage.getItem("gieomo_combos");
    let combos: ExtendedCombo[] = raw ? JSON.parse(raw) : [...MOCK_COMBOS];

    let hasAdded = false;
    for (const mockCb of MOCK_COMBOS) {
      if (!combos.some((c) => c.combo_id === mockCb.combo_id)) {
        combos.push(mockCb);
        hasAdded = true;
      }
    }

    if (hasAdded || !raw) {
      localStorage.setItem("gieomo_combos", JSON.stringify(combos));
    }
    cachedCombos = combos;
    return combos;
  } catch (e) {
    console.error("Error reading gieomo_combos", e);
    return MOCK_COMBOS;
  }
}

export function saveNewCombo(combo: ExtendedCombo): void {
  if (typeof window === "undefined") return;
  try {
    const combos = getStoredCombos();
    const updated = [combo, ...combos.filter((c) => c.combo_id !== combo.combo_id && c.slug !== combo.slug)];
    cachedCombos = updated;
    localStorage.setItem("gieomo_combos", JSON.stringify(updated));
    window.dispatchEvent(new Event("gieomo_combos_updated"));
  } catch (e) {
    console.error("Error saving new combo", e);
  }
}

export function updateStoredCombo(combo: ExtendedCombo): void {
  if (typeof window === "undefined") return;
  try {
    const combos = getStoredCombos();
    const updated = combos.map((c) => (c.combo_id === combo.combo_id ? combo : c));
    cachedCombos = updated;
    localStorage.setItem("gieomo_combos", JSON.stringify(updated));
    window.dispatchEvent(new Event("gieomo_combos_updated"));
  } catch (e) {
    console.error("Error updating combo", e);
  }
}

export function deleteStoredCombo(comboId: string): void {
  if (typeof window === "undefined") return;
  try {
    const combos = getStoredCombos();
    const updated = combos.filter((c) => c.combo_id !== comboId);
    cachedCombos = updated;
    localStorage.setItem("gieomo_combos", JSON.stringify(updated));
    window.dispatchEvent(new Event("gieomo_combos_updated"));
  } catch (e) {
    console.error("Error deleting combo", e);
  }
}



