"use client";

import type { Order, OrderStatus, PaymentStatus } from "@/types/database";
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
