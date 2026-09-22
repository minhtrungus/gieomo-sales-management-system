"use client";

import Link from "next/link";
import Image from "next/image";
import type { ExtendedProduct } from "@/lib/data/mockData";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { Badge } from "@/components/ui/Badge";
import { useCartStore } from "@/store/cart";
import { Toast } from "@/components/ui/Toast";
import { useState } from "react";

interface ProductCardProps {
  product: ExtendedProduct;
}

export function ProductCard({ product }: ProductCardProps) {
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
    <>
      <Link
        href={`/products/${product.slug}`}
        className="group relative flex flex-col bg-white rounded-2xl border border-emerald-100/80 overflow-hidden shadow-xs hover:shadow-md transition-all duration-300 hover:-translate-y-1"
      >
        {/* Image Box */}
        <div className="relative aspect-4/3 w-full bg-cream overflow-hidden flex items-center justify-center">
          {product.images?.[0] ? (
            <Image
              src={product.images[0]}
              alt={product.name}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="flex flex-col items-center gap-1 text-emerald-700/60">
              <span className="text-4xl">🌱</span>
              <span className="text-xs font-medium">Mầm Mơ Handmade</span>
            </div>
          )}

          {/* Badge Tag */}
          {product.badge_label && (
            <div className="absolute top-3 left-3 z-10">
              <Badge variant={product.badge === "best_seller" ? "warning" : "success"}>
                {product.badge_label}
              </Badge>
            </div>
          )}

          {/* Discount tag if any */}
          {product.compare_at_price && product.compare_at_price > product.price && (
            <div className="absolute top-3 right-3 z-10 bg-red-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full shadow-xs">
              -{Math.round(((product.compare_at_price - product.price) / product.compare_at_price) * 100)}%
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
          <div className="space-y-1">
            {product.category && (
              <span className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider">
                {product.category.name}
              </span>
            )}
            <h3 className="font-heading font-bold text-gray-900 text-base line-clamp-1 group-hover:text-emerald-800 transition-colors">
              {product.name}
            </h3>
            <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">
              {product.short_description}
            </p>
          </div>

          {/* Price & CTA */}
          <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
            <div>
              <MoneyDisplay amount={product.price} className="text-base font-extrabold text-emerald-950" />
              {product.compare_at_price && (
                <div className="text-xs text-gray-400 line-through">
                  <MoneyDisplay amount={product.compare_at_price} />
                </div>
              )}
            </div>

            <button
              onClick={handleQuickAdd}
              disabled={isOutOfStock}
              className={`p-2.5 rounded-xl transition-all shadow-xs flex items-center justify-center ${
                isOutOfStock
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-soft-green hover:bg-emerald-300 text-emerald-950 font-bold active:scale-95"
              }`}
              title={isOutOfStock ? "Hết hàng" : "Thêm vào giỏ"}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        </div>
      </Link>

      {/* Toast Notification */}
      {toastMessage && (
        <Toast
          type="success"
          message={toastMessage}
          onClose={() => setToastMessage(null)}
        />
      )}
    </>
  );
}
