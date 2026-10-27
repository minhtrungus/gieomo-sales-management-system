"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import type { DeliveryStatus, OrderStatus, PaymentStatus } from "@/types/database";

export function ControlledOrderDeletePanel(props: {
  orderId: string;
  orderCode: string;
  finalAmount: number;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  deliveryStatus: DeliveryStatus;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const archiveOrder = async () => {
    const trimmedReason = reason.trim();
    if (!trimmedReason || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/orders/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "archive", orderId: props.orderId, reason: trimmedReason }),
      });
      const body = await response.json() as { success?: boolean; error?: string };
      if (!response.ok || !body.success) {
        setError(body.error || "Không thể xóa đơn hàng");
        return;
      }
      router.replace("/admin/orders");
      router.refresh();
    } catch {
      setError("Không nhận được phản hồi từ máy chủ; đơn hàng chưa được xác nhận là đã xóa.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="text-right">
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-bold text-red-700 underline underline-offset-2 hover:text-red-900">
        Xóa đơn hàng
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 text-left">
          <div role="dialog" aria-modal="true" aria-labelledby="delete-order-title" className="w-full max-w-md space-y-4 rounded-3xl bg-white p-6 shadow-2xl">
            <div>
              <h2 id="delete-order-title" className="font-heading text-lg font-extrabold text-red-900">Xóa đơn hàng {props.orderCode}</h2>
              <p className="mt-1 text-sm text-gray-700">Mã đơn <strong>{props.orderCode}</strong> · <MoneyDisplay amount={props.finalAmount} /></p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-950">
              Đơn sẽ biến mất khỏi danh sách đang hoạt động và thao tác này không thể hoàn tác trên giao diện.
              Sổ thanh toán, mã giao dịch ngân hàng/provider, lịch sử kho và nhật ký kiểm toán vẫn được giữ nguyên.
              Nếu tiền đã được nhận, thao tác này không tự hoàn tiền.
            </div>
            <p className="text-xs text-gray-600">Đơn: {props.orderStatus} · Thanh toán: {props.paymentStatus} · Giao hàng: {props.deliveryStatus}</p>
            <label htmlFor="delete-order-reason" className="block text-sm font-bold text-gray-800">Lý do xóa <span className="text-red-600">*</span></label>
            <textarea
              id="delete-order-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
              placeholder="Nhập lý do ngắn gọn"
              className="min-h-24 w-full rounded-xl border border-gray-300 p-3 text-sm focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100"
            />
            {error ? <p role="alert" className="text-xs font-bold text-red-700">{error}</p> : null}
            <div className="flex justify-end gap-3">
              <button type="button" disabled={busy} onClick={() => setOpen(false)} className="rounded-xl border px-4 py-2 text-sm font-bold text-gray-700 disabled:opacity-50">Đóng</button>
              <button type="button" disabled={busy || !reason.trim()} onClick={archiveOrder} className="rounded-xl bg-red-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">
                {busy ? "Đang xóa..." : "Xác nhận xóa đơn"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
