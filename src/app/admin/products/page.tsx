"use client";

import { useState, useEffect, useMemo } from "react";
import { useDebounce } from "@/lib/hooks/useDebounce";
import Link from "next/link";
import Image from "next/image";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { Badge } from "@/components/ui/Badge";
import { ExtendedProduct } from "@/lib/data/mockData";
import {
  getStoredProducts,
  saveNewProduct,
  updateStoredProduct,
  deleteStoredProduct,
  toggleStoredProductStatus,
  toggleStoredProductFeatured,
  getStoredCategories,
} from "@/lib/data/orderStore";
import type { ProductCategory } from "@/types/database";
import { parseProductDescription } from "@/lib/utils/productParser";
import { Plus, Search, Edit3, Trash2, X, Check, AlertTriangle, Upload, Eye, Star } from "lucide-react";

export default function AdminProductsPage() {
  const [products, setProducts] = useState<ExtendedProduct[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>(() => getStoredCategories());

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
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 250);
  const [selectedCategory, setSelectedCategory] = useState("all");

  // Modal States
  const [editingProduct, setEditingProduct] = useState<ExtendedProduct | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<ExtendedProduct | null>(null);

  // Các khung chi tiết khi sửa sản phẩm (tách ở quản trị)
  const [editOverview, setEditOverview] = useState("");
  const [editSize, setEditSize] = useState("");
  const [editMaterials, setEditMaterials] = useState("");
  const [editCare, setEditCare] = useState("");
  const [editExtraSpecs, setEditExtraSpecs] = useState("");
  const [editImpact, setEditImpact] = useState("");
  const [editFeatured, setEditFeatured] = useState(false);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (selectedCategory !== "all" && p.category?.category_id !== selectedCategory) {
        return false;
      }
      if (
        debouncedSearch.trim() !== "" &&
        !p.name.toLowerCase().includes(debouncedSearch.toLowerCase()) &&
        !p.slug.toLowerCase().includes(debouncedSearch.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [products, selectedCategory, debouncedSearch]);

  // Toggle active/draft status
  const handleToggleStatus = (productId: string) => {
    const target = products.find((p) => p.product_id === productId);
    if (!target) return;
    const newStatus = target.status === "active" ? "draft" : "active";
    toggleStoredProductStatus(productId, newStatus);
    setProducts(getStoredProducts());
  };

  // Toggle featured status for homepage
  const handleToggleFeatured = (productId: string) => {
    const target = products.find((p) => p.product_id === productId);
    if (!target) return;
    const newFeatured = !target.featured;
    toggleStoredProductFeatured(productId, newFeatured);
    setProducts(getStoredProducts());
  };

  // Start editing product with separate spec fields populated
  const handleStartEdit = (p: ExtendedProduct) => {
    const parsed = parseProductDescription(p.description, p.specs, p.impact_story ?? undefined);
    setEditOverview(parsed.overview || p.description || "");
    setEditSize(parsed.sizeGuide || "");
    setEditMaterials(parsed.materials || "");
    setEditCare(parsed.careGuide || "");
    setEditExtraSpecs(
      Object.entries(parsed.extraSpecs)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n")
    );
    setEditImpact(parsed.impactStory || p.impact_story || "");
    setEditFeatured(p.featured ?? false);
    setEditingProduct(p);
  };

  // Save edited product
  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    // Parse extra specs: mỗi dòng 1 thông số dạng "Tên: Giá trị"
    const parsedExtraSpecs: Record<string, string> = {};
    if (editExtraSpecs.trim()) {
      const lines = editExtraSpecs.split("\n");
      for (const line of lines) {
        const parts = line.split(/[:：]/);
        if (parts.length >= 2) {
          const k = parts[0].trim();
          const v = parts.slice(1).join(":").trim();
          if (k && v) {
            parsedExtraSpecs[k] = v;
          }
        }
      }
    }

    const newSpecs: Record<string, string> = {
      ...parsedExtraSpecs,
    };
    if (editSize.trim()) newSpecs["Kích thước"] = editSize.trim();
    if (editMaterials.trim()) newSpecs["Chất liệu"] = editMaterials.trim();
    if (editCare.trim()) newSpecs["Bảo quản"] = editCare.trim();

    const fullDescription = [
      editOverview.trim(),
      editSize.trim() ? `\n\n## Kích thước\n${editSize.trim()}` : "",
      editMaterials.trim() ? `\n\n## Chất liệu\n${editMaterials.trim()}` : "",
      editCare.trim() ? `\n\n## Bảo quản\n${editCare.trim()}` : "",
      editImpact.trim() ? `\n\n## Ý nghĩa\n${editImpact.trim()}` : "",
    ].filter(Boolean).join("");

    const updated: ExtendedProduct = {
      ...editingProduct,
      description: fullDescription,
      impact_story: editImpact.trim() || undefined,
      specs: newSpecs,
      featured: editFeatured,
    };

    updateStoredProduct(updated);
    setProducts(getStoredProducts());
    setEditingProduct(null);
  };

  // Confirm delete product
  const handleConfirmDelete = () => {
    if (!deletingProduct) return;
    deleteStoredProduct(deletingProduct.product_id);
    setProducts(getStoredProducts());
    setDeletingProduct(null);
  };



  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-[#231B16]">
            Quản lý sản phẩm & Hàng hóa
          </h1>
          <p className="text-xs text-[#7E7068] mt-0.5">
            Xem danh sách, thêm mới, sửa giá, kiểm soát tồn kho và cập nhật trạng thái sản phẩm đồng bộ cơ sở dữ liệu.
          </p>
          <div className="mt-2 text-[11px] bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl px-3 py-1.5 inline-flex items-center gap-2">
            <span>💡</span>
            <span>
              Sản phẩm <strong>&quot;Đang bán&quot;</strong> sẽ hiển thị trên trang Tất cả sản phẩm. Bật thêm <strong>&quot;⭐ Nổi bật&quot;</strong> để đưa sản phẩm lên khu vực nổi bật trên Trang chủ.
            </span>
          </div>
        </div>

        <Link
          href="/admin/products/new"
          className="px-5 py-2.5 rounded-full bg-[#1B3622] hover:bg-[#132819] text-white font-extrabold text-xs flex items-center gap-2 shadow-xs transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Thêm sản phẩm</span>
        </Link>
      </div>

      {/* Search & Category Filter */}
      <div className="bg-white rounded-3xl p-4 border border-[#F0E5D8] shadow-soft flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A89B92]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm tên sản phẩm, mã slug..."
            className="w-full pl-9 pr-4 py-2 rounded-2xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] bg-[#FFFDF9]"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto">
          <button
            onClick={() => setSelectedCategory("all")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
              selectedCategory === "all"
                ? "bg-[#BFE9C3] text-[#16381D] border border-[#9ed4a3]"
                : "bg-[#FFFDF9] text-[#7E7068] hover:bg-[#FFF4E5] border border-[#F0E5D8]"
            }`}
          >
            Tất cả ({products.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat.category_id}
              onClick={() => setSelectedCategory(cat.category_id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                selectedCategory === cat.category_id
                  ? "bg-[#BFE9C3] text-[#16381D] border border-[#9ed4a3]"
                  : "bg-[#FFFDF9] text-[#7E7068] hover:bg-[#FFF4E5] border border-[#F0E5D8]"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-3xl border border-[#F0E5D8] shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead>
              <tr className="bg-[#FFF8EE] border-b border-[#F0E5D8] text-[#7E7068] font-bold uppercase tracking-wider text-[10px]">
                <th className="py-2.5 px-2.5 text-center w-10">STT</th>
                <th className="py-2.5 px-3">Sản phẩm</th>
                <th className="py-2.5 px-2.5">Danh mục</th>
                <th className="py-2.5 px-2.5">Giá bán / Giá vốn</th>
                <th className="py-2.5 px-2.5">Tổng tồn kho</th>
                <th className="py-2.5 px-2.5">Bán hàng</th>
                <th className="py-2.5 px-2.5">Trang chủ</th>
                <th className="py-2.5 px-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0E5D8]">
              {filteredProducts.map((p, idx) => {
                const totalStock = p.variants?.reduce((sum, v) => sum + v.stock, 0) ?? 10;
                return (
                  <tr key={p.product_id} className="hover:bg-[#FFFDF9] transition-colors">
                    <td className="py-2.5 px-2.5 text-center text-[#7E7068] font-bold text-[11px]">
                      {idx + 1}
                    </td>

                    <td className="py-2.5 px-3 flex items-center gap-2.5">
                      <div className="relative w-9 h-9 rounded-xl bg-[#FFF8EE] border border-[#F0E5D8] overflow-hidden shrink-0 flex items-center justify-center text-sm shadow-2xs">
                        {p.images?.[0] ? (
                          <Image src={p.images[0]} alt="" fill className="object-cover" />
                        ) : (
                          <span>🌱</span>
                        )}
                      </div>
                      <div>
                        <span className="font-bold text-[#342A24] block text-xs">{p.name}</span>
                        <span className="text-[10px] text-[#A89B92] font-mono">/{p.slug}</span>
                      </div>
                    </td>

                    <td className="py-2.5 px-2.5 font-bold text-[#5C4D44] whitespace-nowrap">
                      {p.category?.name ?? "Chưa phân loại"}
                    </td>

                    <td className="py-2.5 px-2.5 whitespace-nowrap">
                      <MoneyDisplay amount={p.price} className="font-extrabold text-[#1B3622] block text-xs" />
                      {p.cost_price && (
                        <span className="text-[9.5px] text-[#A89B92] block">
                          Vốn: <MoneyDisplay amount={p.cost_price} />
                        </span>
                      )}
                    </td>

                    <td className="py-2.5 px-2.5 whitespace-nowrap">
                      <span className={`font-bold px-2 py-0.5 rounded-full inline-block text-[10.5px] ${
                        totalStock <= 5
                          ? "bg-red-50 text-red-700 border border-red-200"
                          : totalStock <= 10
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : "text-[#342A24]"
                      }`}>
                        {totalStock} món
                      </span>
                    </td>

                    <td className="py-2.5 px-2.5 whitespace-nowrap">
                      <button
                        onClick={() => handleToggleStatus(p.product_id)}
                        className="cursor-pointer transition-transform active:scale-95"
                        title="Bấm để chuyển đổi Đang bán / Nháp"
                      >
                        <Badge variant={p.status === "active" ? "brand" : "default"} className="text-[10px] px-2 py-0.5">
                          {p.status === "active" ? "Đang bán" : "Nháp"}
                        </Badge>
                      </button>
                    </td>

                    <td className="py-2.5 px-2.5 whitespace-nowrap">
                      <button
                        onClick={() => handleToggleFeatured(p.product_id)}
                        className="cursor-pointer transition-transform active:scale-95"
                        title="Bấm để bật/tắt hiển thị Nổi bật trên Trang chủ"
                      >
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full border transition-colors ${
                          p.featured
                            ? "bg-amber-100 text-amber-900 border-amber-300"
                            : "bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200"
                        }`}>
                          <Star className={`w-3 h-3 ${p.featured ? "text-amber-600 fill-amber-500" : "text-gray-400"}`} />
                          <span>{p.featured ? "Nổi bật" : "Thường"}</span>
                        </span>
                      </button>
                    </td>

                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/products/${p.slug}`}
                          target="_blank"
                          className="p-1.5 rounded-xl text-[#7E7068] hover:text-[#2D6338] hover:bg-[#FFF8EE] transition-colors"
                          title="Xem trang khách hàng"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>

                        <button
                          onClick={() => handleStartEdit(p)}
                          className="p-1.5 rounded-xl text-[#7E7068] hover:text-[#2D6338] hover:bg-[#BFE9C3]/30 transition-colors cursor-pointer"
                          title="Sửa sản phẩm (4 Khung & Kho)"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => setDeletingProduct(p)}
                          className="p-1.5 rounded-xl text-[#7E7068] hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                          title="Xóa sản phẩm"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================
          MODAL 1: CHỈNH SỬA SẢN PHẨM (EDIT MODAL - 4 KHUNG & 2 KHO)
          ======================================================== */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-3xl p-6 sm:p-7 border border-[#F0E5D8] shadow-2xl space-y-5 text-left">
            <div className="flex items-center justify-between border-b border-[#F0E5D8] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#BFE9C3] flex items-center justify-center text-[#16381D]">
                  <Edit3 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-heading font-extrabold text-lg text-[#231B16]">
                    Chỉnh sửa sản phẩm
                  </h3>
                  <span className="text-[11px] text-gray-500">
                    Cập nhật 4 khung thông tin &amp; phân bổ tồn kho giữa 2 kho hàng
                  </span>
                </div>
              </div>
              <button
                onClick={() => setEditingProduct(null)}
                className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-[#342A24] block">Tên sản phẩm *</label>
                <input
                  type="text"
                  required
                  value={editingProduct.name}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, name: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Giá bán (VNĐ) *</label>
                  <input
                    type="number"
                    required
                    value={editingProduct.price}
                    onChange={(e) =>
                      setEditingProduct({
                        ...editingProduct,
                        price: Number(e.target.value),
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Giá vốn (Cost price)</label>
                  <input
                    type="number"
                    value={editingProduct.cost_price ?? ""}
                    onChange={(e) =>
                      setEditingProduct({
                        ...editingProduct,
                        cost_price: Number(e.target.value),
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Danh mục *</label>
                  <select
                    value={editingProduct.category_id ?? "cat-1"}
                    onChange={(e) => {
                      const cat = categories.find((c) => c.category_id === e.target.value);
                      setEditingProduct({
                        ...editingProduct,
                        category_id: e.target.value,
                        category: cat,
                      });
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] bg-white font-bold text-[#342A24]"
                  >
                    {categories.map((c) => (
                      <option key={c.category_id} value={c.category_id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Trạng thái xuất bản *</label>
                  <select
                    value={editingProduct.status}
                    onChange={(e) =>
                      setEditingProduct({
                        ...editingProduct,
                        status: e.target.value as "active" | "draft",
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] bg-white font-bold text-[#342A24]"
                  >
                    <option value="active">Đang bán (Active)</option>
                    <option value="draft">Bản nháp (Draft)</option>
                  </select>

                  <label className="flex items-center gap-2 cursor-pointer pt-2">
                    <input
                      type="checkbox"
                      checked={editFeatured}
                      onChange={(e) => setEditFeatured(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="text-[11px] font-bold text-[#342A24]">
                      ⭐ Hiển thị nổi bật trên Trang chủ (Hero)
                    </span>
                  </label>
                </div>
              </div>

              {/* Phân bổ tồn kho giữa 2 kho hàng */}
              <div className="p-3.5 rounded-2xl bg-cream/70 border border-[#F0E5D8] space-y-2">
                <label className="font-extrabold text-emerald-950 uppercase tracking-wider block">
                  Phân bổ tồn kho giữa 2 kho hàng
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="font-bold text-emerald-900 block flex items-center gap-1">
                      <span>📍 Kho 1: Trung Tâm (Quận 3)</span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={editingProduct.variants?.[0]?.stock_warehouse_1 ?? 7}
                      onChange={(e) => {
                        const wh1 = Number(e.target.value);
                        const wh2 = editingProduct.variants?.[0]?.stock_warehouse_2 ?? 3;
                        const updatedVariants = editingProduct.variants?.map((v, i) =>
                          i === 0 ? { ...v, stock_warehouse_1: wh1, stock_warehouse_2: wh2, stock: wh1 + wh2 } : v
                        ) ?? [];
                        setEditingProduct({ ...editingProduct, variants: updatedVariants });
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-emerald-300 text-xs font-bold text-emerald-950 bg-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-bold text-[#542B07] block flex items-center gap-1">
                      <span>📍 Kho 2: Cơ Sở 2 (Thủ Đức)</span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={editingProduct.variants?.[0]?.stock_warehouse_2 ?? 3}
                      onChange={(e) => {
                        const wh2 = Number(e.target.value);
                        const wh1 = editingProduct.variants?.[0]?.stock_warehouse_1 ?? 7;
                        const updatedVariants = editingProduct.variants?.map((v, i) =>
                          i === 0 ? { ...v, stock_warehouse_1: wh1, stock_warehouse_2: wh2, stock: wh1 + wh2 } : v
                        ) ?? [];
                        setEditingProduct({ ...editingProduct, variants: updatedVariants });
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-amber-300 text-xs font-bold text-[#542B07] bg-white"
                    />
                  </div>
                </div>
                <div className="text-[11px] text-gray-500 flex justify-between pt-1">
                  <span>Tổng tồn toàn hệ thống:</span>
                  <strong className="text-emerald-900">
                    {(editingProduct.variants?.[0]?.stock_warehouse_1 ?? 7) +
                      (editingProduct.variants?.[0]?.stock_warehouse_2 ?? 3)}{" "}
                    sản phẩm
                  </strong>
                </div>
              </div>

              {/* Các khung thông tin chi tiết (Tách bạch ở quản trị để dễ nhập liệu) */}
              <div className="space-y-3 pt-2 border-t border-gray-100">
                <div className="flex items-center justify-between">
                  <label className="font-extrabold text-emerald-950 uppercase tracking-wider block text-xs">
                    Chi tiết &amp; Thông số sản phẩm (Tách riêng ở quản trị)
                  </label>
                  <span className="text-[11px] text-gray-500 italic">
                    Tự động đồng bộ lên bảng thông số Shopee ở trang bán hàng
                  </span>
                </div>

                {/* Khung 1: Mô tả chung */}
                <div className="p-3 rounded-2xl bg-gray-50/70 border border-gray-200/80 space-y-1">
                  <label className="font-bold text-gray-800 block text-xs">📋 Khung 1: Mô tả giới thiệu sản phẩm</label>
                  <textarea
                    value={editOverview}
                    onChange={(e) => setEditOverview(e.target.value)}
                    placeholder="Mô tả giới thiệu chi tiết sản phẩm, công năng và câu chuyện..."
                    rows={3}
                    className="w-full p-2.5 rounded-xl border border-gray-200 text-xs outline-none focus:border-emerald-600 bg-white"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Khung 2: Kích thước */}
                  <div className="p-3 rounded-2xl bg-gray-50/70 border border-gray-200/80 space-y-1">
                    <label className="font-bold text-gray-800 block text-xs">📏 Khung 2: Kích thước &amp; Bảng Size</label>
                    <textarea
                      value={editSize}
                      onChange={(e) => setEditSize(e.target.value)}
                      placeholder="Ví dụ: 35cm x 40cm, quai dài 28cm..."
                      rows={2}
                      className="w-full p-2.5 rounded-xl border border-gray-200 text-xs outline-none focus:border-emerald-600 bg-white"
                    />
                  </div>

                  {/* Khung 3: Chất liệu */}
                  <div className="p-3 rounded-2xl bg-gray-50/70 border border-gray-200/80 space-y-1">
                    <label className="font-bold text-gray-800 block text-xs">🧶 Khung 3: Chất liệu vải &amp; Phụ liệu</label>
                    <textarea
                      value={editMaterials}
                      onChange={(e) => setEditMaterials(e.target.value)}
                      placeholder="Ví dụ: Vải Canvas 12oz dày dặn, đứng form..."
                      rows={2}
                      className="w-full p-2.5 rounded-xl border border-gray-200 text-xs outline-none focus:border-emerald-600 bg-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Khung 4: Hướng dẫn bảo quản */}
                  <div className="p-3 rounded-2xl bg-gray-50/70 border border-gray-200/80 space-y-1">
                    <label className="font-bold text-gray-800 block text-xs">🧼 Khung 4: Hướng dẫn bảo quản &amp; Giặt</label>
                    <textarea
                      value={editCare}
                      onChange={(e) => setEditCare(e.target.value)}
                      placeholder="Ví dụ: Giặt tay nhẹ nhàng, không dùng thuốc tẩy..."
                      rows={2}
                      className="w-full p-2.5 rounded-xl border border-gray-200 text-xs outline-none focus:border-emerald-600 bg-white"
                    />
                  </div>

                  {/* Khung 5: Thông số bổ sung khác */}
                  <div className="p-3 rounded-2xl bg-gray-50/70 border border-gray-200/80 space-y-1">
                    <label className="font-bold text-gray-800 block text-xs">⚙️ Khung 5: Thông số bổ sung khác</label>
                    <textarea
                      value={editExtraSpecs}
                      onChange={(e) => setEditExtraSpecs(e.target.value)}
                      placeholder={"Mỗi dòng 1 thông số (Tên: Giá trị)\nVí dụ:\nTính năng: Có ngăn phụ kéo khóa\nKhóa kéo: Kim loại YKK"}
                      rows={2}
                      className="w-full p-2.5 rounded-xl border border-gray-200 text-xs outline-none focus:border-emerald-600 bg-white font-mono text-[11px]"
                    />
                  </div>
                </div>

                {/* Khung 6: Ý nghĩa gây quỹ */}
                <div className="p-3 rounded-2xl bg-emerald-50/40 border border-emerald-200/80 space-y-1">
                  <label className="font-bold text-emerald-950 block text-xs">💖 Khung 6: Ý nghĩa gây quỹ Mầm Mơ</label>
                  <textarea
                    value={editImpact}
                    onChange={(e) => setEditImpact(e.target.value)}
                    placeholder="Ý nghĩa và mục đích gây quỹ thiện nguyện..."
                    rows={2}
                    className="w-full p-2.5 rounded-xl border border-emerald-200 text-xs outline-none focus:border-emerald-600 bg-white"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-xs shadow-xs border border-[#9ed4a3]"
                >
                  Lưu thay đổi ➔
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 2: XÓA SẢN PHẨM (DELETE CONFIRMATION)
          ======================================================== */}
      {deletingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 border border-[#F0E5D8] shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="font-heading font-extrabold text-lg text-[#231B16]">
              Xác nhận xóa sản phẩm?
            </h3>
            <p className="text-xs text-[#7E7068] leading-relaxed">
              Bạn có chắc chắn muốn xóa vĩnh viễn <strong>&quot;{deletingProduct.name}&quot;</strong>? Thao tác này sẽ xóa sản phẩm khỏi kho và trang bán hàng.
            </p>

            <div className="flex items-center justify-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeletingProduct(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-xs"
              >
                Đồng ý xóa ➔
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
