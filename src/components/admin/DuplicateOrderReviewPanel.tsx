"use client";

import { useState } from "react";

type Preview = {
  outcome?: string;
  keep_order_code?: string;
  duplicate_order_code?: string;
  amount_match?: boolean;
  keep_status?: string;
  duplicate_status?: string;
  duplicate_has_financial_or_shipping_evidence?: boolean;
  duplicate_updated_at?: string;
};

export function DuplicateOrderReviewPanel({ orderId, orderCode }: { orderId: string; orderCode: string }) {
  const [open, setOpen] = useState(false);
  const [keepOrderCode, setKeepOrderCode] = useState("");
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const request = async (mode: "preview" | "mark") => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/orders/duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          duplicateOrderId: orderId,
          keepOrderCode,
          reason,
          confirmation: mode === "mark" ? confirmation : undefined,
          expectedUpdatedAt: mode === "mark" ? preview?.duplicate_updated_at : undefined,
        }),
      });
      const body = await response.json();
      if (!response.ok || body.success !== true) {
        setError(body.error || `Không thể ${mode === "mark" ? "đánh dấu" : "so sánh"} đơn trùng.`);
        return;
      }
      if (mode === "preview") setPreview(body);
      else {
        setPreview(body);
        setConfirmation("");
      }
    } catch {
      setError("Lỗi kết nối; chưa có thay đổi nào được xác nhận.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-bold text-amber-800 underline underline-offset-2">Đánh dấu đơn trùng</button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
          <div className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-3xl bg-white p-5 text-left shadow-2xl">
            <div>
              <h2 className="font-heading text-lg font-extrabold text-amber-900">Đánh dấu đơn trùng</h2>
              <p className="text-xs text-gray-600">Đơn được đánh dấu trùng: <strong>{orderCode}</strong>. Không đơn nào bị xóa.</p>
            </div>
            <label className="block text-xs font-bold">Mã đơn giữ lại<input value={keepOrderCode} onChange={(event) => { setKeepOrderCode(event.target.value.toUpperCase()); setPreview(null); }} className="mt-1 w-full rounded-xl border p-2 text-sm" /></label>
            <label className="block text-xs font-bold">Lý do quyết định<textarea value={reason} onChange={(event) => { setReason(event.target.value); setPreview(null); }} className="mt-1 min-h-20 w-full rounded-xl border p-2 text-sm" /></label>
            <button type="button" disabled={busy || !keepOrderCode.trim() || !reason.trim()} onClick={() => void request("preview")} className="rounded-xl bg-amber-100 px-4 py-2 text-xs font-bold text-amber-900 disabled:opacity-40">So sánh hai đơn</button>
            {preview ? (
              <div className="space-y-1 rounded-xl border bg-gray-50 p-3 text-xs">
                <p>Giữ: <strong>{preview.keep_order_code}</strong> ({preview.keep_status})</p>
                <p>Đánh dấu trùng: <strong>{preview.duplicate_order_code || orderCode}</strong> ({preview.duplicate_status})</p>
                <p>Số tiền khớp: {preview.amount_match ? "Có" : "Không"}</p>
                <p>Có payment/shipment evidence: {preview.duplicate_has_financial_or_shipping_evidence ? "Có — tuyệt đối không xóa vật lý" : "Không"}</p>
                {preview.outcome === "review" ? <><input value={confirmation} onChange={(event) => setConfirmation(event.target.value.toUpperCase())} placeholder="Nhập TRUNG" className="mt-2 w-full rounded-xl border p-2" /><button type="button" disabled={busy || confirmation !== "TRUNG"} onClick={() => void request("mark")} className="mt-2 rounded-xl bg-amber-700 px-4 py-2 font-bold text-white disabled:opacity-40">Ghi nhận quyết định, không xóa</button></> : null}
              </div>
            ) : null}
            {error ? <p role="alert" className="text-xs font-bold text-red-700">{error}</p> : null}
            <button type="button" disabled={busy} onClick={() => setOpen(false)} className="text-xs font-bold text-gray-600">Đóng</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
