"use client";

import React, { useEffect, useState } from "react";
import { Download, Share2 } from "lucide-react";
import type { Order } from "@/types/database";
import { getThankYouCardData, renderThankYouCard, THANK_YOU_CARD } from "@/lib/utils/thankYouCard";

interface ThankYouStoryCardProps {
  order?: Order | null;
  /** Kept for caller compatibility; missing buyer_name is intentionally blank. */
  defaultCustomerName?: string;
  onDownloadStart?: () => void;
  onDownloadEnd?: () => void;
}

/** Compatibility export: template already contains the artwork and QR. */
export async function generateThankYouCardCanvas(
  customerName: string, orderDate: string,
  _items: Array<{ name: string; quantity: number }> = [], _qrDataUrl?: string
): Promise<HTMLCanvasElement | null> {
  void _items;
  void _qrDataUrl;
  return renderThankYouCard(customerName, orderDate);
}

export const ThankYouStoryCard = React.memo(function ThankYouStoryCard({
  order, onDownloadStart, onDownloadEnd,
}: ThankYouStoryCardProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ key: string; url: string } | null>(null);
  const { customerName, orderDate } = getThankYouCardData(order);
  const previewKey = JSON.stringify([customerName, orderDate]);

  useEffect(() => {
    let active = true;
    setError(null);
    renderThankYouCard(customerName, orderDate).then((canvas) => {
      if (active) setPreview({ key: previewKey, url: canvas.toDataURL("image/png") });
    }).catch(() => {
      if (active) setError("Chưa tải được thiệp hoặc font. Vui lòng thử lại.");
    });
    return () => { active = false; };
  }, [customerName, orderDate, previewKey]);

  async function download() {
    const canvas = await renderThankYouCard(customerName, orderDate);
    const link = document.createElement("a");
    link.download = `Thiep-Cam-On-Gieo-Mo${customerName ? "-" + customerName.replace(/\s+/g, "-") : ""}.png`;
    link.href = canvas.toDataURL("image/png"); link.click();
  }
  const handleDownloadCard = async () => {
    if (isGenerating || isSharing) return;
    setIsGenerating(true); setError(null);
    try { onDownloadStart?.(); await download(); }
    catch { setError("Không xuất được thiệp. Vui lòng thử lại."); }
    finally { setIsGenerating(false); onDownloadEnd?.(); }
  };
  const handleShareCard = async () => {
    if (isSharing || isGenerating) return;
    setIsSharing(true); setError(null);
    try {
      const canvas = await renderThankYouCard(customerName, orderDate);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) =>
        value ? resolve(value) : reject(new Error("PNG export failed")), "image/png"));
      const file = new File([blob], "Thiep-Cam-On-Gieo-Mo.png", { type: "image/png" });
      const data = { title: "Gieo Mơ", text: "Gom từng mảnh nhỏ, dệt thành yêu thương", url: "https://gieomo.store" };
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: data.title, text: data.text });
      else if (navigator.share) await navigator.share(data);
      else await download();
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) setError("Không chia sẻ được thiệp. Bạn có thể tải ảnh PNG.");
    } finally { setIsSharing(false); }
  };
  return (
    <div className="w-full max-w-lg mx-auto space-y-4">
      <div id="gieomo-thankyou-card" style={{ width: "100%", aspectRatio: "9 / 16" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={preview?.key === previewKey ? preview.url : THANK_YOU_CARD.template}
          alt={`Thiệp cảm ơn Gieo Mơ${customerName ? " - " + customerName : ""}${orderDate ? " - " + orderDate : ""}`}
          width={1080} height={1920} style={{ width: "100%", height: "auto", display: "block" }} />
      </div>
      {(!customerName || !orderDate) && <p className="text-xs text-gray-600" role="status">
        {!customerName && "Chưa có tên người đặt. "}{!orderDate && "Chưa có ngày đặt hàng hợp lệ. "}Thiệp giữ trống phần thiếu dữ liệu.
      </p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex justify-center gap-4 text-xs">
        <a href="https://gieomo.store" target="_blank" rel="noopener noreferrer">Gieomo.store</a>
        <a href="https://facebook.com/BanHangGieoMo" target="_blank" rel="noopener noreferrer">Tạp hóa Gieo Mơ</a>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
        <button type="button" onClick={handleDownloadCard} disabled={isGenerating || isSharing}
          className="w-full py-3 px-4 rounded-2xl bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer border border-[#9ed4a3] disabled:opacity-60">
          <Download className="w-4 h-4" /><span>{isGenerating ? "Đang xuất ảnh..." : "Tải thẻ thiệp cảm ơn (PNG)"}</span>
        </button>
        <button type="button" onClick={handleShareCard} disabled={isSharing || isGenerating}
          className="w-full py-3 px-4 rounded-2xl bg-[#1877F2] hover:bg-[#166fe5] text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60">
          <Share2 className="w-4 h-4" /><span>{isSharing ? "Đang chia sẻ..." : "Đăng Story / Chia sẻ"}</span>
        </button>
      </div>
    </div>
  );
});
