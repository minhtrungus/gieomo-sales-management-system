"use client";

import type { Order, OrderStatus, PaymentStatus, DeliveryStatus, PickupPoint, ContactMessage, Voucher, Warehouse, ProductCategory, Combo, ProductReview } from "@/types/database";
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

const SEED_PAYMENTS: PaymentRecord[] = [];

let cachedOrders: Order[] | null = null;
let cachedPayments: PaymentRecord[] | null = null;
let cachedVouchers: Voucher[] | null = null;
let cachedProducts: ExtendedProduct[] | null = null;
let cachedWarehouses: Warehouse[] | null = null;
let hasSyncedProductsWithServer = false;
let hasSyncedCategoriesWithServer = false;
let hasSyncedVouchersWithServer = false;
let hasSyncedPickupPointsWithServer = false;
let hasSyncedContactMessagesWithServer = false;

export function getStoredOrders(): Order[] {
  if (typeof window === "undefined") return [];
  if (cachedOrders !== null) return cachedOrders;
  try {
    const raw = localStorage.getItem("gieomo_orders");
    const orders: Order[] = raw ? JSON.parse(raw) : [];
    cachedOrders = orders;
    return orders;
  } catch (e) {
    console.error("Error reading gieomo_orders from localStorage", e);
    return [];
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

    // Automatic push notifications are disabled


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

    // Automatic push notifications are disabled


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
  if (typeof window === "undefined") return [];
  if (cachedPayments !== null) return cachedPayments;
  try {
    const raw = localStorage.getItem("gieomo_payments");
    const payments: PaymentRecord[] = raw ? JSON.parse(raw) : [];
    cachedPayments = payments;
    return payments;
  } catch (e) {
    console.error("Error reading gieomo_payments", e);
    return [];
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

/**
 * Safely fetches and parses JSON without throwing SyntaxError on empty, aborted, or non-JSON responses.
 * Especially crucial when search engine crawlers (like Googlebot) abort background fetches or block /api routes.
 */
async function safeFetchJson<T = any>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) return null;
    const text = await res.text();
    if (!text || !text.trim()) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function syncPickupPointsFromServer(): void {
  if (typeof window === "undefined" || hasSyncedPickupPointsWithServer) return;
  hasSyncedPickupPointsWithServer = true;
  safeFetchJson<{ success: boolean; pickup_points: PickupPoint[] }>("/api/pickup-points")
    .then((data) => {
      if (data?.success && Array.isArray(data.pickup_points) && data.pickup_points.length > 0) {
        const current = getStoredPickupPoints();
        const merged = [...current];
        for (const p of data.pickup_points) {
          const idx = merged.findIndex((m) => m.pickup_point_id === p.pickup_point_id || m.name === p.name);
          if (idx >= 0) {
            merged[idx] = { ...merged[idx], ...p };
          } else {
            merged.push(p);
          }
        }
        localStorage.setItem("gieomo_pickup_points", JSON.stringify(merged));
        window.dispatchEvent(new Event("gieomo_pickup_points_updated"));
      }
    })
    .catch(() => {
      // Graceful fallback to cached/seed data
    });
}

export function getStoredPickupPoints(): PickupPoint[] {
  if (typeof window === "undefined") return SEED_PICKUP_POINTS;
  if (!hasSyncedPickupPointsWithServer) {
    syncPickupPointsFromServer();
  }
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

    // Sync to Supabase DB in background
    fetch("/api/pickup-points", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(point),
    }).catch((err) => console.warn("Could not persist pickup point to server:", err));
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

const SEED_CONTACT_MESSAGES: ContactMessage[] = [];

export function syncContactMessagesFromServer(): void {
  if (typeof window === "undefined" || hasSyncedContactMessagesWithServer) return;
  hasSyncedContactMessagesWithServer = true;
  safeFetchJson<{ success: boolean; messages: ContactMessage[] }>("/api/contact/messages")
    .then((data) => {
      if (data?.success && Array.isArray(data.messages) && data.messages.length > 0) {
        const current = getStoredContactMessages();
        const merged = [...current];
        for (const m of data.messages) {
          const idx = merged.findIndex((c) => c.id === m.id);
          if (idx >= 0) {
            merged[idx] = { ...merged[idx], ...m };
          } else {
            merged.unshift(m);
          }
        }
        localStorage.setItem("gieomo_contact_messages", JSON.stringify(merged));
        window.dispatchEvent(new Event("gieomo_messages_updated"));
      }
    })
    .catch(() => {
      // Graceful fallback
    });
}

export function getStoredContactMessages(): ContactMessage[] {
  if (typeof window === "undefined") return [];
  if (!hasSyncedContactMessagesWithServer) {
    syncContactMessagesFromServer();
  }
  try {
    const raw = localStorage.getItem("gieomo_contact_messages");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
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

      // Automatic push notifications are disabled
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

    // Sync to Supabase in background
    fetch("/api/contact/messages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    }).catch((err) => console.warn("Could not update contact message status on server:", err));
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

    // Automatic push notifications are disabled
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
  lastLoginAt?: string;
  password?: string;
  isSystemProtected?: boolean;
}

export const SYSTEM_MAINTENANCE_ACCOUNT: StoredMember = {
  memberId: "baotri-system",
  fullName: "Bảo trì Hệ thống",
  email: "baotri@gieomo.store",
  role: "admin",
  referralCode: "BAOTRI",
  phone: "0900000000",
  totalOrders: 0,
  totalRevenue: 0,
  status: "active",
  joinedDate: "29/09/2026",
  password: "••••••••",
  isSystemProtected: true,
};

const SEED_MEMBERS: StoredMember[] = [
  SYSTEM_MAINTENANCE_ACCOUNT,
  {
    memberId: "mem-1",
    fullName: "Nguyễn Thị Mai Lan",
    email: "mailan@mammo.vn",
    role: "btc_sale",
    referralCode: "MAM-LAN",
    phone: "0901112233",
    totalOrders: 0,
    totalRevenue: 0,
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
    totalOrders: 0,
    totalRevenue: 0,
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
    const parsed: StoredMember[] = JSON.parse(raw);

    // Filter out revoked old btc leader account (admin@mammo.vn / mem-0)
    let needsUpdate = false;
    let sanitized = parsed.filter((m) => {
      const isRevoked =
        m.email.toLowerCase() === "admin@mammo.vn" ||
        m.memberId === "mem-0" ||
        m.fullName.includes("BTC Mầm Mơ (Trưởng ban)");
      if (isRevoked) needsUpdate = true;
      return !isRevoked;
    });

    // Ensure maintenance account exists initially
    const baotriExists = sanitized.some(
      (m) => m.email.toLowerCase() === "baotri@gieomo.store" || m.memberId === "baotri-system"
    );

    if (!baotriExists && sanitized.length === 0) {
      sanitized = [SYSTEM_MAINTENANCE_ACCOUNT, ...sanitized];
      needsUpdate = true;
    }

    if (needsUpdate) {
      localStorage.setItem("gieomo_members", JSON.stringify(sanitized));
    }

    return sanitized;
  } catch {
    return SEED_MEMBERS;
  }
}

export function saveStoredMembers(members: StoredMember[]): void {
  if (typeof window === "undefined") return;
  try {
    // 1. Filter out revoked account admin@mammo.vn
    let sanitized = members.filter(
      (m) =>
        m.email.toLowerCase() !== "admin@mammo.vn" &&
        m.memberId !== "mem-0" &&
        !m.fullName.includes("BTC Mầm Mơ (Trưởng ban)")
    );

    // 2. Ensure at least one admin account is kept
    const hasAdmin = sanitized.some((m) => m.role === "admin");
    if (!hasAdmin && sanitized.length === 0) {
      sanitized = [SYSTEM_MAINTENANCE_ACCOUNT, ...sanitized];
    }

    localStorage.setItem("gieomo_members", JSON.stringify(sanitized));
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

export function syncVouchersFromServer(): void {
  if (typeof window === "undefined" || hasSyncedVouchersWithServer) return;
  hasSyncedVouchersWithServer = true;
  safeFetchJson<{ success: boolean; vouchers: Voucher[] }>("/api/vouchers")
    .then((data) => {
      if (data?.success && Array.isArray(data.vouchers) && data.vouchers.length > 0) {
        const current = getStoredVouchers();
        const merged = [...current];
        for (const v of data.vouchers) {
          const idx = merged.findIndex((m) => m.voucher_id === v.voucher_id || m.code === v.code);
          if (idx >= 0) {
            merged[idx] = { ...merged[idx], ...v };
          } else {
            merged.push({ ...v, visibility: v.visibility || "public" });
          }
        }
        cachedVouchers = merged;
        localStorage.setItem("gieomo_vouchers", JSON.stringify(merged));
        window.dispatchEvent(new Event("gieomo_vouchers_updated"));
      }
    })
    .catch(() => {
      // Graceful fallback
    });
}

export function getStoredVouchers(): Voucher[] {
  if (typeof window === "undefined") {
    return [];
  }
  if (!hasSyncedVouchersWithServer) {
    syncVouchersFromServer();
  }
  if (cachedVouchers !== null) return cachedVouchers;
  try {
    const raw = localStorage.getItem("gieomo_vouchers");
    const vouchers: Voucher[] = raw ? JSON.parse(raw) : [];
    cachedVouchers = vouchers;
    return vouchers;
  } catch (e) {
    console.error("Error reading gieomo_vouchers from localStorage", e);
    return [];
  }
}

export function saveNewVoucher(voucher: Voucher): void {
  const voucherToSave = { ...voucher, visibility: voucher.visibility || "public" };
  if (typeof window === "undefined") return;
  try {
    const list = getStoredVouchers();
    const updated = [
      voucherToSave,
      ...list.filter((v) => v.voucher_id !== voucher.voucher_id && v.code !== voucher.code),
    ];
    cachedVouchers = updated;
    localStorage.setItem("gieomo_vouchers", JSON.stringify(updated));
    window.dispatchEvent(new Event("gieomo_vouchers_updated"));

    // Sync to Supabase in background
    fetch("/api/vouchers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(voucherToSave),
    }).catch((err) => console.warn("Could not persist voucher to server:", err));
  } catch (e) {
    console.error("Error saving new voucher", e);
  }
}

export function updateStoredVoucher(voucher: Voucher): void {
  const voucherToSave = { ...voucher, visibility: voucher.visibility || "public" };
  if (typeof window === "undefined") return;
  try {
    const list = getStoredVouchers();
    const updated = list.map((v) =>
      v.voucher_id === voucher.voucher_id ? voucherToSave : v
    );
    cachedVouchers = updated;
    localStorage.setItem("gieomo_vouchers", JSON.stringify(updated));
    window.dispatchEvent(new Event("gieomo_vouchers_updated"));

    // Sync to Supabase in background
    fetch("/api/vouchers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(voucherToSave),
    }).catch((err) => console.warn("Could not update voucher on server:", err));
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

export function syncProductsFromServer(): void {
  if (typeof window === "undefined" || hasSyncedProductsWithServer) return;
  hasSyncedProductsWithServer = true;
  safeFetchJson<{ success: boolean; products: ExtendedProduct[] }>("/api/products?admin=true")
    .then((data) => {
      if (data?.success && Array.isArray(data.products) && data.products.length > 0) {
        const current = getStoredProducts();
        const map = new Map<string, ExtendedProduct>();

        for (const p of current) {
          const key = p.slug || p.product_id;
          map.set(key, p);
        }

        for (const sProd of data.products) {
          const key = sProd.slug || sProd.product_id;
          const existing = map.get(key);
          if (existing) {
            const isFallbackOnly = sProd.images?.length === 1 && sProd.images[0] === "/images/products/pounch_1.png" && sProd.slug !== "pouch-mam-mo";
            const existingHasImages = Boolean(existing.images && existing.images.length > 0);
            const serverHasImages = Boolean(sProd.images && sProd.images.length > 0);
            const validImages = isFallbackOnly
              ? (existingHasImages ? existing.images : sProd.images)
              : (serverHasImages ? sProd.images : existing.images);
            const validThumbnail = isFallbackOnly
              ? (existing.thumbnail || sProd.thumbnail)
              : (sProd.thumbnail || existing.thumbnail);

            map.set(key, {
              ...existing,
              ...sProd,
              images: validImages,
              thumbnail: validThumbnail,
              specs: existing.specs || sProd.specs,
              impact_story: sProd.impact_story || existing.impact_story,
              badge: existing.badge || sProd.badge,
              badge_label: existing.badge_label || sProd.badge_label,
            });
          } else {
            map.set(key, sProd);
          }
        }

        const merged = Array.from(map.values()).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        cachedProducts = merged;
        localStorage.setItem("gieomo_products", JSON.stringify(merged));
        window.dispatchEvent(new Event("gieomo_products_updated"));
      }
    })
    .catch(() => {
      // Graceful fallback to cached/mock products
    });
}

export function getStoredProducts(): ExtendedProduct[] {
  if (typeof window === "undefined") return MOCK_PRODUCTS;
  if (!hasSyncedProductsWithServer) {
    syncProductsFromServer();
  }
  if (cachedProducts !== null) return cachedProducts;
  try {
    const raw = localStorage.getItem("gieomo_products");
    const products: ExtendedProduct[] = raw ? JSON.parse(raw) : [];
    cachedProducts = products;
    return products;
  } catch (e) {
    console.error("Error reading gieomo_products from localStorage", e);
    return [];
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

    // Sync to Supabase DB in background
    fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(productToSave),
    }).catch((err) => console.warn("Could not persist new product to server:", err));
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

    // Sync to Supabase DB in background
    fetch("/api/products", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: product.product_id, product }),
    }).catch((err) => console.warn("Could not update product on server:", err));
  } catch (e) {
    console.error("Error updating product", e);
  }
}

export function toggleStoredProductStatus(productId: string, newStatus: "active" | "draft"): void {
  if (typeof window === "undefined") return;
  try {
    const list = getStoredProducts();
    const target = list.find((p) => p.product_id === productId);
    if (!target) return;
    const updated: ExtendedProduct = {
      ...target,
      status: newStatus,
    };
    updateStoredProduct(updated);

    // Call dedicated PATCH endpoint
    fetch("/api/products", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: productId, status: newStatus }),
    }).catch((err) => console.warn("Could not toggle status on server:", err));
  } catch (e) {
    console.error("Error toggling product status", e);
  }
}

export function toggleStoredProductFeatured(productId: string, newFeatured: boolean): void {
  if (typeof window === "undefined") return;
  try {
    const list = getStoredProducts();
    const target = list.find((p) => p.product_id === productId);
    if (!target) return;
    const updated: ExtendedProduct = {
      ...target,
      featured: newFeatured,
    };
    updateStoredProduct(updated);

    // Call dedicated PATCH endpoint
    fetch("/api/products", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: productId, featured: newFeatured }),
    }).catch((err) => console.warn("Could not toggle featured on server:", err));
  } catch (e) {
    console.error("Error toggling product featured", e);
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

    // Sync deletion to Supabase
    fetch(`/api/products?id=${encodeURIComponent(productId)}`, {
      method: "DELETE",
    }).catch((err) => console.warn("Could not delete product on server:", err));
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

    // Clear legacy seed warehouses (wh-1, wh-2) so user starts fresh
    if (raw) {
      const parsed: Warehouse[] = JSON.parse(raw);
      const LEGACY_IDS = ["wh-1", "wh-2"];
      const isLegacyOnly = parsed.every((w) => LEGACY_IDS.includes(w.warehouse_id));
      if (isLegacyOnly) {
        localStorage.removeItem("gieomo_warehouses");
        cachedWarehouses = [];
        return [];
      }
      // Keep user-created warehouses but strip out any legacy seeds
      const cleaned = parsed.filter((w) => !LEGACY_IDS.includes(w.warehouse_id));
      if (cleaned.length !== parsed.length) {
        localStorage.setItem("gieomo_warehouses", JSON.stringify(cleaned));
        cachedWarehouses = cleaned;
        return cleaned;
      }
      cachedWarehouses = parsed;
      return parsed;
    }

    cachedWarehouses = [];
    return [];
  } catch (e) {
    console.error("Error reading gieomo_warehouses from localStorage", e);
    return [];
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
  facebookUrl?: string;
  tiktokUrl?: string;
  instagramUrl?: string;
  zaloUrl?: string;
  youtubeUrl?: string;
}

export const DEFAULT_SETTINGS: SiteSettings = {
  siteName: "Gieo Mơ",
  contactPhone: "0888670637",
  contactEmail: "support@gieomo.store",
  officeAddress: "TP. Hồ Chí Minh, Việt Nam",
  flatShippingFee: 15000,
  freeShippingThreshold: 0,
  bankNumber: "0888670637",
  bankHolder: "NGUYEN THI TRUC HAN",
  bankName: "MB Bank (Quân Đội)",
  qrMode: "auto",
  qrImageUrl: "/images/logo_gieo mơ.jpg",
  activePalette: "soft-green",
  coverTheme: "emerald",
  faviconPreview: "/icon.png",
  avatarPreview: "/images/logo_gieo mơ.jpg",
  facebookUrl: "https://www.facebook.com/BanHangGieoMo",
  tiktokUrl: "https://www.tiktok.com/@vuongquocmam",
  instagramUrl: "https://www.instagram.com/mam.mer.oii",
  zaloUrl: "",
  youtubeUrl: "",
};

let cachedSettings: SiteSettings | null = null;
let hasSyncedSettingsWithServer = false;

export function syncSettingsFromServer(): void {
  if (typeof window === "undefined" || hasSyncedSettingsWithServer) return;
  hasSyncedSettingsWithServer = true;
  safeFetchJson<{ success: boolean; settings: Partial<SiteSettings> }>("/api/settings")
    .then((data) => {
      if (data?.success && data?.settings) {
        cachedSettings = { ...DEFAULT_SETTINGS, ...data.settings };
        localStorage.setItem("gieomo_site_settings", JSON.stringify(cachedSettings));
        window.dispatchEvent(new Event("gieomo_settings_updated"));
      }
    })
    .catch(() => {
      // Graceful fallback to default/cached settings
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

export function syncCategoriesFromServer(): void {
  if (typeof window === "undefined" || hasSyncedCategoriesWithServer) return;
  hasSyncedCategoriesWithServer = true;
  safeFetchJson<{ success: boolean; categories: ProductCategory[] }>("/api/categories")
    .then((data) => {
      if (data?.success && Array.isArray(data.categories) && data.categories.length > 0) {
        const current = getStoredCategories();
        const map = new Map<string, ProductCategory>();

        // Add current categories first keyed by slug
        for (const cat of current) {
          map.set(cat.slug, cat);
        }

        // Merge or insert server categories
        for (const cat of data.categories) {
          const existing = map.get(cat.slug);
          map.set(cat.slug, existing ? { ...existing, ...cat } : cat);
        }

        const merged = Array.from(map.values()).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        cachedCategories = merged;
        localStorage.setItem("gieomo_categories", JSON.stringify(merged));
        window.dispatchEvent(new Event("gieomo_categories_updated"));
      }
    })
    .catch(() => {
      // Graceful fallback to cached/mock categories
    });
}

export function getStoredCategories(): ProductCategory[] {
  if (typeof window === "undefined") return MOCK_CATEGORIES;
  if (!hasSyncedCategoriesWithServer) {
    syncCategoriesFromServer();
  }
  if (cachedCategories !== null) return cachedCategories;
  try {
    const raw = localStorage.getItem("gieomo_categories");

    // If no data in localStorage yet, seed with MOCK_CATEGORIES (first time only)
    if (!raw) {
      const seeded = [...MOCK_CATEGORIES].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      cachedCategories = seeded;
      localStorage.setItem("gieomo_categories", JSON.stringify(seeded));
      return seeded;
    }

    const categories: ProductCategory[] = JSON.parse(raw);

    // Deduplicate corrupted/duplicated entries by slug (keep first occurrence)
    const map = new Map<string, ProductCategory>();
    for (const c of categories) {
      if (!map.has(c.slug)) {
        map.set(c.slug, c);
      }
    }

    // NOTE: Do NOT auto-restore MOCK_CATEGORIES here — that would undo user deletions.
    // MOCK_CATEGORIES are only used as the initial seed (see above).

    const uniqueCategories = Array.from(map.values()).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    if (uniqueCategories.length !== categories.length) {
      localStorage.setItem("gieomo_categories", JSON.stringify(uniqueCategories));
    }
    cachedCategories = uniqueCategories;
    return uniqueCategories;
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

    // Sync to Supabase in background
    fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cat),
    }).catch((err) => console.warn("Could not persist category to server:", err));
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

    // Sync to all products belonging to this category
    const products = getStoredProducts();
    let prodsChanged = false;
    const updatedProds = products.map((p) => {
      if (p.category_id === cat.category_id || p.category?.category_id === cat.category_id) {
        prodsChanged = true;
        return {
          ...p,
          category_id: cat.category_id,
          category: {
            ...p.category,
            ...cat,
          },
        };
      }
      return p;
    });

    if (prodsChanged) {
      cachedProducts = updatedProds;
      localStorage.setItem("gieomo_products", JSON.stringify(updatedProds));
      window.dispatchEvent(new Event("gieomo_products_updated"));
    }

    // Sync to Supabase in background
    fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cat),
    }).catch((err) => console.warn("Could not update category on server:", err));
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

    // Reassign products to fallback category
    const fallbackCat = updated[0] || null;
    const products = getStoredProducts();
    let prodsChanged = false;
    const updatedProds = products.map((p) => {
      if (p.category_id === categoryId || p.category?.category_id === categoryId) {
        prodsChanged = true;
        return {
          ...p,
          category_id: fallbackCat?.category_id || null,
          category: fallbackCat || undefined,
        };
      }
      return p;
    });

    if (prodsChanged) {
      cachedProducts = updatedProds;
      localStorage.setItem("gieomo_products", JSON.stringify(updatedProds));
      window.dispatchEvent(new Event("gieomo_products_updated"));
    }

    // Sync deletion to Supabase in background
    fetch(`/api/categories?id=${encodeURIComponent(categoryId)}`, {
      method: "DELETE",
    }).catch((err) => console.warn("Could not delete category on server:", err));
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
    const combos: ExtendedCombo[] = raw ? JSON.parse(raw) : [];
    cachedCombos = combos;
    return combos;
  } catch (e) {
    console.error("Error reading gieomo_combos", e);
    return [];
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

// ==========================================
// ADMIN AUTHENTICATION STORE
// ==========================================
export const DEFAULT_ADMIN_EMAIL = "baotri@gieomo.store";
export const DEFAULT_ADMIN_PASSWORD = "GieoMo@2026";

export function getStoredAdminPassword(): string {
  if (typeof window === "undefined") return DEFAULT_ADMIN_PASSWORD;
  return localStorage.getItem("gieomo_admin_pwd") || DEFAULT_ADMIN_PASSWORD;
}

export function saveAdminPassword(newPass: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("gieomo_admin_pwd", newPass);
  window.dispatchEvent(new Event("gieomo_admin_pwd_updated"));
}

export interface LoginResult {
  success: boolean;
  error?: string;
}

export function verifyAdminLogin(password: string, email?: string): LoginResult {
  const currentPass = getStoredAdminPassword();
  const members = getStoredMembers();
  const cleanEmail = email?.trim().toLowerCase();

  // Explicitly deny revoked former BTC leader account
  if (cleanEmail === "admin@mammo.vn") {
    return { success: false, error: "Tài khoản này đã bị thu hồi quyền truy cập hệ thống!" };
  }

  const matchedMember = cleanEmail ? members.find((m) => m.email.toLowerCase() === cleanEmail) : null;

  // 1. Kiểm tra trạng thái tài khoản: Nếu Tạm dừng (inactive) thì KHÓA đăng nhập ngay!
  if (matchedMember && matchedMember.status === "inactive") {
    return {
      success: false,
      error: "Tài khoản của bạn đang bị TẠM DỪNG (Khóa truy cập). Vui lòng liên hệ Ban Tổ Chức!",
    };
  }

  // System maintenance account authentication (supports custom updated password & default GieoMo@2026)
  if (cleanEmail === "baotri@gieomo.store" || matchedMember?.memberId === "baotri-system") {
    const isCustomPass = Boolean(matchedMember?.password && matchedMember.password !== "••••••••" && password === matchedMember.password);
    if (password === "GieoMo@2026" || isCustomPass || password === currentPass) {
      if (typeof window !== "undefined") {
        if (matchedMember) {
          matchedMember.lastLoginAt = new Date().toISOString();
          saveStoredMembers(members);
        }
        localStorage.setItem("gieomo_admin_session", JSON.stringify({
          authenticated: true,
          email: matchedMember?.email || cleanEmail || "baotri@gieomo.store",
          name: matchedMember?.fullName || "Bảo trì Hệ thống",
          role: matchedMember?.role || "admin",
          referralCode: matchedMember?.referralCode || "BAOTRI",
          memberId: matchedMember?.memberId || "baotri-system",
          phone: matchedMember?.phone || "0900000000",
          isSystemProtected: true,
          loginAt: new Date().toISOString(),
        }));
        window.dispatchEvent(new Event("gieomo_admin_auth_changed"));
      }
      return { success: true };
    }
    return { success: false, error: "Mật khẩu không chính xác!" };
  }

  const isMasterMatch = password === currentPass;
  const isMemberMatch = matchedMember ? (matchedMember.password === password || password === "MamMo@123") : false;

  // Fallback passwords (MamMo@123, admin123, GieoMo@2026) only work when the email
  // belongs to a known member — prevents unknown actors from using default passwords.
  const isFallbackMatch =
    Boolean(matchedMember) &&
    (password === "MamMo@123" || password === "admin123" || password === "GieoMo@2026");

  // Master password without a matched email: only allow generic (no-email) admin logins.
  // If an unknown email is provided with master password, deny access.
  const masterAllowed = isMasterMatch && (!cleanEmail || Boolean(matchedMember));

  if (masterAllowed || isMemberMatch || isFallbackMatch) {
    if (typeof window !== "undefined") {
      const role: "admin" | "btc_sale" = matchedMember ? matchedMember.role : "admin";
      const name = matchedMember?.fullName || (cleanEmail === DEFAULT_ADMIN_EMAIL ? "Bảo trì Hệ thống" : "Quản trị viên");

      // Cập nhật lần đăng nhập cuối vào thông tin thành viên (ghi đè, không tốn thêm bộ nhớ)
      if (matchedMember) {
        matchedMember.lastLoginAt = new Date().toISOString();
        saveStoredMembers(members);
      }

      // Lưu phiên đăng nhập hiện tại (ghi đè hoàn toàn phiên cũ trong localStorage)
      localStorage.setItem("gieomo_admin_session", JSON.stringify({
        authenticated: true,
        email: cleanEmail || DEFAULT_ADMIN_EMAIL,
        name,
        role,
        referralCode: matchedMember?.referralCode || "",
        memberId: matchedMember?.memberId || "",
        phone: matchedMember?.phone || "",
        isSystemProtected: matchedMember?.isSystemProtected || false,
        loginAt: new Date().toISOString(),
      }));
      window.dispatchEvent(new Event("gieomo_admin_auth_changed"));
    }
    return { success: true };
  }
  return { success: false, error: "Tài khoản hoặc mật khẩu không chính xác!" };
}


export function clearAdminSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("gieomo_admin_session");
  window.dispatchEvent(new Event("gieomo_admin_auth_changed"));
}

export function isAdminAuthenticated(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem("gieomo_admin_session");
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (parsed?.email?.toLowerCase() === "admin@mammo.vn") {
      clearAdminSession();
      return false;
    }
    return Boolean(parsed.authenticated);
  } catch {
    return false;
  }
}

export interface AdminSession {
  authenticated: boolean;
  email: string;
  name: string;
  role?: "admin" | "btc_sale";
  referralCode?: string;
  memberId?: string;
  phone?: string;
  isSystemProtected?: boolean;
  loginAt: string;
}

export function getAdminSession(): AdminSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("gieomo_admin_session");
    if (!raw) return null;
    const parsed: AdminSession = JSON.parse(raw);
    if (!parsed || !parsed.authenticated) return null;
    if (parsed.email?.toLowerCase() === "admin@mammo.vn") {
      clearAdminSession();
      return null;
    }
    const members = getStoredMembers();
    const cleanEmail = parsed.email?.trim().toLowerCase();
    const matched = members.find((m) => m.email.toLowerCase() === cleanEmail);
    if (!parsed.role) {
      parsed.role = matched?.role || "admin";
    }
    if (!parsed.referralCode && matched?.referralCode) {
      parsed.referralCode = matched.referralCode;
    }
    if (!parsed.memberId && matched?.memberId) {
      parsed.memberId = matched.memberId;
    }
    if (!parsed.phone && matched?.phone) {
      parsed.phone = matched.phone;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function updateMemberPassword(emailOrMemberId: string, newPass: string): boolean {
  if (typeof window === "undefined") return false;
  const members = getStoredMembers();
  const index = members.findIndex(
    (m) => m.memberId === emailOrMemberId || m.email.toLowerCase() === emailOrMemberId.toLowerCase()
  );
  if (index === -1) return false;
  members[index].password = newPass;
  saveStoredMembers(members);
  return true;
}

// ==========================================
// PRODUCT REVIEWS STORE (Masked phone, Verified badge, Admin delete)
// ==========================================
const SEED_REVIEWS: ProductReview[] = [];

let cachedReviews: ProductReview[] | null = null;

export function getStoredReviews(productId?: string): ProductReview[] {
  if (typeof window === "undefined") return [];
  if (cachedReviews !== null) {
    return productId ? cachedReviews.filter((r) => r.product_id === productId) : cachedReviews;
  }
  try {
    const raw = localStorage.getItem("gieomo_product_reviews");
    const list: ProductReview[] = raw ? JSON.parse(raw) : [];
    cachedReviews = list;
    return productId ? list.filter((r) => r.product_id === productId) : list;
  } catch (e) {
    console.error("Error reading reviews", e);
    return [];
  }
}

export function saveNewReview(review: ProductReview): void {
  if (typeof window === "undefined") return;
  try {
    const reviews = getStoredReviews();
    const updated = [review, ...reviews.filter((r) => r.review_id !== review.review_id)];
    cachedReviews = updated;
    localStorage.setItem("gieomo_product_reviews", JSON.stringify(updated));
    window.dispatchEvent(new Event("gieomo_reviews_updated"));
  } catch (e) {
    console.error("Error saving review", e);
  }
}

export function deleteStoredReview(reviewId: string): void {
  if (typeof window === "undefined") return;
  try {
    const reviews = getStoredReviews();
    const updated = reviews.filter((r) => r.review_id !== reviewId);
    cachedReviews = updated;
    localStorage.setItem("gieomo_product_reviews", JSON.stringify(updated));
    window.dispatchEvent(new Event("gieomo_reviews_updated"));
  } catch (e) {
    console.error("Error deleting review", e);
  }
}

// ==========================================
// DATA CLEANUP & LIVE STORE PREPARATION
// ==========================================
export function clearAllMockData(includeCatalog = true): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("gieomo_cleaned_seed", "true");
    localStorage.setItem("gieomo_data_wiped_v4", "true");
    
    // Clear transactions & test records
    localStorage.setItem("gieomo_orders", JSON.stringify([]));
    localStorage.setItem("gieomo_payments", JSON.stringify([]));
    localStorage.setItem("gieomo_customers", JSON.stringify([]));
    localStorage.setItem("gieomo_vouchers", JSON.stringify([]));
    localStorage.setItem("gieomo_admin_notifications", JSON.stringify([]));
    localStorage.setItem("gieomo_product_reviews", JSON.stringify([]));
    localStorage.setItem("gieomo_contact_messages", JSON.stringify([]));
    localStorage.removeItem("gieomo_my_order_codes");
    localStorage.removeItem("gieomo_customer_profile");

    // Clear members revenue
    const members = getStoredMembers().map((m) => ({
      ...m,
      totalOrders: 0,
      totalRevenue: 0,
    }));
    localStorage.setItem("gieomo_members", JSON.stringify(members));
    
    cachedOrders = [];
    cachedPayments = [];
    cachedReviews = [];
    cachedVouchers = [];

    // Always clear products and combos as requested
    localStorage.setItem("gieomo_products", JSON.stringify([]));
    localStorage.setItem("gieomo_combos", JSON.stringify([]));
    cachedProducts = [];
    cachedCombos = [];

    // Trigger window events so all live components re-render immediately
    window.dispatchEvent(new Event("gieomo_orders_updated"));
    window.dispatchEvent(new Event("gieomo_payments_updated"));
    window.dispatchEvent(new Event("gieomo_vouchers_updated"));
    window.dispatchEvent(new Event("gieomo_members_updated"));
    window.dispatchEvent(new Event("gieomo_reviews_updated"));
    window.dispatchEvent(new Event("gieomo_products_updated"));
    window.dispatchEvent(new Event("gieomo_categories_updated"));
    window.dispatchEvent(new Event("gieomo_combos_updated"));
    window.dispatchEvent(new Event("gieomo_notifications_updated"));
  } catch (e) {
    console.error("Error clearing mock data", e);
  }
}

// Automatic one-time client side purge to ensure old mock products & orders are wiped
if (typeof window !== "undefined") {
  try {
    if (localStorage.getItem("gieomo_data_wiped_v4") !== "true") {
      clearAllMockData(true);
    }
  } catch {
    // ignore
  }
}

export function restoreSeedMockData(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem("gieomo_cleaned_seed");
    localStorage.removeItem("gieomo_orders");
    localStorage.removeItem("gieomo_payments");
    localStorage.removeItem("gieomo_customers");
    localStorage.removeItem("gieomo_admin_notifications");
    localStorage.removeItem("gieomo_product_reviews");
    localStorage.removeItem("gieomo_contact_messages");
    localStorage.removeItem("gieomo_products");
    localStorage.removeItem("gieomo_combos");
    localStorage.removeItem("gieomo_categories");

    cachedOrders = null;
    cachedPayments = null;
    cachedReviews = null;
    cachedProducts = null;

    window.dispatchEvent(new Event("gieomo_orders_updated"));
    window.dispatchEvent(new Event("gieomo_reviews_updated"));
    window.dispatchEvent(new Event("gieomo_products_updated"));
    window.dispatchEvent(new Event("gieomo_categories_updated"));
    window.dispatchEvent(new Event("gieomo_combos_updated"));
  } catch (e) {
    console.error("Error restoring mock data", e);
  }
}




