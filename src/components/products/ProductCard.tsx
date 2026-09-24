"use client";

import Link from "next/link";
import Image from "next/image";
import type { ExtendedProduct } from "@/lib/data/mockData";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { Badge } from "@/components/ui/Badge";
import { useCartStore } from "@/store/cart";
import { Toast } from "@/components/ui/Toast";
import { useState, memo } from "react";
import { Plus } from "lucide-react";

interface ProductCardProps {
  product: ExtendedProduct;
}

export const ProductCard = memo(function ProductCard({ product }: ProductCardProps) {
  const addItem = useCartStore((state) => state.addItem);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const defaultVariant = product.variants?.[0];
  const stockCount = defaultVariant ? defaultVariant.stock : 10;
  const isOutOfStock = stockCount <= 0;

  const handleQuickAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isOutOfStock) return;

    addItem({
      product_id: product.product_id,
      variant_id: defaultVariant?.variant_id ?? null,
      combo_id: null,
      product_name: product.name,
      variant_name: defaultVariant?.name ?? null,
      price: product.price,
      quantity: 1,
      stock: stockCount,
      image_url: product.images?.[0] ?? null,
    });

    setToastMessage(`Đã thêm "${product.name}" vào giỏ hàng!`);
  };

  return (
    <div className="group relative flex flex-col bg-white rounded-3xl border border-[#F0E5D8] overflow-hidden shadow-soft hover:shadow-card-hover transition-transform duration-200 hover:-translate-y-0.5 will-change-transform">
      {/* Stretched Link covering the whole card for instant, clean navigation with prefetch */}
      <Link
        href={`/products/${product.slug}`}
        prefetch={true}
        className="absolute inset-0 z-10"
        aria-label={`Xem chi tiết ${product.name}`}
      />

      {/* Image Box */}
      <div className="relative aspect-4/3 w-full bg-[#FFF8EE] overflow-hidden flex items-center justify-center">
        {product.images?.[0] ? (
          <Image
            src={product.images[0]}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-[#7E7068]">
            <span className="text-4xl">🌱</span>
            <span className="text-xs font-medium">Mầm Mơ Handmade</span>
          </div>
        )}

        {/* Badge Tag */}
        {product.badge_label && (
          <div className="absolute top-3 left-3 z-20 pointer-events-none">
            <Badge variant={product.badge === "best_seller" ? "accent" : "brand"}>
              {product.badge_label}
            </Badge>
          </div>
        )}

        {/* Discount tag if any */}
        {product.compare_at_price && product.compare_at_price > product.price && (
          <div className="absolute top-3 right-3 z-20 pointer-events-none bg-[#FFB98A] text-[#4A2603] text-[11px] font-extrabold px-2.5 py-0.5 rounded-full shadow-xs border border-white">
            -{Math.round(((product.compare_at_price - product.price) / product.compare_at_price) * 100)}%
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 sm:p-5 flex-1 flex flex-col justify-between space-y-2 sm:space-y-3">
        <div className="space-y-1.5">
          {product.category && (
            <span className="text-[10px] font-bold text-[#2D6338] uppercase tracking-wider block">
              {product.category.name}
            </span>
          )}
          <h3 className="font-heading font-bold text-[#342A24] text-sm sm:text-base line-clamp-1 group-hover:text-[#2D6338] transition-colors">
            {product.name}
          </h3>
          <p className="text-[11px] sm:text-xs text-[#7E7068] line-clamp-2 leading-relaxed hidden sm:block">
            {product.short_description}
          </p>
        </div>

        {/* Price & CTA */}
        <div className="pt-3 border-t border-[#F0E5D8] flex items-center justify-between">
          <div>
            <MoneyDisplay amount={product.price} className="text-sm sm:text-base font-extrabold text-[#1B3622]" />
            {product.compare_at_price && (
              <div className="text-[11px] text-[#A89B92] line-through">
                <MoneyDisplay amount={product.compare_at_price} />
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleQuickAdd}
            disabled={isOutOfStock}
            className={`relative z-20 p-2.5 rounded-2xl transition-[transform,background-color,border-color] shadow-xs flex items-center justify-center border ${
              isOutOfStock
                ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                : "bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#1B3622] border-[#9ed4a3] font-bold active:scale-95 shadow-xs"
            }`}
            title={isOutOfStock ? "Hết hàng" : "Thêm vào giỏ"}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 animate-slide-up pointer-events-auto">
          <Toast
            type="success"
            message={toastMessage}
            onClose={() => setToastMessage(null)}
          />
        </div>
      )}
    </div>
  );
});

