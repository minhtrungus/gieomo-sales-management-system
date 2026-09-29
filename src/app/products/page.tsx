"use client";

import { useState, useEffect, useMemo } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ProductCard } from "@/components/products/ProductCard";
import { MOCK_CATEGORIES, ExtendedProduct } from "@/lib/data/mockData";
import { getStoredProducts, getStoredCategories } from "@/lib/data/orderStore";
import type { ProductCategory } from "@/types/database";
import { EmptyState } from "@/components/ui/States";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { Search, Sparkles } from "lucide-react";

export default function ProductsPage() {
  const [products, setProducts] = useState<ExtendedProduct[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>(MOCK_CATEGORIES);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("featured");

  useEffect(() => {
    setProducts(getStoredProducts());
    setCategories(getStoredCategories());

    const handleUpdate = () => setProducts(getStoredProducts());
    const handleCatUpdate = () => setCategories(getStoredCategories());

    window.addEventListener("gieomo_products_updated", handleUpdate);
    window.addEventListener("gieomo_categories_updated", handleCatUpdate);

    return () => {
      window.removeEventListener("gieomo_products_updated", handleUpdate);
      window.removeEventListener("gieomo_categories_updated", handleCatUpdate);
    };
  }, []);

  const debouncedSearch = useDebounce(searchQuery, 250);

  // Deduplicate categories by slug to ensure 100% duplicate-free UI
  const uniqueCategories = useMemo(() => {
    const map = new Map<string, ProductCategory>();
    for (const cat of categories) {
      if (cat.slug && !map.has(cat.slug)) {
        map.set(cat.slug, cat);
      }
    }
    return Array.from(map.values()).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }, [categories]);

  // Helper to determine product category slug cleanly without hardcoded fallbacks
  const getProductCategorySlug = (product: ExtendedProduct): string | null => {
    if (product.category?.slug) return product.category.slug;
    if (product.category_id) {
      const matched = categories.find((c) => c.category_id === product.category_id);
      if (matched?.slug) return matched.slug;
    }
    return null;
  };

  // Only active products are visible on the public storefront
  const activeProducts = useMemo(() => {
    return products.filter((p) => p.status === "active");
  }, [products]);

  // Products with no category
  const uncategorizedCount = useMemo(() => {
    return activeProducts.filter((p) => !getProductCategorySlug(p)).length;
  }, [activeProducts, categories]);

  // If selected category does not exist, or system has no categories -> fallback to "all" (mặc định hiển thị tất cả)
  useEffect(() => {
    if (selectedCategory !== "all") {
      if (selectedCategory === "uncategorized") {
        if (uncategorizedCount === 0) setSelectedCategory("all");
      } else {
        const exists = uniqueCategories.some((c) => c.slug === selectedCategory);
        if (!exists) {
          setSelectedCategory("all");
        }
      }
    }
  }, [uniqueCategories, selectedCategory, uncategorizedCount]);

  const filteredProducts = useMemo(() => {
    return activeProducts
      .filter((product) => {
        // Category Filter:
        // Nếu không có danh mục trong hệ thống, hoặc chọn "Tất cả",
        // hoặc sản phẩm không thuộc danh mục nào -> mặc định hiển thị tất cả
        if (selectedCategory !== "all" && uniqueCategories.length > 0) {
          const cSlug = getProductCategorySlug(product);
          if (selectedCategory === "uncategorized") {
            if (cSlug) return false;
          } else {
            if (!cSlug || cSlug !== selectedCategory) {
              return false;
            }
          }
        }
        // Search Query
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
  }, [activeProducts, selectedCategory, uniqueCategories, debouncedSearch, sortBy, categories]);

  return (
    <div className="min-h-screen flex flex-col bg-[#FFF8EE]">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 sm:px-6 py-8 md:py-12">
        {/* Page Header */}
        <div className="max-w-2xl mb-8 space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-[#BFE9C3] text-[#16381D] text-xs font-bold border border-[#9ed4a3]">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Dự án gây quỹ thiện nguyện của Mầm Mơ</span>
          </div>
          <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-[#231B16] tracking-tight">
            Tất cả sản phẩm Gieo Mơ
          </h1>
          <p className="text-[#7E7068] text-xs sm:text-sm leading-relaxed">
            Tất cả sản phẩm tại Tạp hóa Gieo Mơ đều được tạo nên từ những điều nhỏ bé, để mang đến một niềm vui nhỏ cho bạn và tiếp nối những điều tốt đẹp đến cộng đồng.
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
                className="px-3.5 py-2 rounded-2xl border border-[#F0E5D8] text-xs sm:text-sm bg-[#FFFDF9] outline-none focus:border-[#FFB98A] text-[#231B16] font-medium"
              >
                <option value="featured">Nổi bật nhất</option>
                <option value="price_asc">Giá: Thấp đến cao</option>
                <option value="price_desc">Giá: Cao đến thấp</option>
                <option value="newest">Mới nhất</option>
              </select>
            </div>
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setSelectedCategory("all")}
              className={`px-4 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                selectedCategory === "all"
                  ? "bg-[#BFE9C3] text-[#16381D] shadow-xs border border-[#9ed4a3]"
                  : "bg-[#FFFDF9] text-[#6B5A50] hover:bg-[#FFF4E5] border border-[#F0E5D8]"
              }`}
            >
              Tất cả <span suppressHydrationWarning>({activeProducts.length})</span>
            </button>
            {uniqueCategories.map((cat) => {
              const count = activeProducts.filter((p) => getProductCategorySlug(p) === cat.slug).length;
              return (
                <button
                  key={cat.slug}
                  onClick={() => setSelectedCategory(cat.slug)}
                  className={`px-4 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                    selectedCategory === cat.slug
                      ? "bg-[#BFE9C3] text-[#16381D] shadow-xs border border-[#9ed4a3]"
                      : "bg-[#FFFDF9] text-[#6B5A50] hover:bg-[#FFF4E5] border border-[#F0E5D8]"
                  }`}
                >
                  {cat.name} <span suppressHydrationWarning>({count})</span>
                </button>
              );
            })}
            {uncategorizedCount > 0 && uniqueCategories.length > 0 && (
              <button
                onClick={() => setSelectedCategory("uncategorized")}
                className={`px-4 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  selectedCategory === "uncategorized"
                    ? "bg-[#BFE9C3] text-[#16381D] shadow-xs border border-[#9ed4a3]"
                    : "bg-[#FFFDF9] text-[#6B5A50] hover:bg-[#FFF4E5] border border-[#F0E5D8]"
                }`}
              >
                Khác / Chưa phân loại <span suppressHydrationWarning>({uncategorizedCount})</span>
              </button>
            )}
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
            description="Hãy thử thay đổi bộ lọc hoặc tìm kiếm với từ khóa khác xem nhé!"
            action={
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory("all");
                  setSearchQuery("");
                }}
                className="mt-3 px-4 py-2 rounded-2xl bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-bold text-xs transition-colors cursor-pointer"
              >
                Xóa bộ lọc
              </button>
            }
          />
        )}
      </main>

      <Footer />
    </div>
  );
}
