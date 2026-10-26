"use client";

import { useState } from "react";
import { Printer } from "lucide-react";
import type { Order } from "@/types/database";
import { ThankYouStoryCard } from "@/components/order/ThankYouStoryCard";
import { getThankYouCardData, renderThankYouCard } from "@/lib/utils/thankYouCard";

/**
 * H51 (REIMPLEMENT): admin-side thank-you card view for any single order.
 *
 * Reuses the exact customer-facing ThankYouStoryCard rendering (same
 * template, fonts, layout and download/share actions) and adds a print
 * action that opens a print-only window with the rendered PNG. No API,
 * schema or permission change: the admin order-detail page is already
 * admin-gated, and the card is derived purely from order data
 * (buyer_name + created_at).
 */
export function AdminOrderThankYouCard({ order }: { order: Order | null }) {
  const [isPrinting, setIsPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { customerName, orderDate } = getThankYouCardData(order ?? undefined);

  async function printCard() {
    if (isPrinting) return;
    // window.open must run in the same task as the click, otherwise popup
    // blockers silently swallow the print window.
    const printWindow = window.open("", "_blank", "width=480,height=854");
    if (!printWindow) {
      setError("Trình duyệt đã chặn cửa sổ in. Hãy cho phép popup rồi thử lại.");
      return;
    }
    setIsPrinting(true);
    setError(null);
    try {
      const canvas = await renderThankYouCard(customerName, orderDate);
      const url = canvas.toDataURL("image/png");
      printWindow.document.write(
        `<!doctype html><html lang="vi"><head><title>Thẻ cảm ơn Gieo Mơ</title></head>` +
          `<body style="margin:0;background:#ffffff"><img src="${url}" alt="Thẻ cảm ơn Gieo Mơ" ` +
          `style="display:block;width:100%" onload="window.focus();window.print()" /></body></html>`,
      );
      printWindow.document.close();
    } catch {
      setError("Không tạo được thẻ để in. Vui lòng thử lại.");
      printWindow.close();
    } finally {
      setIsPrinting(false);
    }
  }

  if (!order) return null;

  return (
    <section
      className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-2xs space-y-4"
      aria-label="Thẻ cảm ơn đơn hàng"
    >
      <h3 className="font-heading font-bold text-base text-emerald-950 border-b border-gray-100 pb-3">
        Thẻ cảm ơn đơn hàng
      </h3>
      <ThankYouStoryCard order={order} />
      {error ? (
        <p className="text-xs font-bold text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={printCard}
        disabled={isPrinting}
        className="w-full py-2.5 px-4 rounded-2xl bg-soft-green hover:bg-emerald-300 text-emerald-950 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <Printer className="w-4 h-4" />
        <span>{isPrinting ? "Đang chuẩn bị thẻ..." : "In thẻ cảm ơn"}</span>
      </button>
      <p className="text-xs text-gray-500">
        Dùng được cho mọi đơn hàng — thẻ đúng mẫu khách nhận sau khi đặt hàng (kể cả khi thiếu tên/ngày, thẻ vẫn in với
        phần thiếu để trống).
      </p>
    </section>
  );
}
