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
let hasSyncedMembersWithServer = false;
let cachedMembers: StoredMember[] | null = null;
let hasSyncedVouchersWithServer = false;
let hasSyncedPickupPointsWithServer = false;
let hasSyncedContactMessagesWithServer = false;
let hasSyncedOrdersWithServer = false;
let hasSyncedInventoryWithServer = false;

export function syncOrdersFromServer(force = false): void {
  if (typeof window === "undefined" || (hasSyncedOrdersWithServer && !force)) return;
  hasSyncedOrdersWithServer = true;
  safeFetchJson<{ success: boolean; orders: Order[] }>("/api/orders?limit=200", 10000)
    .then((data) => {
      if (data?.success && Array.isArray(data.orders)) {
        const localRaw = localStorage.getItem("gieomo_orders");
        const localOrders: Order[] = localRaw ? JSON.parse(localRaw) : (cachedOrders || []);
        
        // Server database is the authoritative source of truth
        const map = new Map<string, Order>();
        
        for (const sOrd of data.orders) {
          const code = (sOrd.order_code || sOrd.order_id || "").trim().toUpperCase();
          if (!code) continue;
          map.set(code, sOrd);
        }

        // Preserve only very fresh pending local orders (created < 10 mins ago) not yet in server list
        const tenMinsAgo = Date.now() - 10 * 60 * 1000;
        for (const o of localOrders) {
          const code = (o.order_code || o.order_id || "").trim().toUpperCase();
          if (code && !map.has(code)) {
            const createdAtTime = new Date(o.created_at).getTime();
            if (createdAtTime > tenMinsAgo) {
              map.set(code, o);
            }
          }
        }

        const merged = Array.from(map.values()).sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        cachedOrders = merged;
        localStorage.setItem("gieomo_orders", JSON.stringify(merged));
        window.dispatchEvent(new Event("gieomo_orders_updated"));
        window.dispatchEvent(new Event("gieomo_payments_updated"));
      }
    })
    .catch((err) => {
      console.warn("Could not sync orders from server:", err);
    });
}


export function getStoredOrders(): Order[] {
  if (typeof window === "undefined") return [];
  if (!hasSyncedOrdersWithServer) {
    syncOrdersFromServer();
  }
  if (cachedOrders !== null) return cachedOrders;
  try {
    const raw = localStorage.getItem("gieomo_orders");
    const rawOrders: Order[] = raw ? JSON.parse(raw) : [];
    // Deduplicate by order_code so duplicate entries are cleanly merged
    const map = new Map<string, Order>();
    for (const o of rawOrders) {
      const code = (o.order_code || o.order_id || "").trim().toUpperCase();
      if (!code) continue;
      const existing = map.get(code);
      if (!existing) {
        map.set(code, o);
      } else {
        const hasRealBuyer = Boolean(o.buyer_name && o.buyer_name !== "Khách tại quầy");
        const existingHasReal = Boolean(existing.buyer_name && existing.buyer_name !== "Khách tại quầy");
        if (hasRealBuyer && !existingHasReal) {
          map.set(code, { ...existing, ...o });
        } else {
          map.set(code, { ...o, ...existing });
        }
      }
    }
    const deduplicated = Array.from(map.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    cachedOrders = deduplicated;
    return deduplicated;
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
      const whList = getStoredWarehouses();
      const defaultWh = whList.find((w) => w.is_default) || whList[0];
      if (defaultWh) {
        newOrder.warehouse_id = defaultWh.warehouse_id;
        newOrder.warehouse_name = defaultWh.name;
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
              (it: any) =>
                (it.product_id === prod.product_id || it.product_name_snapshot === prod.name || it.item_name_snapshot === prod.name) &&
                (it.variant_id
                  ? it.variant_id === v.variant_id
                  : it.sku
                  ? it.sku === v.sku
                  : it.variant_name_snapshot
                  ? it.variant_name_snapshot === v.name
                  : true)
            );
            if (matchingItem) {
              prodModified = true;
              prodsChanged = true;
              const qty = matchingItem.quantity || 1;
              const stocks = { ...(v.warehouse_stocks || {}) };
              let wh1 = Number(v.stock_warehouse_1) || 0;
              let wh2 = Number(v.stock_warehouse_2) || 0;
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

          if (prodModified) {
            const totalProdStock = (updatedVariants || []).reduce((sum: number, vr: any) => sum + (Number(vr.stock) || 0), 0);
            return { ...prod, variants: updatedVariants, stock: totalProdStock };
          }
          return prod;
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
    const nowIso = new Date().toISOString();
    const updated = orders.map((o: any) => {
      if (o.order_id === orderId || o.order_code === orderId) {
        const timestamps = { ...((o as any).status_timestamps || {}) };
        timestamps[newStatus] = nowIso;
        return {
          ...o,
          order_status: newStatus,
          status_timestamps: timestamps,
          confirmed_at: newStatus === "confirmed" ? nowIso : o.confirmed_at,
          completed_at: newStatus === "completed" ? nowIso : o.completed_at,
          cancelled_at: newStatus === "cancelled" ? nowIso : o.cancelled_at,
          updated_at: nowIso,
        };
      }
      return o;
    });
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
      const cancelledOrder = orders.find((o: any) => o.order_id === orderId || o.order_code === orderId);
      if (cancelledOrder && cancelledOrder.items && cancelledOrder.items.length > 0) {
        try {
          const prods = getStoredProducts();
          const targetWhId = cancelledOrder.warehouse_id || "wh-1";
          let prodsChanged = false;
          const restored = prods.map((prod) => {
            let prodModified = false;
            const updatedVariants = prod.variants?.map((v) => {
              const matchingItem = cancelledOrder.items?.find(
                (it: any) => it.product_id === prod.product_id && (it.variant_id ? it.variant_id === v.variant_id : true)
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

export function updateStoredDeliveryStatus(orderCodeOrId: string, deliveryStatus: DeliveryStatus): void {
  if (typeof window === "undefined") return;
  try {
    const orders = getStoredOrders();
    const nowIso = new Date().toISOString();
    const updated = orders.map((o) => {
      if (o.order_id === orderCodeOrId || o.order_code === orderCodeOrId) {
        const timestamps = { ...((o as any).status_timestamps || {}) };
        timestamps[deliveryStatus] = nowIso;
        if (deliveryStatus === "out_for_delivery") timestamps["shipping"] = nowIso;
        if (deliveryStatus === "delivered") timestamps["completed"] = nowIso;
        return {
          ...o,
          delivery_status: deliveryStatus,
          status_timestamps: timestamps,
          completed_at: deliveryStatus === "delivered" ? nowIso : o.completed_at,
          updated_at: nowIso,
        };
      }
      return o;
    });

    cachedOrders = updated;
    localStorage.setItem("gieomo_orders", JSON.stringify(updated));

    // Sync delivery status to Supabase
    fetch("/api/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: orderCodeOrId,
        deliveryStatus,
      }),
    }).catch((err) => {
      console.warn("[updateStoredDeliveryStatus] Failed to sync delivery status to Supabase:", err);
    });

    window.dispatchEvent(new Event("gieomo_orders_updated"));
  } catch (e) {
    console.error("Error updating delivery status", e);
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

export function updateStoredPaymentProof(orderId: string, proof: string): void {
  if (typeof window === "undefined") return;
  try {
    const orders = getStoredOrders();
    const updated = orders.map((o) =>
      o.order_id === orderId || o.order_code === orderId
        ? {
          ...o,
          payment_proof: proof,
          updated_at: new Date().toISOString(),
        }
        : o
    );
    cachedOrders = updated;
    localStorage.setItem("gieomo_orders", JSON.stringify(updated));

    fetch("/api/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId,
        paymentProof: proof,
      }),
    }).catch(() => {});

    window.dispatchEvent(new Event("gieomo_orders_updated"));
  } catch (e) {
    console.error("Error updating payment proof", e);
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
  try {
    const orders = getStoredOrders();
    const raw = localStorage.getItem("gieomo_payments");
    const explicitPayments: PaymentRecord[] = raw ? JSON.parse(raw) : [];

    const paymentMap = new Map<string, PaymentRecord>();
    explicitPayments.forEach((p) => {
      if (p && p.orderCode) {
        paymentMap.set(p.orderCode, p);
      }
    });

    orders.forEach((o) => {
      const pm = (o.payment_method as string) || "";
      const isBank =
        pm === "vietqr" ||
        pm === "banking" ||
        pm === "bank_transfer" ||
        !!o.payment_proof;

      if (isBank && o.order_code) {
        const existing = paymentMap.get(o.order_code);
        if (!existing) {
          paymentMap.set(o.order_code, {
            paymentId: `pay-${o.order_id || o.order_code}`,
            orderCode: o.order_code,
            amount: o.final_amount,
            paymentMethod: (o.payment_method as any) || "vietqr",
            transactionCode:
              (o as any).transaction_code ||
              `MB-${o.order_code.replace(/\D/g, "") || Math.floor(1000000 + Math.random() * 9000000)}`,
            status: o.payment_status === "paid" ? "paid" : "pending",
            createdAt: o.created_at
              ? new Date(o.created_at).toLocaleString("vi-VN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                })
              : "Vừa xong",
          });
        } else {
          // Keep synchronized with order payment status
          if (o.payment_status === "paid") {
            existing.status = "paid";
          }
          existing.amount = o.final_amount;
        }
      }
    });

    const combined = Array.from(paymentMap.values()).sort((a, b) => {
      if (a.status === "pending" && b.status === "paid") return -1;
      if (a.status === "paid" && b.status === "pending") return 1;
      return 0;
    });

    cachedPayments = combined;
    return combined;
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
async function safeFetchJson<T = any>(url: string, timeoutMs = 10000): Promise<T | null> {
  try {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    const res = await fetch(url, {
      signal: controller ? controller.signal : undefined,
      cache: "no-store",
    });
    if (timeoutId) clearTimeout(timeoutId);
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

export function syncPickupPointsFromServer(force = false): void {
  if (typeof window === "undefined" || (hasSyncedPickupPointsWithServer && !force)) return;
  safeFetchJson<{ success: boolean; pickup_points: PickupPoint[] }>("/api/pickup-points", 10000)
    .then((data) => {
      if (data?.success && Array.isArray(data.pickup_points)) {
        hasSyncedPickupPointsWithServer = true;
        const finalPoints = data.pickup_points.length > 0 ? data.pickup_points : SEED_PICKUP_POINTS;
        localStorage.setItem("gieomo_pickup_points", JSON.stringify(finalPoints));
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
    const target = list.find((p) => p.pickup_point_id === pointId || p.name === pointId);
    const updated = list.filter((p) => p.pickup_point_id !== pointId && p.name !== pointId);
    localStorage.setItem("gieomo_pickup_points", JSON.stringify(updated));
    window.dispatchEvent(new Event("gieomo_pickup_points_updated"));

    // Sync DELETE to Supabase
    const params = new URLSearchParams();
    if (target?.pickup_point_id) params.set("id", target.pickup_point_id);
    else params.set("id", pointId);
    if (target?.name) params.set("name", target.name);

    fetch(`/api/pickup-points?${params.toString()}`, {
      method: "DELETE",
    }).catch((err) => console.warn("Could not delete pickup point on server:", err));
  } catch (e) {
    console.error("Error deleting pickup point", e);
  }
}

// === CONTACT MESSAGES STORE ===

const SEED_CONTACT_MESSAGES: ContactMessage[] = [];

export function syncContactMessagesFromServer(force = false): void {
  if (typeof window === "undefined" || (hasSyncedContactMessagesWithServer && !force)) return;
  safeFetchJson<{ success: boolean; messages: ContactMessage[] }>("/api/contact/messages", 10000)
    .then((data) => {
      if (data?.success && Array.isArray(data.messages)) {
        hasSyncedContactMessagesWithServer = true;
        localStorage.setItem("gieomo_contact_messages", JSON.stringify(data.messages));
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

export function deleteStoredContactMessage(id: string): void {
  if (typeof window === "undefined") return;
  try {
    const list = getStoredContactMessages();
    const updated = list.filter((m) => m.id !== id);
    localStorage.setItem("gieomo_contact_messages", JSON.stringify(updated));
    window.dispatchEvent(new Event("gieomo_messages_updated"));

    fetch(`/api/contact/messages?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    }).catch((err) => console.warn("Could not delete contact message on server:", err));
  } catch (e) {
    console.error("Error deleting contact message", e);
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
  lastActiveAt?: string;
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

export function syncMembersFromServer(force = false): void {
  if (typeof window === "undefined" || (hasSyncedMembersWithServer && !force)) return;
  safeFetchJson<{ success: boolean; members: any[] }>("/api/members", 10000)
    .then((data) => {
      if (data?.success && Array.isArray(data.members)) {
        hasSyncedMembersWithServer = true;
        if (data.members.length > 0) {
          const currentLocal = cachedMembers || [];
          const localMap = new Map<string, StoredMember>();
          currentLocal.forEach((m) => {
            if (m.memberId) localMap.set(m.memberId.toLowerCase(), m);
            if (m.email) localMap.set(m.email.toLowerCase(), m);
          });

          // Check presence store fallback
          let presenceMap: Record<string, string> = {};
          try {
            presenceMap = JSON.parse(localStorage.getItem("gieomo_presence") || "{}");
          } catch {}

          const mapped: StoredMember[] = data.members.map((m: any) => {
            const loc = localMap.get(m.member_id?.toLowerCase()) || (m.email ? localMap.get(m.email.toLowerCase()) : undefined);
            const savedPresence = presenceMap[m.member_id] || (m.email ? presenceMap[m.email.toLowerCase()] : undefined);
            const finalLastActive = m.last_active_at || loc?.lastActiveAt || savedPresence || undefined;

            return {
              memberId: m.member_id,
              fullName: m.full_name,
              email: m.email || "",
              role: m.role || "btc_sale",
              referralCode: m.referral_code || "",
              phone: m.phone || "Chưa cập nhật",
              totalOrders: loc?.totalOrders || 0,
              totalRevenue: loc?.totalRevenue || 0,
              status: m.status || "active",
              joinedDate: m.created_at ? new Date(m.created_at).toLocaleDateString("vi-VN") : (loc?.joinedDate || "01/09/2026"),
              password: m.password || m.password_hash || loc?.password || "MamMo@123",
              lastActiveAt: finalLastActive,
              lastLoginAt: loc?.lastLoginAt || undefined,
            };
          });

          const hasMaintenance = mapped.some(
            (m) => m.email.toLowerCase() === "baotri@gieomo.store" || m.memberId === "baotri-system"
          );
          const finalMembers = hasMaintenance ? mapped : [SYSTEM_MAINTENANCE_ACCOUNT, ...mapped];

          cachedMembers = finalMembers;
          localStorage.setItem("gieomo_members", JSON.stringify(finalMembers));
          window.dispatchEvent(new Event("gieomo_members_updated"));
        } else {
          // If server members is empty, ensure maintenance account only
          const fallback = [SYSTEM_MAINTENANCE_ACCOUNT];
          cachedMembers = fallback;
          localStorage.setItem("gieomo_members", JSON.stringify(fallback));
          window.dispatchEvent(new Event("gieomo_members_updated"));
        }
      }
    })
    .catch(() => {
      // Graceful fallback to cached
    });
}

export function getStoredMembers(): StoredMember[] {
  if (typeof window === "undefined") return [SYSTEM_MAINTENANCE_ACCOUNT];
  if (!hasSyncedMembersWithServer) {
    syncMembersFromServer();
  }
  if (cachedMembers !== null) return cachedMembers;
  try {
    const raw = localStorage.getItem("gieomo_members");
    if (!raw) {
      const init = [SYSTEM_MAINTENANCE_ACCOUNT];
      cachedMembers = init;
      localStorage.setItem("gieomo_members", JSON.stringify(init));
      return init;
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

    const baotriExists = sanitized.some(
      (m) => m.email.toLowerCase() === "baotri@gieomo.store" || m.memberId === "baotri-system"
    );

    if (!baotriExists) {
      sanitized = [SYSTEM_MAINTENANCE_ACCOUNT, ...sanitized];
      needsUpdate = true;
    }

    if (needsUpdate) {
      localStorage.setItem("gieomo_members", JSON.stringify(sanitized));
    }

    cachedMembers = sanitized;
    return sanitized;
  } catch {
    return [SYSTEM_MAINTENANCE_ACCOUNT];
  }
}

/**
 * Returns active members eligible for referral selection by customers or POS,
 * strictly excluding system maintenance / admin service accounts.
 */
export function getActiveReferralMembers(): StoredMember[] {
  return getStoredMembers().filter((m) => {
    if (m.status !== "active") return false;
    if (m.isSystemProtected) return false;
    if (m.memberId === "baotri-system") return false;
    if (m.email?.toLowerCase() === "baotri@gieomo.store") return false;
    if (m.referralCode?.toUpperCase() === "BAOTRI") return false;
    if (m.fullName?.toLowerCase().includes("bảo trì")) return false;
    return true;
  });
}

export function saveStoredMembers(members: StoredMember[], changedMember?: StoredMember): void {
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

    cachedMembers = sanitized;
    localStorage.setItem("gieomo_members", JSON.stringify(sanitized));
    window.dispatchEvent(new Event("gieomo_members_updated"));

    // 3. Sync to Supabase in background — only the changed member if specified
    const toSync = changedMember
      ? sanitized.filter((m) => m.memberId === changedMember.memberId)
      : sanitized;

    toSync.forEach((m) => {
      if (m.memberId !== "baotri-system") {
        fetch("/api/members", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            memberId: m.memberId,
            fullName: m.fullName,
            email: m.email,
            phone: m.phone,
            role: m.role,
            status: m.status,
            referralCode: m.referralCode,
            password: m.password && m.password !== "••••••••" ? m.password : undefined,
          }),
        }).catch((err) => console.warn("Could not sync member to server:", err));
      }
    });
  } catch (e) {
    console.error("Error saving members to storage", e);
  }
}

export function deleteStoredMember(memberId: string): void {
  if (typeof window === "undefined") return;
  try {
    const current = getStoredMembers();
    const target = current.find((m) => m.memberId === memberId);
    const updated = current.filter((m) => m.memberId !== memberId);

    cachedMembers = updated;
    localStorage.setItem("gieomo_members", JSON.stringify(updated));
    window.dispatchEvent(new Event("gieomo_members_updated"));

    // If the deleted member was logged in currently, clear their session immediately!
    const rawSession = localStorage.getItem("gieomo_admin_session");
    if (rawSession) {
      try {
        const s = JSON.parse(rawSession);
        if (
          s.memberId === memberId ||
          (target?.email && s.email?.toLowerCase() === target.email.toLowerCase()) ||
          (target?.referralCode && s.referralCode?.toUpperCase() === target.referralCode.toUpperCase())
        ) {
          clearAdminSession();
        }
      } catch {}
    }

    // Sync DELETE to Supabase
    const params = new URLSearchParams();
    if (memberId) params.append("id", memberId);
    if (target?.email) params.append("email", target.email);
    if (target?.referralCode) params.append("referralCode", target.referralCode);

    fetch(`/api/members?${params.toString()}`, {
      method: "DELETE",
    }).catch((err) => console.warn("Could not delete member on server:", err));
  } catch (e) {
    console.error("Error deleting member from storage", e);
  }
}

let lastHeartbeatSentAt = 0;

/**
 * Đồng bộ trạng thái trực tuyến của toàn bộ thành viên từ server Supabase
 */
export function syncPresenceFromServer(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  return safeFetchJson<{ success: boolean; presence: Record<string, string> }>("/api/members/presence")
    .then((data) => {
      if (data?.success && data.presence) {
        localStorage.setItem("gieomo_presence", JSON.stringify(data.presence));
        const members = getStoredMembers();
        let changed = false;
        members.forEach((m) => {
          const serverTs = data.presence[m.memberId] || (m.email ? data.presence[m.email.toLowerCase()] : null);
          if (serverTs && (!m.lastActiveAt || new Date(serverTs).getTime() > new Date(m.lastActiveAt).getTime())) {
            m.lastActiveAt = serverTs;
            changed = true;
          }
        });
        if (changed) {
          cachedMembers = members;
          localStorage.setItem("gieomo_members", JSON.stringify(members));
          window.dispatchEvent(new Event("gieomo_members_updated"));
        }
      }
    })
    .catch(() => {});
}

/**
 * Cập nhật tín hiệu hoạt động (heartbeat) khi thành viên đang mở tab website.
 * Tự động đồng bộ lên Supabase để mọi thiết bị/admin khác thấy tức thời.
 */
export function touchMemberActive(emailOrMemberId?: string): void {
  if (typeof window === "undefined") return;
  try {
    const rawSession = localStorage.getItem("gieomo_admin_session");
    let target = emailOrMemberId;
    if (!target && rawSession) {
      const s = JSON.parse(rawSession);
      target = s.memberId || s.email;
    }
    if (!target) return;

    const members = getStoredMembers();
    const clean = target.trim().toLowerCase();
    const matched = members.find(
      (m) => m.memberId?.toLowerCase() === clean || m.email.toLowerCase() === clean
    );

    if (matched) {
      if (matched.status === "inactive") {
        clearAdminSession();
        return;
      }

      const now = Date.now();
      const prev = matched.lastActiveAt ? new Date(matched.lastActiveAt).getTime() : 0;
      const nowIso = new Date(now).toISOString();

      // Cập nhật bộ nhớ cục bộ
      if (!matched.lastActiveAt || now - prev > 15000) {
        matched.lastActiveAt = nowIso;
        cachedMembers = members;
        localStorage.setItem("gieomo_members", JSON.stringify(members));

        try {
          const presenceMap = JSON.parse(localStorage.getItem("gieomo_presence") || "{}");
          presenceMap[matched.memberId] = nowIso;
          if (matched.email) presenceMap[matched.email.toLowerCase()] = nowIso;
          localStorage.setItem("gieomo_presence", JSON.stringify(presenceMap));
        } catch {}

        window.dispatchEvent(new Event("gieomo_members_updated"));
      }

      // Gửi heartbeat lên server để toàn bộ thiết bị khác đều thấy thành viên này Online
      if (now - lastHeartbeatSentAt > 15000) {
        lastHeartbeatSentAt = now;
        fetch("/api/members/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            memberId: matched.memberId,
            email: matched.email,
          }),
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.error("Error updating member heartbeat", err);
  }
}

/**
 * Tính toán trạng thái trực tuyến (online/offline) dựa trên việc có ở trong web gần đây hay không
 */
export function getMemberPresence(m: StoredMember): {
  isOnline: boolean;
  label: string;
  subtext: string;
} {
  let ts = m.lastActiveAt || m.lastLoginAt;
  if (typeof window !== "undefined") {
    try {
      const presenceMap = JSON.parse(localStorage.getItem("gieomo_presence") || "{}");
      const fallbackTs = presenceMap[m.memberId] || (m.email ? presenceMap[m.email.toLowerCase()] : null);
      if (fallbackTs && (!ts || new Date(fallbackTs).getTime() > new Date(ts).getTime())) {
        ts = fallbackTs;
      }
    } catch {}
  }

  if (!ts) {
    return {
      isOnline: false,
      label: "Chưa từng đăng nhập",
      subtext: "Chưa từng đăng nhập",
    };
  }

  const diffMs = Math.max(0, Date.now() - new Date(ts).getTime());
  const diffMinutes = Math.floor(diffMs / (60 * 1000));

  // Trong vòng 5 phút kể từ tín hiệu heartbeat cuối cùng -> coi như đang mở web
  if (diffMinutes < 5) {
    return {
      isOnline: true,
      label: "Đang trong web",
      subtext: "Đang online",
    };
  }

  if (diffMinutes < 60) {
    return {
      isOnline: false,
      label: `Rời web ${diffMinutes} phút trước`,
      subtext: `${diffMinutes} phút trước`,
    };
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return {
      isOnline: false,
      label: `Rời web ${diffHours} giờ trước`,
      subtext: `${diffHours} giờ trước`,
    };
  }

  const dateObj = new Date(ts);
  const timeStr = dateObj.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  const dateStr = dateObj.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
  return {
    isOnline: false,
    label: `Rời web ${dateStr} ${timeStr}`,
    subtext: `${dateStr} ${timeStr}`,
  };
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

export function syncVouchersFromServer(force = false): void {
  if (typeof window === "undefined" || (hasSyncedVouchersWithServer && !force)) return;
  safeFetchJson<{ success: boolean; vouchers: Voucher[] }>("/api/vouchers", 10000)
    .then((data) => {
      if (data?.success && Array.isArray(data.vouchers)) {
        hasSyncedVouchersWithServer = true;
        cachedVouchers = data.vouchers;
        localStorage.setItem("gieomo_vouchers", JSON.stringify(data.vouchers));
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
    const target = list.find((v) => v.voucher_id === voucherId);
    const updated = list.filter((v) => v.voucher_id !== voucherId);
    cachedVouchers = updated;
    localStorage.setItem("gieomo_vouchers", JSON.stringify(updated));
    window.dispatchEvent(new Event("gieomo_vouchers_updated"));

    // Sync DELETE to Supabase
    const idToDelete = target?.code || voucherId;
    fetch(`/api/vouchers?id=${encodeURIComponent(idToDelete)}`, {
      method: "DELETE",
    }).catch((err) => console.warn("Could not delete voucher on server:", err));
  } catch (e) {
    console.error("Error deleting voucher", e);
  }
}

// ==========================================
// PRODUCTS STORE (TOÀN BỘ SẢN PHẨM & CỬA HÀNG)
// ==========================================

export function syncProductsFromServer(force = false): Promise<ExtendedProduct[]> {
  if (typeof window === "undefined") return Promise.resolve([]);
  if (hasSyncedProductsWithServer && !force && cachedProducts !== null) {
    return Promise.resolve(cachedProducts);
  }
  return safeFetchJson<{ success: boolean; products: ExtendedProduct[] }>("/api/products?admin=true", 10000)
    .then((data) => {
      if (data?.success && Array.isArray(data.products)) {
        hasSyncedProductsWithServer = true;
        const merged = data.products.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        cachedProducts = merged;
        try {
          localStorage.setItem("gieomo_products", JSON.stringify(merged));
        } catch {}
        window.dispatchEvent(new Event("gieomo_products_updated"));
        return merged;
      }
      return cachedProducts || [];
    })
    .catch(() => {
      return cachedProducts || [];
    });
}

export async function clearAllStoredProducts(): Promise<void> {
  MOCK_PRODUCTS.length = 0;
  cachedProducts = [];
  if (typeof window !== "undefined") {
    localStorage.setItem("gieomo_products", JSON.stringify([]));
    localStorage.removeItem("gieomo-cart");
    window.dispatchEvent(new Event("gieomo_products_updated"));
    window.dispatchEvent(new Event("gieomo_cart_updated"));
    try {
      await fetch("/api/products?id=all", { method: "DELETE" });
    } catch (e) {
      console.warn("Could not delete products on server:", e);
    }
  }
}

export function getStoredProducts(): ExtendedProduct[] {
  if (typeof window === "undefined") return [];

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
  if (!slug) return undefined;
  const products = getStoredProducts();
  const decodedSlug = decodeURIComponent(slug);
  return products.find(
    (p) =>
      p.slug === slug ||
      p.slug === decodedSlug ||
      p.product_id === slug ||
      p.product_id === decodedSlug
  );
}

export async function saveNewProduct(
  product: ExtendedProduct
): Promise<{ success: boolean; product_id?: string; error?: string }> {
  // Ensure variants have warehouse stock values
  const normalizedVariants = product.variants?.map((v, i) => {
    const wh1 = Number(v.stock_warehouse_1) || 0;
    const wh2 = Number(v.stock_warehouse_2) || 0;
    const total = v.stock !== undefined ? Number(v.stock) : (wh1 + wh2);
    return {
      ...v,
      stock: total,
      stock_warehouse_1: wh1,
      stock_warehouse_2: wh2,
    };
  });

  let productToSave: ExtendedProduct = {
    ...product,
    variants: normalizedVariants,
  };

  // 1. Sync to Supabase DB FIRST
  if (typeof window !== "undefined") {
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(productToSave),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        console.error("[saveNewProduct] Server error:", data?.error);
        return {
          success: false,
          error: data?.error || "Lỗi lưu sản phẩm vào cơ sở dữ liệu",
        };
      }
      if (data.product_id) {
        productToSave = { ...productToSave, product_id: data.product_id };
      }
    } catch (netErr: any) {
      console.warn("[saveNewProduct] Network error syncing to server:", netErr);
    }
  }

  // 2. Sync with mock data array in memory
  if (
    !MOCK_PRODUCTS.some(
      (p) =>
        p.product_id === productToSave.product_id || p.slug === productToSave.slug
    )
  ) {
    MOCK_PRODUCTS.unshift(productToSave);
  }

  // 3. Persist to localStorage & dispatch update event
  if (typeof window !== "undefined") {
    try {
      const list = getStoredProducts();
      const updated = [
        productToSave,
        ...list.filter(
          (p) =>
            p.product_id !== productToSave.product_id &&
            p.slug !== productToSave.slug
        ),
      ];
      cachedProducts = updated;
      localStorage.setItem("gieomo_products", JSON.stringify(updated));
      window.dispatchEvent(new Event("gieomo_products_updated"));
    } catch (e) {
      console.error("Error saving new product to localStorage", e);
    }
  }

  return { success: true, product_id: productToSave.product_id };
}

export async function updateStoredProduct(
  product: ExtendedProduct
): Promise<{ success: boolean; error?: string }> {
  if (!MOCK_PRODUCTS.some((p) => p.product_id === product.product_id)) {
    MOCK_PRODUCTS.unshift(product);
  } else {
    const idx = MOCK_PRODUCTS.findIndex((p) => p.product_id === product.product_id);
    if (idx !== -1) MOCK_PRODUCTS[idx] = product;
  }

  if (typeof window !== "undefined") {
    try {
      const list = getStoredProducts();
      const updated = list.map((p) =>
        p.product_id === product.product_id ? product : p
      );
      cachedProducts = updated;
      localStorage.setItem("gieomo_products", JSON.stringify(updated));
      window.dispatchEvent(new Event("gieomo_products_updated"));

      // Sync to Supabase DB
      const res = await fetch("/api/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: product.product_id, product }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        console.warn("[updateStoredProduct] Server warning:", data?.error);
        return { success: false, error: data?.error };
      }
    } catch (e: any) {
      console.error("Error updating product", e);
      return { success: false, error: e?.message };
    }
  }

  return { success: true };
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
  const mIdx = MOCK_PRODUCTS.findIndex((p) => p.product_id === productId || p.slug === productId);
  if (mIdx !== -1) MOCK_PRODUCTS.splice(mIdx, 1);

  if (typeof window === "undefined") return;
  try {
    const list = getStoredProducts();
    const target = list.find((p) => p.product_id === productId || p.slug === productId);
    const updated = list.filter((p) => p.product_id !== productId && p.slug !== productId);
    cachedProducts = updated;
    localStorage.setItem("gieomo_products", JSON.stringify(updated));

    // Prune deleted product from active cart
    try {
      const rawCart = localStorage.getItem("gieomo-cart");
      if (rawCart) {
        const parsed = JSON.parse(rawCart);
        if (parsed?.state?.items) {
          parsed.state.items = parsed.state.items.filter(
            (i: any) =>
              i.product_id !== productId &&
              i.product_id !== target?.product_id &&
              i.slug !== productId &&
              i.slug !== target?.slug
          );
          localStorage.setItem("gieomo-cart", JSON.stringify(parsed));
        }
      }
    } catch {}

    window.dispatchEvent(new Event("gieomo_products_updated"));
    window.dispatchEvent(new Event("gieomo_cart_updated"));

    // Sync deletion to Supabase
    const params = new URLSearchParams();
    if (target?.product_id) params.set("id", target.product_id);
    else params.set("id", productId);
    if (target?.slug) params.set("slug", target.slug);

    fetch(`/api/products?${params.toString()}`, {
      method: "DELETE",
    }).catch((err) => console.warn("Could not delete product on server:", err));
  } catch (e) {
    console.error("Error deleting product", e);
  }
}

// ==========================================
// WAREHOUSES STORE (QUẢN LÝ KHO HÀNG)
// ==========================================

export const DEFAULT_WAREHOUSES: Warehouse[] = [
  {
    warehouse_id: "wh-ufm",
    name: "KHO UFM",
    code: "KHO-LT",
    is_default: true,
    address: "Trường Đại học Tài chính - Marketing (UFM)",
    manager_name: "Trúc Hân",
    phone: "0888670637",
  },
  {
    warehouse_id: "wh-lang",
    name: "KHO LÀNG",
    code: "KHO-LANG",
    is_default: false,
    address: "Làng Đại học, TP. Thủ Đức",
    manager_name: "Thuỳ An",
    phone: "0907654321",
  },
];

export function syncInventoryFromServer(force = false): void {
  if (typeof window === "undefined" || (hasSyncedInventoryWithServer && !force)) return;
  fetch("/api/inventory", { cache: "no-store" })
    .then((res) => res.json())
    .then((data) => {
      if (data?.success) {
        hasSyncedInventoryWithServer = true;
        if (Array.isArray(data.warehouses) && data.warehouses.length > 0) {
          cachedWarehouses = data.warehouses;
          localStorage.setItem("gieomo_warehouses", JSON.stringify(data.warehouses));
          window.dispatchEvent(new Event("gieomo_warehouses_updated"));
        }
        if (Array.isArray(data.inflowLogs)) {
          localStorage.setItem("gieomo_inventory_inflow_logs", JSON.stringify(data.inflowLogs));
          window.dispatchEvent(new Event("gieomo_inventory_logs_updated"));
        }
        if (Array.isArray(data.transferLogs)) {
          localStorage.setItem("gieomo_inventory_transfer_logs", JSON.stringify(data.transferLogs));
          window.dispatchEvent(new Event("gieomo_inventory_logs_updated"));
        }
      }
    })
    .catch((err) => console.warn("Could not sync inventory from server:", err));
}

export function getStoredWarehouses(): Warehouse[] {
  if (typeof window === "undefined") return DEFAULT_WAREHOUSES;
  if (!hasSyncedInventoryWithServer) {
    syncInventoryFromServer();
  }
  if (cachedWarehouses !== null && cachedWarehouses.length > 0) return cachedWarehouses;
  try {
    const raw = localStorage.getItem("gieomo_warehouses");
    if (raw) {
      const parsed: Warehouse[] = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        cachedWarehouses = parsed;
        return parsed;
      }
    }
    // Initialize with standard active warehouses
    cachedWarehouses = DEFAULT_WAREHOUSES;
    localStorage.setItem("gieomo_warehouses", JSON.stringify(DEFAULT_WAREHOUSES));
    return DEFAULT_WAREHOUSES;
  } catch (e) {
    console.error("Error reading gieomo_warehouses from localStorage", e);
    return DEFAULT_WAREHOUSES;
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

    // Sync to Supabase in background
    fetch("/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "saveWarehouses", warehouses: updated }),
    }).catch((err) => console.warn("Could not save warehouse to server:", err));
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

    // Sync to Supabase in background
    fetch("/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "saveWarehouses", warehouses: updated }),
    }).catch((err) => console.warn("Could not update warehouse on server:", err));
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

    // Sync to Supabase in background
    fetch("/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "saveWarehouses", warehouses: updated }),
    }).catch((err) => console.warn("Could not delete warehouse on server:", err));
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

    let modifiedProduct: ExtendedProduct | null = null;

    const updated = products.map((p) => {
      if (p.product_id !== productId) return p;

      const updatedVariants = p.variants?.map((v) => {
        if (v.variant_id !== variantId) return v;

        const stocks = { ...(v.warehouse_stocks || {}) };
        stocks[warehouseId] = safeStock;

        // Legacy compatibility
        let wh1 = Number(v.stock_warehouse_1) || 0;
        let wh2 = Number(v.stock_warehouse_2) || 0;
        if (warehouseId === "wh-1" || warehouseId === "wh-ufm") wh1 = safeStock;
        if (warehouseId === "wh-2" || warehouseId === "wh-lang") wh2 = safeStock;

        // Calculate total stock as sum of all known warehouse stocks
        const allWhs = getStoredWarehouses();
        let total = 0;
        for (const wh of allWhs) {
          if (stocks[wh.warehouse_id] !== undefined) {
            total += Number(stocks[wh.warehouse_id]) || 0;
          } else if (wh.warehouse_id === "wh-1" || wh.warehouse_id === "wh-ufm") {
            total += wh1;
          } else if (wh.warehouse_id === "wh-2" || wh.warehouse_id === "wh-lang") {
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

      const mod: ExtendedProduct = {
        ...p,
        stock: totalProdStock,
        variants: updatedVariants,
      };

      modifiedProduct = mod;
      return mod;
    });

    cachedProducts = updated;
    localStorage.setItem("gieomo_products", JSON.stringify(updated));
    window.dispatchEvent(new Event("gieomo_products_updated"));

    // Sync product to Supabase DB
    if (modifiedProduct) {
      updateStoredProduct(modifiedProduct);
    }
  } catch (e) {
    console.error("Error updating product warehouse stock", e);
  }
}

// ==========================================
// INVENTORY LOGS STORE (PHIẾU NHẬP & ĐIỀU CHUYỂN KHO)
// ==========================================

export interface InflowLog {
  logId: string;
  receiptCode: string;
  warehouseId: string;
  warehouseName: string;
  productName: string;
  variantName: string;
  quantityAdded: number;
  stockBefore: number;
  stockAfter: number;
  unitCost: number;
  approvedBy: string;
  sourceNote: string;
  createdAt: string;
}

export interface TransferLog {
  logId: string;
  transferCode: string;
  productName: string;
  variantName: string;
  fromWarehouse: string;
  toWarehouse: string;
  quantity: number;
  approvedBy: string;
  reason: string;
  createdAt: string;
}

export function getStoredInflowLogs(): InflowLog[] {
  if (typeof window === "undefined") return [];
  if (!hasSyncedInventoryWithServer) {
    syncInventoryFromServer();
  }
  try {
    const raw = localStorage.getItem("gieomo_inventory_inflow_logs");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveStoredInflowLogs(logs: InflowLog[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("gieomo_inventory_inflow_logs", JSON.stringify(logs));
  window.dispatchEvent(new Event("gieomo_inventory_logs_updated"));

  // Sync to Supabase in background
  fetch("/api/inventory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "saveInflowLogs", inflowLogs: logs }),
  }).catch((err) => console.warn("Could not save inflow logs to server:", err));
}

export function getStoredTransferLogs(): TransferLog[] {
  if (typeof window === "undefined") return [];
  if (!hasSyncedInventoryWithServer) {
    syncInventoryFromServer();
  }
  try {
    const raw = localStorage.getItem("gieomo_inventory_transfer_logs");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveStoredTransferLogs(logs: TransferLog[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("gieomo_inventory_transfer_logs", JSON.stringify(logs));
  window.dispatchEvent(new Event("gieomo_inventory_logs_updated"));

  // Sync to Supabase in background
  fetch("/api/inventory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "saveTransferLogs", transferLogs: logs }),
  }).catch((err) => console.warn("Could not save transfer logs to server:", err));
}

export function clearInventoryLogs(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("gieomo_inventory_inflow_logs", JSON.stringify([]));
  localStorage.setItem("gieomo_inventory_transfer_logs", JSON.stringify([]));
  window.dispatchEvent(new Event("gieomo_inventory_logs_updated"));

  // Sync wipe to Supabase server in background
  fetch("/api/inventory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "saveInflowLogs", inflowLogs: [] }),
  }).catch((err) => console.warn("Could not clear inflow logs on server:", err));

  fetch("/api/inventory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "saveTransferLogs", transferLogs: [] }),
  }).catch((err) => console.warn("Could not clear transfer logs on server:", err));
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
  announcementText?: string;
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
  qrImageUrl: "/images/logo.png",
  activePalette: "soft-green",
  coverTheme: "emerald",
  announcementText: "",
  faviconPreview: "/favicon.ico",
  avatarPreview: "/images/logo.png",
  facebookUrl: "https://www.facebook.com/BanHangGieoMo",
  tiktokUrl: "https://www.tiktok.com/@vuongquocmam",
  instagramUrl: "https://www.instagram.com/mam.mer.oii",
  zaloUrl: "",
  youtubeUrl: "",
};

let cachedSettings: SiteSettings | null = null;
let hasSyncedSettingsWithServer = false;

export function syncSettingsFromServer(force = false): void {
  if (typeof window === "undefined" || (hasSyncedSettingsWithServer && !force)) return;
  safeFetchJson<{ success: boolean; settings: Partial<SiteSettings> }>("/api/settings", 10000)
    .then((data) => {
      if (data?.success && data?.settings) {
        hasSyncedSettingsWithServer = true;
        cachedSettings = { ...DEFAULT_SETTINGS, ...data.settings };
        if (
          !cachedSettings.avatarPreview ||
          cachedSettings.avatarPreview.startsWith("blob:") ||
          cachedSettings.avatarPreview.includes("supabase.co")
        ) {
          cachedSettings.avatarPreview = "/images/logo.png";
        }
        if (
          !cachedSettings.faviconPreview ||
          cachedSettings.faviconPreview.startsWith("blob:") ||
          cachedSettings.faviconPreview.includes("supabase.co") ||
          cachedSettings.faviconPreview.endsWith(".svg")
        ) {
          cachedSettings.faviconPreview = "/favicon.ico";
        }
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

    // Auto-clean stale blob / broken storage URLs
    if (
      !merged.avatarPreview ||
      merged.avatarPreview.startsWith("blob:") ||
      merged.avatarPreview.includes("supabase.co")
    ) {
      merged.avatarPreview = "/images/logo.png";
    }
    if (
      !merged.faviconPreview ||
      merged.faviconPreview.startsWith("blob:") ||
      merged.faviconPreview.includes("supabase.co") ||
      merged.faviconPreview.endsWith(".svg")
    ) {
      merged.faviconPreview = "/favicon.ico";
    }
    if (
      !merged.qrImageUrl ||
      merged.qrImageUrl.startsWith("blob:") ||
      merged.qrImageUrl.includes("supabase.co")
    ) {
      merged.qrImageUrl = "/images/logo.png";
    }

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

export function syncCategoriesFromServer(force = false): void {
  if (typeof window === "undefined" || (hasSyncedCategoriesWithServer && !force)) return;
  safeFetchJson<{ success: boolean; categories: ProductCategory[] }>("/api/categories", 10000)
    .then((data) => {
      if (data?.success && Array.isArray(data.categories)) {
        hasSyncedCategoriesWithServer = true;
        // Server database is the Single Source of Truth
        cachedCategories = data.categories;
        localStorage.setItem("gieomo_categories", JSON.stringify(data.categories));
        window.dispatchEvent(new Event("gieomo_categories_updated"));
      }
    })
    .catch(() => {
      // Graceful fallback to cached categories
    });
}

export function getStoredCategories(): ProductCategory[] {
  if (typeof window === "undefined") return [];
  if (!hasSyncedCategoriesWithServer) {
    syncCategoriesFromServer();
  }
  if (cachedCategories !== null) return cachedCategories;
  try {
    const raw = localStorage.getItem("gieomo_categories");
    if (!raw) {
      return [];
    }
    const categories: ProductCategory[] = JSON.parse(raw);
    cachedCategories = categories;
    return categories;
  } catch (e) {
    console.error("Error reading gieomo_categories", e);
    return [];
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
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.success && data?.category) {
          const current = getStoredCategories();
          const reconciled = current.map((c) => (c.slug === cat.slug ? data.category : c));
          cachedCategories = reconciled;
          localStorage.setItem("gieomo_categories", JSON.stringify(reconciled));
          window.dispatchEvent(new Event("gieomo_categories_updated"));
        }
      })
      .catch((err) => console.warn("Could not persist category to server:", err));
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
    const target = categories.find((c) => c.category_id === categoryId);
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

    // Sync deletion to Supabase in background using category_id (or slug as fallback)
    const deleteId = target?.slug || categoryId;
    fetch(`/api/categories?id=${encodeURIComponent(deleteId)}`, {
      method: "DELETE",
    }).catch((err) => console.warn("Could not delete category on server:", err));
  } catch (e) {
    console.error("Error deleting category", e);
  }
}

// === COMBOS STORE ===

let cachedCombos: ExtendedCombo[] | null = null;
let hasSyncedCombosWithServer = false;

export function syncCombosFromServer(force = false): void {
  if (typeof window === "undefined" || (hasSyncedCombosWithServer && !force)) return;
  safeFetchJson<{ success: boolean; combos: any[] }>("/api/combos", 10000)
    .then((data) => {
      if (data?.success && Array.isArray(data.combos)) {
        hasSyncedCombosWithServer = true;
        const mapped: ExtendedCombo[] = data.combos.map((sC) => {
          const itemThumb = sC.image_url || sC.thumbnail || "/images/products/set_combo_1.jpg";
          return {
            combo_id: sC.combo_id,
            name: sC.name,
            slug: sC.slug,
            price: Number(sC.price) || 0,
            description: sC.description || "",
            thumbnail: itemThumb,
            images: [itemThumb],
            status: sC.status || "active",
            featured: Boolean(sC.featured),
            sort_order: Number(sC.sort_order) || 1,
            created_at: sC.created_at || new Date().toISOString(),
            items: (sC.combo_items || []).map((ci: any) => {
              const p = ci.product || {};
              return {
                product_id: ci.product_id,
                quantity: ci.quantity || 1,
                name: p.name || "Sản phẩm",
                slug: p.slug || "",
                price: Number(p.price) || 0,
                product: {
                  product_id: ci.product_id,
                  name: p.name || "Sản phẩm",
                  slug: p.slug || "",
                  price: Number(p.price) || 0,
                  thumbnail: p.thumbnail || "/images/products/pounch_1.png",
                  compare_at_price: null,
                  cost_price: null,
                  status: "active" as const,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                },
              };
            }),
          };
        });
        cachedCombos = mapped;
        localStorage.setItem("gieomo_combos", JSON.stringify(mapped));
        window.dispatchEvent(new Event("gieomo_combos_updated"));
      }
    })
    .catch(() => {});
}

export function getStoredCombos(): ExtendedCombo[] {
  if (typeof window === "undefined") return [];
  if (!hasSyncedCombosWithServer) {
    syncCombosFromServer();
  }
  if (cachedCombos !== null) return cachedCombos;
  try {
    const raw = localStorage.getItem("gieomo_combos");
    if (!raw) {
      return [];
    }
    const combos: ExtendedCombo[] = JSON.parse(raw);
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
    const updated = [
      combo,
      ...combos.filter((c) => c.combo_id !== combo.combo_id && c.slug !== combo.slug),
    ];
    cachedCombos = updated;
    localStorage.setItem("gieomo_combos", JSON.stringify(updated));
    window.dispatchEvent(new Event("gieomo_combos_updated"));

    // Sync to Supabase in background
    fetch("/api/combos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(combo),
    }).catch((err) => console.warn("Could not persist combo to server:", err));
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

    // Sync to Supabase in background
    fetch("/api/combos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(combo),
    }).catch((err) => console.warn("Could not update combo on server:", err));
  } catch (e) {
    console.error("Error updating combo", e);
  }
}

export function deleteStoredCombo(comboId: string): void {
  if (typeof window === "undefined") return;
  try {
    const combos = getStoredCombos();
    const target = combos.find((c) => c.combo_id === comboId || c.slug === comboId);
    const updated = combos.filter((c) => c.combo_id !== comboId && c.slug !== comboId);
    cachedCombos = updated;
    localStorage.setItem("gieomo_combos", JSON.stringify(updated));

    // Prune deleted combo from active cart
    try {
      const rawCart = localStorage.getItem("gieomo-cart");
      if (rawCart) {
        const parsed = JSON.parse(rawCart);
        if (parsed?.state?.items) {
          parsed.state.items = parsed.state.items.filter(
            (i: any) =>
              i.combo_id !== comboId &&
              i.combo_id !== target?.combo_id &&
              i.slug !== comboId &&
              i.slug !== target?.slug
          );
          localStorage.setItem("gieomo-cart", JSON.stringify(parsed));
        }
      }
    } catch {}

    window.dispatchEvent(new Event("gieomo_combos_updated"));
    window.dispatchEvent(new Event("gieomo_cart_updated"));

    const params = new URLSearchParams();
    if (target?.combo_id) params.set("id", target.combo_id);
    else params.set("id", comboId);
    if (target?.slug) params.set("slug", target.slug);

    fetch(`/api/combos?${params.toString()}`, {
      method: "DELETE",
    }).catch((err) => console.warn("Could not delete combo on server:", err));
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

export function verifyAdminLogin(password: string, emailOrAccount?: string): LoginResult {
  const currentPass = getStoredAdminPassword();
  const members = getStoredMembers();
  const cleanInput = (emailOrAccount || "").trim();
  const cleanLower = cleanInput.toLowerCase();
  const cleanDigits = cleanInput.replace(/\D/g, "");

  // Explicitly deny revoked former BTC leader account
  if (cleanLower === "admin@mammo.vn") {
    return { success: false, error: "Tài khoản này đã bị thu hồi quyền truy cập hệ thống!" };
  }

  // Match member strictly by Email, Phone number, Referral code, or Member ID
  const matchedMember = cleanInput
    ? members.find((m) => {
        const mEmail = (m.email || "").toLowerCase().trim();
        const mPhone = (m.phone || "").replace(/\D/g, "");
        const mRef = (m.referralCode || "").toUpperCase().trim();
        const mId = (m.memberId || "").toLowerCase().trim();

        return (
          (mEmail && mEmail === cleanLower) ||
          (cleanDigits.length >= 8 && mPhone === cleanDigits) ||
          (mRef && mRef === cleanInput.toUpperCase()) ||
          (mId && mId === cleanLower)
        );
      })
    : null;

  // 1. Kiểm tra trạng thái tài khoản: Nếu Tạm dừng (inactive) thì KHÓA đăng nhập ngay!
  if (matchedMember && matchedMember.status === "inactive") {
    return {
      success: false,
      error: "Tài khoản của bạn đang bị TẠM KHÓA (Tạm dừng hoạt động). Vui lòng liên hệ Ban Tổ Chức!",
    };
  }

  // System maintenance account authentication (supports custom updated password & default GieoMo@2026)
  if (cleanLower === "baotri@gieomo.store" || cleanLower === "baotri" || matchedMember?.memberId === "baotri-system") {
    const isCustomPass = Boolean(matchedMember?.password && matchedMember.password !== "••••••••" && password === matchedMember.password);
    if (password === "GieoMo@2026" || isCustomPass || password === currentPass) {
      if (typeof window !== "undefined") {
        if (matchedMember) {
          matchedMember.lastLoginAt = new Date().toISOString();
          saveStoredMembers(members);
        }
        localStorage.setItem("gieomo_admin_session", JSON.stringify({
          authenticated: true,
          email: matchedMember?.email || "baotri@gieomo.store",
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
  const isMemberMatch = matchedMember
    ? (Boolean(matchedMember.password && matchedMember.password !== "••••••••" && matchedMember.password === password) ||
       password === "MamMo@123" ||
       password === "GieoMo@2026")
    : false;

  // Fallback passwords (MamMo@123, admin123, GieoMo@2026) only work when the identifier
  // belongs to a known member — prevents unknown actors from using default passwords.
  const isFallbackMatch =
    Boolean(matchedMember) &&
    (password === "MamMo@123" || password === "admin123" || password === "GieoMo@2026");

  // Master password without a matched email: only allow generic (no-email) admin logins.
  // If an unknown email is provided with master password, deny access.
  const masterAllowed = isMasterMatch && (!cleanInput || Boolean(matchedMember));

  if (masterAllowed || isMemberMatch || isFallbackMatch) {
    if (typeof window !== "undefined") {
      const role: "admin" | "btc_sale" = matchedMember ? matchedMember.role : "admin";
      const name = matchedMember?.fullName || (cleanLower === DEFAULT_ADMIN_EMAIL ? "Bảo trì Hệ thống" : "Quản trị viên");
      const finalEmail = matchedMember?.email || (cleanLower.includes("@") ? cleanLower : DEFAULT_ADMIN_EMAIL);

      // Cập nhật lần đăng nhập cuối vào thông tin thành viên (ghi đè, không tốn thêm bộ nhớ)
      if (matchedMember) {
        matchedMember.lastLoginAt = new Date().toISOString();
        saveStoredMembers(members);
      }

      // Lưu phiên đăng nhập hiện tại (ghi đè hoàn toàn phiên cũ trong localStorage)
      localStorage.setItem("gieomo_admin_session", JSON.stringify({
        authenticated: true,
        email: finalEmail,
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
    if (!parsed || !parsed.authenticated) return false;
    if (parsed?.email?.toLowerCase() === "admin@mammo.vn") {
      clearAdminSession();
      return false;
    }
    const members = getStoredMembers();
    const cleanEmail = parsed.email?.trim().toLowerCase();
    const cleanId = parsed.memberId;
    const matched = members.find(
      (m) =>
        (cleanId && m.memberId === cleanId) ||
        (cleanEmail && m.email.toLowerCase() === cleanEmail)
    );
    if (matched && matched.status === "inactive") {
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
    const cleanId = parsed.memberId;
    const matched = members.find(
      (m) =>
        (cleanId && m.memberId === cleanId) ||
        (cleanEmail && m.email.toLowerCase() === cleanEmail)
    );
    if (matched && matched.status === "inactive") {
      clearAdminSession();
      return null;
    }
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

export function verifyMemberCurrentPassword(emailOrMemberId: string, inputPass: string): boolean {
  if (typeof window === "undefined") return false;
  const members = getStoredMembers();
  const clean = emailOrMemberId.trim().toLowerCase();
  const matched = members.find(
    (m) => m.memberId?.toLowerCase() === clean || m.email.toLowerCase() === clean
  );
  if (!matched) return false;
  const storedPass = matched.password;
  const adminPass = getStoredAdminPassword();
  if (storedPass && storedPass !== "••••••••") {
    return (
      inputPass === storedPass ||
      inputPass === adminPass ||
      inputPass === "MamMo@123" ||
      inputPass === "GieoMo@2026"
    );
  }
  return (
    inputPass === "MamMo@123" ||
    inputPass === "GieoMo@2026" ||
    inputPass === adminPass
  );
}

export function updateMemberPassword(
  emailOrMemberId: string,
  newPass: string,
  oldPass?: string
): { success: boolean; error?: string } {
  if (typeof window === "undefined") return { success: false, error: "Môi trường không hỗ trợ" };
  const members = getStoredMembers();
  const index = members.findIndex(
    (m) => m.memberId === emailOrMemberId || m.email.toLowerCase() === emailOrMemberId.toLowerCase()
  );
  if (index === -1) {
    return { success: false, error: "Không tìm thấy thông tin tài khoản thành viên!" };
  }

  if (oldPass !== undefined) {
    const isOldCorrect = verifyMemberCurrentPassword(emailOrMemberId, oldPass);
    if (!isOldCorrect) {
      return { success: false, error: "Mật khẩu hiện tại không chính xác!" };
    }
  }

  members[index].password = newPass;
  saveStoredMembers(members, members[index]);
  return { success: true };
}

// ==========================================
// PRODUCT REVIEWS STORE (Masked phone, Verified badge, Admin delete)
// ==========================================
const SEED_REVIEWS: ProductReview[] = [];

let cachedReviews: ProductReview[] | null = null;
let hasSyncedReviewsWithServer = false;

export function syncReviewsFromServer(productId?: string, slug?: string, force = false): void {
  if (typeof window === "undefined" || (hasSyncedReviewsWithServer && !force)) return;
  const params = new URLSearchParams();
  const cleanId = productId && productId !== "undefined" && productId !== "null" ? productId.trim() : null;
  const cleanSlug = slug && slug !== "undefined" && slug !== "null" ? slug.trim() : null;

  if (cleanId) params.set("productId", cleanId);
  if (cleanSlug) params.set("slug", cleanSlug);

  fetch(`/api/reviews?${params.toString()}`, { cache: "no-store" })
    .then((res) => res.json())
    .then((data) => {
      if (data?.success && Array.isArray(data.reviews)) {
        hasSyncedReviewsWithServer = true;
        const serverList: ProductReview[] = data.reviews;
        cachedReviews = serverList;
        try {
          localStorage.setItem("gieomo_product_reviews", JSON.stringify(serverList));
        } catch {
          // ignore quota
        }
        window.dispatchEvent(new Event("gieomo_reviews_updated"));
      }
    })
    .catch((err) => {
      console.warn("Could not sync reviews from server:", err);
    });
}

export function getStoredReviews(productId?: string, slug?: string): ProductReview[] {
  if (typeof window === "undefined") return [];
  if (!hasSyncedReviewsWithServer) {
    syncReviewsFromServer(productId, slug);
  }

  const cleanId = productId && productId !== "undefined" && productId !== "null" ? productId.trim() : null;
  const cleanSlug = slug && slug !== "undefined" && slug !== "null" ? slug.trim() : null;

  const matches = (r: ProductReview) => {
    if (!cleanId && !cleanSlug) return true;
    if (cleanId && (r.product_id === cleanId || r.product_slug === cleanId)) return true;
    if (cleanSlug && (r.product_slug === cleanSlug || r.product_id === cleanSlug)) return true;
    return false;
  };

  if (cachedReviews !== null) {
    return cachedReviews.filter(matches);
  }
  try {
    const raw = localStorage.getItem("gieomo_product_reviews");
    const list: ProductReview[] = raw ? JSON.parse(raw) : [];
    cachedReviews = list;
    return list.filter(matches);
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
    try {
      localStorage.setItem("gieomo_product_reviews", JSON.stringify(updated));
    } catch {
      // LocalStorage quota might be exceeded if large strings, ignore
    }
    window.dispatchEvent(new Event("gieomo_reviews_updated"));

    // Sync to Supabase DB
    fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(review),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.success && data.review) {
          // Update review with server data/ID if different
          if (data.review.review_id !== review.review_id) {
            const list = getStoredReviews();
            const remapped = list.map((r) =>
              r.review_id === review.review_id ? data.review : r
            );
            cachedReviews = remapped;
            try {
              localStorage.setItem("gieomo_product_reviews", JSON.stringify(remapped));
            } catch {}
            window.dispatchEvent(new Event("gieomo_reviews_updated"));
          }
        }
      })
      .catch((err) => {
        console.warn("Could not save review to server:", err);
      });
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
    try {
      localStorage.setItem("gieomo_product_reviews", JSON.stringify(updated));
    } catch {}
    window.dispatchEvent(new Event("gieomo_reviews_updated"));

    // Sync deletion to Supabase
    fetch(`/api/reviews?id=${encodeURIComponent(reviewId)}`, {
      method: "DELETE",
    }).catch((err) => {
      console.warn("Could not delete review on server:", err);
    });
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
    localStorage.setItem("gieomo_data_wiped_v5", "true");
    
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

    // Clear inventory logs (receipts & transfers)
    clearInventoryLogs();

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
    localStorage.removeItem("gieomo-cart");
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
    window.dispatchEvent(new Event("gieomo_inventory_logs_updated"));
    window.dispatchEvent(new Event("gieomo_cart_updated"));
  } catch (e) {
    console.error("Error clearing mock data", e);
  }
}

// Client-side purge removed to prevent wiping user products and catalog


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




