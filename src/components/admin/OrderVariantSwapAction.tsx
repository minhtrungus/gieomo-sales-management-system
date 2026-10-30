"use client";

import { useState } from "react";
import { syncProductsFromServer } from "@/lib/data/orderStore";
import type { DeliveryStatus, OrderItem, OrderStatus, ProductVariant } from "@/types/database";

type AppliedSwap = {
  orderItemId: string;
  variantId: string;
  variantName: string;
  sku: string | null;
};

const EDITABLE_ORDER_STATUSES: OrderStatus[] = ["pending", "confirmed", "processing"];

export function canShowVariantSwap(orderStatus: OrderStatus, deliveryStatus: DeliveryStatus, item: OrderItem) {
  return EDITABLE_ORDER_STATUSES.includes(orderStatus) && deliveryStatus === "not_ready" && Boolean(item.variant_id);
}

export function OrderVariantSwapAction({
  orderId,
  orderCode,
  orderStatus,
  deliveryStatus,
  item,
  onApplied,
}: {
  orderId: string;
  orderCode: string;
  orderStatus: OrderStatus;
  deliveryStatus: DeliveryStatus;
  item: OrderItem;
  onApplied: (change: AppliedSwap) => void;
}) {
  const [open, setOpen] = useState(false);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!item.variant_id) {
    return <p className="mt-1 text-[11px] font-medium text-gray-500">Dòng hàng cũ không có mã variant nên không thể đổi mẫu an toàn.</p>;
  }
  if (item.combo_id) {
    return <p className="mt-1 text-[11px] font-medium text-amber-700">Dòng combo chưa hỗ trợ thay đổi mẫu riêng lẻ.</p>;
  }
  if (!canShowVariantSwap(orderStatus, deliveryStatus, item)) {
    return <p className="mt-1 text-[11px] font-medium text-amber-700">Không thể đổi mẫu: chỉ áp dụng khi đơn đang chờ/xác nhận/xử lý và chưa đóng gói.</p>;
  }

  const loadCandidates = async () => {
    setBusy(true);
    setError(null);
    try {
      const products = await syncProductsFromServer(true);
      const product = products.find((entry) =>
        entry.product_id === item.product_id || entry.variants?.some((variant) => variant.variant_id === item.variant_id),
      );
      const candidates = (product?.variants || []).filter(
        (variant) => variant.status === "active" && variant.variant_id !== item.variant_id,
      );
      setVariants(candidates);
      setSelectedId(candidates[0]?.variant_id || "");
      if (!candidates.length) setError("Không có mẫu cùng sản phẩm đang hoạt động để thay thế.");
      setOpen(true);
    } catch {
      setError("Không tải được danh sách mẫu từ máy chủ.");
      setOpen(true);
    } finally {
      setBusy(false);
    }
  };

  const selected = variants.find((variant) => variant.variant_id === selectedId);
  const enoughStock = Boolean(selected && selected.stock >= item.quantity);

  const submit = async () => {
    if (busy || !selected || !reason.trim() || confirmation !== "DOI-MAU" || !enoughStock) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/orders/swap-variant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          orderItemId: item.order_item_id,
          currentVariantId: item.variant_id,
          newVariantId: selected.variant_id,
          quantity: item.quantity,
          reason: reason.trim(),
        }),
      });
      const body = await response.json();
      if (!response.ok || body.success !== true) {
        setError(body.error || "Không thể thay đổi mẫu.");
        return;
      }
      onApplied({
        orderItemId: item.order_item_id,
        variantId: selected.variant_id,
        variantName: selected.name,
        sku: selected.sku,
      });
      setOpen(false);
      setReason("");
      setConfirmation("");
    } catch {
      setError("Lỗi kết nối; chưa có thay đổi nào được xác nhận.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void loadCandidates()}
        disabled={busy}
        className="mt-1 inline-flex min-h-9 items-center rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
      >
        {busy && !open ? "Đang tải..." : "Thay đổi mẫu"}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="variant-swap-title">
          <div className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl">
            <div>
              <h2 id="variant-swap-title" className="font-heading text-lg font-extrabold text-emerald-950">Thay đổi mẫu giao hàng</h2>
              <p className="text-xs text-gray-600">Đơn {orderCode}. Giá, số lượng và tổng tiền không thay đổi.</p>
            </div>
            <div className="rounded-2xl border bg-gray-50 p-3 text-xs">
              <p><strong>Mẫu hiện tại:</strong> {item.variant_name_snapshot || item.variant_name || "Không rõ"}</p>
              <p><strong>Số lượng cả dòng:</strong> {item.quantity}</p>
              <p><strong>Kho:</strong> hoàn mẫu cũ và giữ mẫu mới trong cùng transaction.</p>
            </div>
            <label className="block text-xs font-bold text-gray-700">
              Mẫu mới
              <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className="mt-1 w-full rounded-xl border p-2 text-sm">
                {variants.map((variant) => <option key={variant.variant_id} value={variant.variant_id}>{variant.name} · tồn {variant.stock}</option>)}
              </select>
            </label>
            {selected && !enoughStock ? <p className="text-xs font-bold text-red-700">Không đủ tồn kho cho {item.quantity} sản phẩm.</p> : null}
            <label className="block text-xs font-bold text-gray-700">
              Lý do thay đổi mẫu
              <textarea value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} className="mt-1 min-h-20 w-full rounded-xl border p-2 text-sm" />
            </label>
            <label className="block text-xs font-bold text-gray-700">
              Nhập DOI-MAU để xác nhận
              <input value={confirmation} onChange={(event) => setConfirmation(event.target.value.toUpperCase())} className="mt-1 w-full rounded-xl border p-2 text-sm" />
            </label>
            {error ? <p role="alert" className="text-xs font-bold text-red-700">{error}</p> : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" disabled={busy} onClick={() => setOpen(false)} className="min-h-10 rounded-xl border px-4 text-xs font-bold">Đóng</button>
              <button type="button" disabled={busy || !selected || !enoughStock || !reason.trim() || confirmation !== "DOI-MAU"} onClick={() => void submit()} className="min-h-10 rounded-xl bg-emerald-700 px-4 text-xs font-bold text-white disabled:opacity-40">
                {busy ? "Đang xử lý..." : "Xác nhận thay đổi mẫu"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
