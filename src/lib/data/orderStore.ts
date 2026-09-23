"use client";

import type { Order, OrderStatus, PaymentStatus, PickupPoint, ContactMessage } from "@/types/database";
import { MOCK_ORDERS } from "./mockData";

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

export function getStoredOrders(): Order[] {
  if (typeof window === "undefined") return MOCK_ORDERS;
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
    return orders;
  } catch (e) {
    console.error("Error reading gieomo_orders from localStorage", e);
    return MOCK_ORDERS;
  }
}

export function saveNewOrder(newOrder: Order): void {
  if (typeof window === "undefined") return;
  try {
    const orders = getStoredOrders();
    const updated = [newOrder, ...orders.filter((o) => o.order_id !== newOrder.order_id && o.order_code !== newOrder.order_code)];
    localStorage.setItem("gieomo_orders", JSON.stringify(updated));

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
    } catch {
      // ignore
    }

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
    localStorage.setItem("gieomo_orders", JSON.stringify(updated));
    window.dispatchEvent(new Event("gieomo_orders_updated"));
  } catch (e) {
    console.error("Error updating order status", e);
  }
}

export function updateStoredPaymentStatus(orderCodeOrId: string, paymentStatus: PaymentStatus): void {
  if (typeof window === "undefined") return;
  try {
    const orders = getStoredOrders();
    const updated = orders.map((o) =>
      o.order_id === orderCodeOrId || o.order_code === orderCodeOrId
        ? {
            ...o,
            payment_status: paymentStatus,
          }
        : o
    );
    localStorage.setItem("gieomo_orders", JSON.stringify(updated));
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
    localStorage.setItem("gieomo_orders", JSON.stringify(updated));
    window.dispatchEvent(new Event("gieomo_orders_updated"));
  } catch (e) {
    console.error("Error updating order notes", e);
  }
}

export function getStoredPayments(): PaymentRecord[] {
  if (typeof window === "undefined") return SEED_PAYMENTS;
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

