"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ProductCard } from "@/components/products/ProductCard";
import { MOCK_PRODUCTS, ExtendedProduct } from "@/lib/data/mockData";
import { getStoredProducts } from "@/lib/data/orderStore";
import { ArrowRight } from "lucide-react";

export function FeaturedProductsSection() {
  const [products, setProducts] = useState<ExtendedProduct[]>(() => {
    return MOCK_PRODUCTS.filter((p) => p.status === "active").slice(0, 4);
  });

  useEffect(() => {
    const update = () => {
      const all = getStoredProducts().filter((p) => p.status === "active");
      const feat = all.filter((p) => p.featured);
      setProducts(feat.length > 0 ? feat.slice(0, 4) : all.slice(0, 4));
    };
    update();
    window.addEventListener("gieomo_products_updated", update);
    return () => window.removeEventListener("gieomo_products_updated", update);
  }, []);

  return (
    <section className="py-16 sm:py-20 container mx-auto px-4 sm:px-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-10 text-center sm:text-left">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#BFE9C3]/50 text-[#1B3622] text-xs font-bold mb-2">
            <span>✨ Vật phẩm lưu niệm</span>
          </div>
          <h2 className="font-heading font-extrabold text-2xl sm:text-3xl text-[#231B16]">
            Sản phẩm handmade nổi bật
          </h2>
          <p className="text-xs sm:text-sm text-[#7E7068] mt-1">
            Từng đường kim mũi chỉ được hoàn thiện bởi tình nguyện viên Mầm Mơ.
          </p>
        </div>

        <Link
          href="/products"
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-[#2D6338] hover:text-[#1B3622] transition-colors group"
        >
          <span>Xem tất cả sản phẩm</span>
          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
        {products.map((product) => (
          <ProductCard key={product.product_id} product={product} />
        ))}
      </div>
    </section>
  );
}
