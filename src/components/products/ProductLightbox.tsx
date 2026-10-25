"use client";

import { memo, useEffect, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, X } from "lucide-react";

interface ProductLightboxProps {
  productName: string;
  images: string[];
  activeIndex: number;
  activeSrc: string;
  isVariantContext: boolean;
  onNavigate: (index: number) => void;
  onClose: () => void;
}

/**
 * Full-screen product image lightbox (tách khỏi ProductDetailClient, batch INP-LIGHTBOX):
 * - Zoom state sống bên trong component → mỗi lần zoom/close không re-render trang
 *   sản phẩm (variant grid, specs, reviews).
 * - sizes khớp hộp hiển thị max-w-5xl (≤1024px) thay vì 100vw → không yêu cầu
 *   variant ảnh quá lớn khi decode.
 * - Keyboard/ESC/thumbnail/arrow behavior giữ nguyên so với bản inline cũ.
 */
function ProductLightboxImpl({
  productName,
  images,
  activeIndex,
  activeSrc,
  isVariantContext,
  onNavigate,
  onClose,
}: ProductLightboxProps) {
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft") {
        onNavigate(activeIndex > 0 ? activeIndex - 1 : images.length - 1);
      } else if (e.key === "ArrowRight") {
        onNavigate(activeIndex < images.length - 1 ? activeIndex + 1 : 0);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, onNavigate, activeIndex, images.length]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col justify-between p-3 sm:p-6 animate-fade-in select-none"
      onClick={onClose}
    >
      {/* Lightbox Top Header */}
      <div
        className="flex items-center justify-between z-10 w-full max-w-5xl mx-auto text-white/90"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="font-heading font-extrabold text-sm sm:text-base text-white">
            {productName}
          </span>
          <span className="px-2.5 py-0.5 rounded-full bg-white/20 text-white font-mono text-xs font-bold">
            {activeIndex + 1} / {images.length}
          </span>
        </div>

        {/* Zoom & Close Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => setZoom((prev) => Math.max(1, prev - 0.5))}
            disabled={zoom <= 1}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/25 text-white disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
            title="Thu nhỏ"
            aria-label="Thu nhỏ ảnh"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/25 text-white text-xs font-bold transition-all cursor-pointer"
            title="Kích thước ban đầu"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            onClick={() => setZoom((prev) => Math.min(3, prev + 0.5))}
            disabled={zoom >= 3}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/25 text-white disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
            title="Phóng to"
            aria-label="Phóng to ảnh"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-white/20 hover:bg-red-500 text-white transition-all ml-2 cursor-pointer"
            title="Đóng (ESC)"
            aria-label="Đóng cửa sổ phóng to"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Lightbox Main Active Image */}
      <div
        className="relative flex-1 w-full max-w-5xl mx-auto flex items-center justify-center overflow-hidden my-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="relative w-full h-full flex items-center justify-center transition-transform duration-200 ease-out"
          style={{ transform: `scale(${zoom})` }}
        >
          <Image
            src={activeSrc}
            alt={`${productName} - Phóng to`}
            fill
            sizes="min(100vw, 64rem)"
            className="object-contain"
            priority
          />
        </div>

        {/* Prev / Next Arrows */}
        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onNavigate(activeIndex > 0 ? activeIndex - 1 : images.length - 1);
              }}
              className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full bg-black/60 hover:bg-black/90 text-white border border-white/20 shadow-lg transition-all active:scale-90 cursor-pointer"
              aria-label="Ảnh trước"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onNavigate(activeIndex < images.length - 1 ? activeIndex + 1 : 0);
              }}
              className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full bg-black/60 hover:bg-black/90 text-white border border-white/20 shadow-lg transition-all active:scale-90 cursor-pointer"
              aria-label="Ảnh tiếp theo"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </>
        )}
      </div>

      {/* Lightbox Bottom Thumbnail Strip */}
      {images.length > 1 && (
        <div
          className="z-10 w-full max-w-2xl mx-auto flex items-center justify-center gap-2 overflow-x-auto py-2 scrollbar-none"
          onClick={(e) => e.stopPropagation()}
        >
          {images.map((img, idx) => {
            const isActive = activeIndex === idx && !isVariantContext;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => onNavigate(idx)}
                className={`relative w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden border-2 shrink-0 transition-all cursor-pointer bg-white/5 ${
                  isActive
                    ? "border-emerald-400 ring-2 ring-emerald-400/50 scale-105"
                    : "border-white/30 opacity-60 hover:opacity-100 hover:border-white"
                }`}
              >
                <Image src={img} alt="" fill sizes="64px" className="object-contain" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export const ProductLightbox = memo(ProductLightboxImpl);
