"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import type { DeliveryStatus, OrderStatus, PaymentStatus } from "@/types/database";

type PreviewResult = {
  outcome?: string;
  eligible?: boolean;
  order_code?: string;
  order_status?: string;
  payment_status?: string;
  delivery_status?: string;
  final_amount?: number;
  updated_at?: string;
  blockers?: string[];
  relations?: Record<string, number>;
};

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
  const [confirmation, setConfirmation] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const looksLikeDraft = props.orderStatus === "pending" && props.paymentStatus === "pending" && props.deliveryStatus === "not_ready";
  const blockerLabels: Record<string, string> = {
    order_not_draft: "Đơn không còn ở trạng thái chờ ban đầu",
    payment_state_not_pending: "Trạng thái thanh toán đã phát sinh xử lý",
    payment_evidence_present: "Có bản ghi thanh toán cần giữ lại",
    payment_event_present: "Có sự kiện thanh toán cần đối soát",
    shipment_present: "Đã có hồ sơ giao hàng",
    delivery_started: "Quá trình giao hàng đã bắt đầu",
    business_history_present: "Đơn đã có lịch sử nghiệp vụ",
    inventory_effect_present: "Đơn đã tác động tồn kho",
    idempotency_claim_present: "Đơn có khóa chống tạo trùng cần giữ lại",
    lifecycle_effect_present: "Đơn đã có tác động voucher hoặc vòng đời",
  };

  const request = async (mode: "preview" | "delete") => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/orders/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          orderId: props.orderId,
          reason,
          confirmation: mode === "delete" ? confirmation : undefined,
          expectedUpdatedAt: mode === "delete" ? preview?.updated_at : undefined,
        }),
      });
      const body = await response.json() as {
        success?: boolean;
        error?: string;
        results?: PreviewResult[];
      };
      const result = body.results?.[0] || null;
      if (mode === "preview") {
        setPreview(result);
      }
      if (!response.ok || !body.success) {
        setError(body.error || (result?.blockers?.length ? `Bị chặn: ${result.blockers.join(", ")}` : "Không đủ điều kiện xóa"));
        return;
      }
      if (mode === "delete") {
        router.replace("/admin/orders");
        router.refresh();
      }
    } catch {
      setError("Không nhận được phản hồi từ máy chủ; chưa có đơn nào được xác nhận là đã xóa.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-bold text-red-700 hover:text-red-900 underline underline-offset-2"
      >
        {looksLikeDraft ? "Xóa đơn test/nháp" : "Xem lý do không thể xóa"}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 text-left">
          <div className="w-full max-w-lg space-y-4 rounded-3xl bg-white p-6 shadow-2xl">
            <div>
              <h2 className="font-heading text-lg font-extrabold text-red-900">Preview xóa đơn {props.orderCode}</h2>
              <p className="text-xs text-gray-600">Mã đơn: <strong>{props.orderCode}</strong> · Giá trị: <MoneyDisplay amount={props.finalAmount} /></p>
              <p className="text-xs text-gray-600">Đơn: {props.orderStatus} · Thanh toán: {props.paymentStatus} · Giao hàng: {props.deliveryStatus}</p>
            </div>
            <p className="text-xs text-gray-600">Chỉ xóa vật lý bản nháp/test chưa có payment, shipment, tồn kho, voucher hay lịch sử nghiệp vụ. Khóa idempotency của chính đơn sẽ được dọn sạch cùng đơn khi xóa.</p>
            <textarea value={reason} onChange={(event) => { setReason(event.target.value); setPreview(null); }} placeholder="Lý do xóa" className="min-h-20 w-full rounded-xl border p-2 text-sm" />
            <button type="button" disabled={busy} onClick={() => request("preview")} className="rounded-xl bg-amber-100 px-4 py-2 text-xs font-bold text-amber-900 disabled:opacity-50">
              {busy ? "Đang kiểm tra..." : "Chạy preview — không thay đổi dữ liệu"}
            </button>
            {preview ? (
              <div className="rounded-xl border bg-gray-50 p-3 text-xs">
                <p className="font-bold">Kết quả: {preview.outcome}</p>
                {preview.blockers?.length ? <ul className="mt-1 list-disc pl-4">{preview.blockers.map((blocker) => <li key={blocker}>{blockerLabels[blocker] || blocker}</li>)}</ul> : null}
                {preview.relations ? <p>Quan hệ: {Object.entries(preview.relations).map(([key, value]) => `${key}=${value}`).join(", ")}</p> : null}
              </div>
            ) : null}
            {preview?.eligible ? (
              <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-3">
                <p className="text-xs font-bold text-red-900">Gõ XOA để xác nhận xóa vật lý. Trạng thái sẽ được kiểm tra lại trong transaction.</p>
                <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="XOA" className="w-full rounded-xl border p-2 text-sm" />
                <button type="button" disabled={busy || confirmation !== "XOA"} onClick={() => request("delete")} className="rounded-xl bg-red-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">
                  Xóa đơn đã preview
                </button>
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
