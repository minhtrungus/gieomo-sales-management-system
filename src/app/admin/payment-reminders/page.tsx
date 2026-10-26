"use client";

import { useEffect, useState } from "react";
import { Mail, RefreshCw, X } from "lucide-react";

type ReminderOrder = {
  order_id: string; order_code: string; receiver_name: string; customer_email?: string | null;
  expected_amount: number; payment_status: string; order_status: string;
};

export default function PaymentRemindersPage() {
  const [orders, setOrders] = useState<ReminderOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ order: ReminderOrder; subject: string; html: string } | null>(null);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);

  async function loadOrders() {
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/admin/reconciliation?reconciliation_status=UNPAID&limit=200&offset=0", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || data.success !== true) throw new Error(data.error || "Không thể tải danh sách");
      setOrders((data.records || []).filter((order: ReminderOrder) => order.customer_email && order.payment_status === "pending"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể tải danh sách");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    let active = true;
    void fetch("/api/admin/reconciliation?reconciliation_status=UNPAID&limit=200&offset=0", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || data.success !== true) throw new Error(data.error || "Không thể tải danh sách");
        if (active) setOrders((data.records || []).filter((order: ReminderOrder) => order.customer_email && order.payment_status === "pending"));
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "Không thể tải danh sách");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function requestReminder(order: ReminderOrder, action: "preview" | "send") {
    if (busyOrderId) return;
    setBusyOrderId(order.order_id); setError(null); setMessage(null);
    try {
      const response = await fetch("/api/admin/payment-reminders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, orderId: order.order_id }),
      });
      const data = await response.json();
      if (!response.ok || data.success !== true) throw new Error(data.error || "Không thể xử lý lời nhắc");
      if (action === "preview") setPreview({ order, ...data.preview });
      else { setPreview(null); setMessage(data.message); await loadOrders(); }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể xử lý lời nhắc");
    } finally { setBusyOrderId(null); }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="font-heading text-2xl font-extrabold text-[#231B16]">Nhắc đơn chưa thanh toán</h1><p className="mt-1 text-xs text-[#7E7068]">Chỉ đơn banking thật sự UNPAID, có email và không có giao dịch chờ đối soát.</p></div>
        <button type="button" onClick={loadOrders} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-[#F0E5D8] bg-white px-3 py-2 text-xs font-bold"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Làm mới</button>
      </div>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs font-bold text-red-700">{error}</p>}
      {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-xs font-bold text-emerald-800">{message}</p>}
      <div className="space-y-2">
        {orders.map((order) => <article key={order.order_id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#F0E5D8] bg-white p-4">
          <div><p className="font-mono text-xs font-extrabold text-[#1B3622]">{order.order_code}</p><p className="text-sm font-bold text-[#231B16]">{order.receiver_name}</p><p className="text-xs text-gray-500">{Number(order.expected_amount).toLocaleString("vi-VN")}đ · {order.customer_email}</p></div>
          <button type="button" disabled={busyOrderId === order.order_id} onClick={() => requestReminder(order, "preview")} className="inline-flex items-center gap-2 rounded-xl bg-[#BFE9C3] px-3 py-2 text-xs font-extrabold text-[#16381D] disabled:opacity-50"><Mail className="h-4 w-4" /> Xem trước</button>
        </article>)}
      </div>
      {!loading && orders.length === 0 && <p className="rounded-2xl border border-[#F0E5D8] bg-white p-8 text-center text-sm text-gray-500">Không có đơn đủ điều kiện nhắc.</p>}
      {preview && <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/55 p-4" role="dialog" aria-modal="true"><section className="max-h-[92vh] w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl"><header className="flex items-center justify-between border-b p-4"><div><h2 className="font-bold">Xem trước email · {preview.order.order_code}</h2><p className="text-xs text-gray-500">{preview.subject}</p></div><button type="button" aria-label="Đóng" onClick={() => setPreview(null)}><X className="h-4 w-4" /></button></header>
        <iframe title={`Xem trước lời nhắc ${preview.order.order_code}`} srcDoc={preview.html} sandbox="" className="h-[58vh] w-full bg-[#FFF8EE]" />
        <footer className="flex justify-end gap-2 border-t p-4"><button type="button" onClick={() => setPreview(null)} className="rounded-xl px-4 py-2 text-xs font-bold text-gray-600">Đóng</button><button type="button" disabled={busyOrderId === preview.order.order_id} onClick={() => requestReminder(preview.order, "send")} className="rounded-xl bg-[#2D6338] px-4 py-2 text-xs font-extrabold text-white disabled:opacity-50">{busyOrderId ? "Đang xử lý..." : "Gửi lời nhắc"}</button></footer>
      </section></div>}
    </div>
  );
}
