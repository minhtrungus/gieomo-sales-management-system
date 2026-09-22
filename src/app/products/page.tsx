"use client";

import { useState, useMemo } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ProductCard } from "@/components/products/ProductCard";
import { MOCK_PRODUCTS, MOCK_CATEGORIES } from "@/lib/data/mockData";
import { EmptyState } from "@/components/ui/States";

export default function ProductsPage() {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("featured");

  const filteredProducts = useMemo(() => {
    return MOCK_PRODUCTS.filter((product) => {
      // Category Filter
      if (selectedCategory !== "all" && product.category?.slug !== selectedCategory) {
        return false;
      }
      // Search Query
      if (
        searchQuery.trim() !== "" &&
        !product.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !product.short_description?.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return false;
      }
      return true;
    }).sort((a, b) => {
      if (sortBy === "price_asc") return a.price - b.price;
      if (sortBy === "price_desc") return b.price - a.price;
      if (sortBy === "newest") return b.sort_order - a.sort_order;
      return (b.featured ? 1 : 0) - (a.featured ? 1 : 0);
    });
  }, [selectedCategory, searchQuery, sortBy]);

  return (
    <div className="min-h-screen flex flex-col bg-cream/60">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 sm:px-6 py-8 md:py-12">
        {/* Page Header */}
        <div className="max-w-2xl mb-8 space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-soft-green/50 text-emerald-900 text-xs font-semibold">
            ✨ Cửa hàng gây quỹ Gieo Mơ
          </div>
          <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-emerald-950 tracking-tight">
            Tất cả sản phẩm
          </h1>
          <p className="text-gray-600 text-sm sm:text-base leading-relaxed">
            Mỗi món hàng nhỏ là một niềm vui lớn. 100% lợi nhuận được dành cho các dự án cộng đồng của Mầm Mơ.
          </p>
        </div>

        {/* Filters & Search Controls */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-emerald-100 shadow-2xs mb-8 space-y-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            {/* Search Input */}
            <div className="relative w-full md:w-80">
              <svg
                className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm sản phẩm, kẹp tóc, pouch..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 focus:border-soft-green focus:ring-2 focus:ring-soft-green/30 text-sm outline-none transition-all"
              />
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-2 w-full md:w-auto justify-end">
              <span className="text-xs font-medium text-gray-500 whitespace-nowrap">
                Sắp xếp:
              </span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-800 outline-none focus:border-soft-green"
              >
                <option value="featured">Nổi bật nhất</option>
                <option value="newest">Mới nhất</option>
                <option value="price_asc">Giá: Thấp đến Cao</option>
                <option value="price_desc">Giá: Cao đến Thấp</option>
              </select>
            </div>
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setSelectedCategory("all")}
              className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                selectedCategory === "all"
                  ? "bg-emerald-900 text-white shadow-xs"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              Tất cả ({MOCK_PRODUCTS.length})
            </button>
            {MOCK_CATEGORIES.map((cat) => {
              const count = MOCK_PRODUCTS.filter((p) => p.category?.slug === cat.slug).length;
              return (
                <button
                  key={cat.category_id}
                  onClick={() => setSelectedCategory(cat.slug)}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                    selectedCategory === cat.slug
                      ? "bg-emerald-900 text-white shadow-xs"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {cat.name} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Product Grid */}
        {filteredProducts.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredProducts.map((product) => (
              <ProductCard key={product.product_id} product={product} />
            ))}
          </div>
        ) : (
          <div className="py-16 bg-white rounded-2xl border border-emerald-100 p-6 text-center">
            <EmptyState
              icon="🔍"
              title="Không tìm thấy sản phẩm"
              description="Thử tìm kiếm với từ khóa khác hoặc bỏ chọn bộ lọc xem sao nhé!"
              action={
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedCategory("all");
                  }}
                  className="px-4 py-2 rounded-xl bg-soft-green text-emerald-950 font-bold text-sm"
                >
                  Xóa bộ lọc
                </button>
              }
            />
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
