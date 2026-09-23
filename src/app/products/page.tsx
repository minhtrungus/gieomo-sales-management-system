"use client";

import { useState, useMemo } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ProductCard } from "@/components/products/ProductCard";
import { MOCK_PRODUCTS, MOCK_CATEGORIES } from "@/lib/data/mockData";
import { EmptyState } from "@/components/ui/States";
import { Search, Sparkles } from "lucide-react";

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
    <div className="min-h-screen flex flex-col bg-[#FFF8EE]">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 sm:px-6 py-8 md:py-12">
        {/* Page Header */}
        <div className="max-w-2xl mb-8 space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-[#BFE9C3] text-[#16381D] text-xs font-bold border border-[#9ed4a3]">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Cửa hàng gây quỹ Gieo Mơ</span>
          </div>
          <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-[#231B16] tracking-tight">
            Tất cả sản phẩm handmade
          </h1>
          <p className="text-[#7E7068] text-xs sm:text-sm leading-relaxed">
            Mỗi món hàng nhỏ là một niềm vui lớn. 100% lợi nhuận được dùng để tài trợ học tập cho trẻ em vùng cao.
          </p>
        </div>

        {/* Filters & Search Controls */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-[#F0E5D8] shadow-soft mb-8 space-y-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            {/* Search Input */}
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A89B92]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm pouch, kẹp tóc, móc khóa..."
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
                className="px-3.5 py-2 rounded-xl border border-[#F0E5D8] bg-[#FFFDF9] text-xs font-bold text-[#342A24] outline-none focus:border-[#FFB98A]"
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
              className={`px-4 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition-all ${
                selectedCategory === "all"
                  ? "bg-[#BFE9C3] text-[#16381D] shadow-xs border border-[#9ed4a3]"
                  : "bg-[#FFFDF9] text-[#6B5A50] hover:bg-[#FFF4E5] border border-[#F0E5D8]"
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
                  className={`px-4 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition-all ${
                    selectedCategory === cat.slug
                      ? "bg-[#BFE9C3] text-[#16381D] shadow-xs border border-[#9ed4a3]"
                      : "bg-[#FFFDF9] text-[#6B5A50] hover:bg-[#FFF4E5] border border-[#F0E5D8]"
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
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6">
            {filteredProducts.map((product) => (
              <ProductCard key={product.product_id} product={product} />
            ))}
          </div>
        ) : (
          <div className="py-16 bg-white rounded-3xl border border-[#F0E5D8] p-6 text-center shadow-soft">
            <EmptyState
              icon="🔍"
              title="Không tìm thấy sản phẩm"
              description="Thử tìm kiếm với từ khóa khác hoặc bấm nút bên dưới để xem toàn bộ sản phẩm nhé!"
              action={
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedCategory("all");
                  }}
                  className="px-5 py-2.5 rounded-full bg-[#BFE9C3] text-[#16381D] font-bold text-xs shadow-xs border border-[#9ed4a3]"
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
