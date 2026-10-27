"use client";

import { memo, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import { ProductLightbox } from "@/components/products/ProductLightbox";

interface ProductGalleryProps {
  productName: string;
  imageStatus?: string | null;
  images: string[];
  initialActiveImage?: string | null;
}

/** Keeps thumbnail/navigation updates inside the gallery instead of re-rendering the full product page. */
export const ProductGallery = memo(function ProductGallery({
  productName,
  imageStatus,
  images,
  initialActiveImage,
}: ProductGalleryProps) {
  const initialIndex = initialActiveImage ? images.indexOf(initialActiveImage) : 0;
  const [selectedImageIndex, setSelectedImageIndex] = useState(initialIndex >= 0 ? initialIndex : 0);
  const [customActiveImage, setCustomActiveImage] = useState(
    initialActiveImage && initialIndex < 0 ? initialActiveImage : null,
  );
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const activeGalleryImage = customActiveImage || images[selectedImageIndex] || images[0];

  function selectImage(index: number) {
    setSelectedImageIndex(index);
    setCustomActiveImage(null);
  }

  return (
    <div className="lg:col-span-6 space-y-4">
      {imageStatus !== "source" && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900">
          Ảnh sản phẩm thật chưa có trong bản sao cục bộ; hình bên dưới là trạng thái thay thế, không phải ảnh đã xác minh.
        </div>
      )}
      <div
        onClick={() => setIsLightboxOpen(true)}
        className="relative aspect-4/3 sm:aspect-square w-full rounded-2xl bg-[#FFF8EE] border border-[#F0E5D8] overflow-hidden flex items-center justify-center group/gallery select-none cursor-zoom-in"
        title="Nhấp để phóng to ảnh xem chi tiết các mẫu"
      >
        <div className="absolute inset-0 bg-gradient-to-tr from-amber-100/30 via-emerald-50/20 to-transparent pointer-events-none" />

        {activeGalleryImage && (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-2 transition-opacity duration-300 ease-out">
            <Image
              src={activeGalleryImage}
              alt={productName}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 580px"
              className="object-contain"
              quality={60}
              priority={selectedImageIndex === 0 && !customActiveImage}
            />
          </div>
        )}

        <div className="absolute top-3 right-3 z-30 px-2.5 py-1.5 rounded-full bg-black/60 hover:bg-black/80 text-white text-[11px] font-bold backdrop-blur-xs flex items-center gap-1.5 transition-all shadow-md">
          <Maximize2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Phóng to xem chi tiết</span>
        </div>

        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                selectImage(selectedImageIndex > 0 ? selectedImageIndex - 1 : images.length - 1);
              }}
              className="absolute left-3 top-1/2 z-30 -translate-y-1/2 rounded-full bg-white/90 p-2.5 text-[#342A24] opacity-0 shadow-soft backdrop-blur-xs transition-all duration-300 hover:bg-white active:scale-95 group-hover/gallery:opacity-100"
              aria-label="Ảnh trước"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                selectImage(selectedImageIndex < images.length - 1 ? selectedImageIndex + 1 : 0);
              }}
              className="absolute right-3 top-1/2 z-30 -translate-y-1/2 rounded-full bg-white/90 p-2.5 text-[#342A24] opacity-0 shadow-soft backdrop-blur-xs transition-all duration-300 hover:bg-white active:scale-95 group-hover/gallery:opacity-100"
              aria-label="Ảnh tiếp theo"
            >
              <ChevronRight className="h-4 w-4" />
            </button>

            <div className="absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5 backdrop-blur-xs">
              {images.map((_, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    selectImage(index);
                  }}
                  className={`h-1.5 cursor-pointer rounded-full transition-all duration-500 ${
                    selectedImageIndex === index && !customActiveImage ? "w-5 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80"
                  }`}
                  aria-label={`Chuyển đến ảnh ${index + 1}`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {images.length > 1 && (
        <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
          {images.map((image, index) => {
            const isActive = selectedImageIndex === index && !customActiveImage;
            return (
              <button
                key={image}
                type="button"
                onClick={() => selectImage(index)}
                aria-label={`Xem ảnh sản phẩm ${index + 1}`}
                aria-pressed={isActive}
                className={`relative h-20 w-20 shrink-0 cursor-pointer overflow-hidden rounded-2xl border-2 bg-[#FFF8EE] transition-all duration-300 ${
                  isActive
                    ? "scale-105 border-[#2D6338] shadow-soft ring-2 ring-[#2D6338]/20"
                    : "border-[#F0E5D8] opacity-60 hover:border-[#FFB98A] hover:opacity-100"
                }`}
              >
                <Image src={image} alt="" fill sizes="80px" quality={50} className="object-contain transition-transform duration-500 hover:scale-105" />
              </button>
            );
          })}
        </div>
      )}

      {isLightboxOpen && (
        <ProductLightbox
          productName={productName}
          images={images}
          activeIndex={selectedImageIndex}
          activeSrc={activeGalleryImage || images[0]}
          isVariantContext={Boolean(customActiveImage)}
          onNavigate={selectImage}
          onClose={() => setIsLightboxOpen(false)}
        />
      )}
    </div>
  );
});
