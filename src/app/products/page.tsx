"use client";

import { useState, useEffect, useMemo } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ProductCard } from "@/components/products/ProductCard";
import type { ExtendedProduct } from "@/lib/data/mockData";
import { getStoredProducts } from "@/lib/data/orderStore";
import { EmptyState } from "@/components/ui/States";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { Search, Sparkles } from "lucide-react";

export default function ProductsPage() {
  const [products, setProducts] = useState<ExtendedProduct[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("featured");

  useEffect(() => {
    setProducts(getStoredProducts());
    const handleUpdate = () => setProducts(getStoredProducts());
    window.addEventListener("gieomo_products_updated", handleUpdate);
    return () => {
      window.removeEventListener("gieomo_products_updated", handleUpdate);
    };
  }, []);

  const debouncedSearch = useDebounce(searchQuery, 250);

  // Only active products are visible on the public storefront
  const activeProducts = useMemo(() => {
    return products.filter((p) => p.status === "active");
  }, [products]);

  const filteredProducts = useMemo(() => {
    return activeProducts
      .filter((product) => {
        if (
          debouncedSearch.trim() !== "" &&
          !product.name.toLowerCase().includes(debouncedSearch.toLowerCase()) &&
          !product.short_description?.toLowerCase().includes(debouncedSearch.toLowerCase())
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "price_asc") return a.price - b.price;
        if (sortBy === "price_desc") return b.price - a.price;
        if (sortBy === "newest") return b.sort_order - a.sort_order;
        return (b.featured ? 1 : 0) - (a.featured ? 1 : 0);
      });
  }, [activeProducts, debouncedSearch, sortBy]);

  return (
    <div className="min-h-screen flex flex-col bg-[#FFF8EE]">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl py-8 md:py-12">
        {/* Page Header */}
        <div className="max-w-2xl mb-8 space-y-2">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/95 border border-[#FFB98A] shadow-soft text-xs font-bold text-[#4A2603] animate-float whitespace-nowrap">
            <Sparkles className="w-3.5 h-3.5 text-[#FFB98A] shrink-0" />
            <span>Dự án gây quỹ thiện nguyện của Mầm Mơ</span>
          </div>
          <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-[#231B16] tracking-tight text-balance">
            Tất cả sản phẩm Gieo Mơ
          </h1>
          <p className="text-[#7E7068] text-xs sm:text-sm leading-relaxed text-justify hyphens-auto break-words">
            Tất cả sản phẩm tại Tạp hóa Gieo Mơ đều được tạo nên từ những điều nhỏ bé, để mang đến một niềm vui nhỏ cho bạn và tiếp nối những điều tốt đẹp đến cộng đồng.
          </p>
        </div>

        {/* Filters & Search Controls */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-[#F0E5D8] shadow-soft mb-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            {/* Search Input */}
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A89B92]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Bạn tìm gì nèee..."
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-[#F0E5D8] focus:border-[#FFB98A] text-xs sm:text-sm outline-none transition-all bg-[#FFFDF9]"
              />
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-2 w-full md:w-auto justify-end">
              <span className="text-xs font-bold text-[#7E7068] whitespace-nowrap">
                Sắp xếp:
              </span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-3.5 py-2 rounded-2xl border border-[#F0E5D8] text-xs sm:text-sm bg-[#FFFDF9] outline-none focus:border-[#FFB98A] text-[#231B16] font-medium cursor-pointer"
              >
                <option value="featured">Nổi bật nhất</option>
                <option value="price_asc">Giá: Thấp đến cao</option>
                <option value="price_desc">Giá: Cao đến thấp</option>
                <option value="newest">Mới nhất</option>
              </select>
            </div>
          </div>
        </div>

        {/* Product Grid */}
        {filteredProducts.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6">
            {filteredProducts.map((product) => (
              <ProductCard key={product.product_id} product={product} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Không tìm thấy sản phẩm"
            description="Hãy thử tìm kiếm với từ khóa khác xem nhé!"
            action={
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="mt-3 px-4 py-2 rounded-2xl bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-bold text-xs transition-colors cursor-pointer"
              >
                Xóa từ khóa tìm kiếm
              </button>
            }
          />
        )}
      </main>

      <Footer />
    </div>
  );
}
