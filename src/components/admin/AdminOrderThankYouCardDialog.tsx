"use client";

import { useEffect, useState } from "react";
import { Printer, X } from "lucide-react";
import type { Order } from "@/types/database";
import { ThankYouStoryCard } from "@/components/order/ThankYouStoryCard";
import { getThankYouCardData, renderThankYouCard } from "@/lib/utils/thankYouCard";

interface AdminOrderThankYouCardDialogProps {
  order: Order;
  onClose: () => void;
}

export function AdminOrderThankYouCardDialog({ order, onClose }: AdminOrderThankYouCardDialogProps) {
  const [isPrinting, setIsPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function printCard() {
    if (isPrinting) return;
    const printWindow = window.open("", "_blank", "width=480,height=854");
    if (!printWindow) {
      setPrintError("Trình duyệt đã chặn cửa sổ in. Hãy cho phép popup rồi thử lại.");
      return;
    }

    setIsPrinting(true);
    setPrintError(null);
    try {
      const { customerName, orderDate } = getThankYouCardData(order);
      const canvas = await renderThankYouCard(customerName, orderDate);
      const imageUrl = canvas.toDataURL("image/png");
      printWindow.document.write(
        `<!doctype html><html lang="vi"><head><title>Thiệp cảm ơn ${order.order_code}</title>` +
          `<style>@page{size:auto;margin:0}html,body{margin:0;background:#fff}img{display:block;width:100%;height:auto}</style>` +
          `</head><body><img src="${imageUrl}" alt="Thiệp cảm ơn Gieo Mơ" onload="window.focus();window.print()"></body></html>`,
      );
      printWindow.document.close();
    } catch {
      printWindow.close();
      setPrintError("Không tạo được thiệp để in. Vui lòng thử lại.");
    } finally {
      setIsPrinting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center bg-black/55 p-3 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-thank-you-card-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="flex max-h-[94vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-[#F0E5D8] bg-[#FFF8EE] shadow-2xl">
        <header className="flex items-center justify-between border-b border-[#F0E5D8] bg-white px-4 py-3">
          <div>
            <h2 id="admin-thank-you-card-title" className="font-heading text-sm font-extrabold text-[#1B3622]">
              Thiệp cảm ơn · {order.order_code}
            </h2>
            <p className="text-[11px] text-[#7E7068]">Xem trước trước khi in; không thay đổi trạng thái đơn.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng xem trước thiệp" className="rounded-full p-2 text-gray-500 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="overflow-y-auto p-4">
          <ThankYouStoryCard order={order} />
        </div>

        <footer className="space-y-2 border-t border-[#F0E5D8] bg-white p-4">
          {printError && <p role="alert" className="text-xs font-bold text-red-700">{printError}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100">
              Đóng
            </button>
            <button type="button" onClick={printCard} disabled={isPrinting} className="inline-flex items-center gap-2 rounded-xl bg-[#2D6338] px-4 py-2 text-xs font-extrabold text-white disabled:opacity-60">
              <Printer className="h-4 w-4" />
              {isPrinting ? "Đang chuẩn bị..." : "In thiệp này"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
