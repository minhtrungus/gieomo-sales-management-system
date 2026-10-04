"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { Badge } from "@/components/ui/Badge";
import { ExtendedProduct } from "@/lib/data/mockData";
import {
  getStoredProducts,
  updateStoredProduct,
  deleteStoredProduct,
  toggleStoredProductStatus,
  toggleStoredProductFeatured,
} from "@/lib/data/orderStore";
import { AdminSearchInput } from "@/components/admin/AdminSearchInput";
import { Plus, Edit3, Trash2, AlertTriangle, Eye, Star } from "lucide-react";
import { ProductEditModal } from "./ProductEditModal";

export default function AdminProductsPage() {
  const [products, setProducts] = useState<ExtendedProduct[]>([]);

  useEffect(() => {
    setProducts(getStoredProducts());
    const handleUpdate = () => setProducts(getStoredProducts());
    window.addEventListener("gieomo_products_updated", handleUpdate);
    return () => {
      window.removeEventListener("gieomo_products_updated", handleUpdate);
    };
  }, []);

  const [searchQuery, setSearchQuery] = useState("");

  // Modal States
  const [editingProduct, setEditingProduct] = useState<ExtendedProduct | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<ExtendedProduct | null>(null);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (
        searchQuery.trim() !== "" &&
        !p.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !p.slug.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [products, searchQuery]);

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

  // Start editing product - instant single state update
  const handleStartEdit = (p: ExtendedProduct) => {
    setEditingProduct(p);
  };

  // Save edited product
  const handleSaveEdit = async (updated: ExtendedProduct) => {
    await updateStoredProduct(updated);
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
            Quản lý sản phẩm &amp; Hàng hóa
          </h1>
          <p className="text-xs text-[#7E7068] mt-0.5">
            Xem danh sách, kiểm soát tồn kho và giá bán sản phẩm.
          </p>
        </div>

        <Link
          href="/admin/products/new"
          className="px-5 py-2.5 rounded-full bg-[#1B3622] hover:bg-[#132819] text-white font-extrabold text-xs flex items-center gap-2 shadow-xs transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Thêm sản phẩm</span>
        </Link>
      </div>

      {/* Tip Box */}
      <div className="text-[11px] bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl px-3.5 py-2 flex items-center gap-2">
        <span>💡</span>
        <span>
          Sản phẩm <strong>&quot;Đang bán&quot;</strong> hiển thị trên website. Bật <strong>&quot;⭐ Nổi bật&quot;</strong> để đưa lên đầu Trang chủ.
        </span>
      </div>

      {/* Search Input */}
      <div className="bg-white rounded-3xl p-4 border border-[#F0E5D8] shadow-soft">
        <div className="w-full sm:w-80">
          <AdminSearchInput
            placeholder="Tìm tên sản phẩm, mã slug..."
            onSearch={setSearchQuery}
          />
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-3xl border border-[#F0E5D8] shadow-soft overflow-hidden">
        <div className="sm:hidden px-3 pt-2 text-[10px] text-[#A89B92] italic flex items-center gap-1">
          <span>↔</span> <span>Vuốt sang ngang để xem đầy đủ các cột</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-[11px]">
            <thead>
              <tr className="bg-[#FFF8EE] border-b border-[#F0E5D8] text-[#7E7068] font-bold uppercase tracking-wider text-[10px]">
                <th className="py-2.5 px-2.5 text-center w-10 whitespace-nowrap">STT</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Sản phẩm</th>
                <th className="py-2.5 px-2.5 whitespace-nowrap">Giá bán / Giá vốn</th>
                <th className="py-2.5 px-2.5 whitespace-nowrap">Tổng tồn kho</th>
                <th className="py-2.5 px-2.5 whitespace-nowrap">Bán hàng</th>
                <th className="py-2.5 px-2.5 whitespace-nowrap">Trang chủ</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Thao tác</th>
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
          MODAL 1: CHỈNH SỬA SẢN PHẨM (TỐI ƯU TỐC ĐỘ & TẢI ẢNH)
          ======================================================== */}
      {editingProduct && (
        <ProductEditModal
          product={editingProduct}
          onClose={() => setEditingProduct(null)}
          onSave={handleSaveEdit}
        />
      )}

      {/* ========================================================
          MODAL 2: XÓA SẢN PHẨM (DELETE CONFIRMATION)
          ======================================================== */}
      {deletingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-in fade-in" style={{ willChange: "opacity" }}>
          <div
            className="w-full max-w-sm bg-white rounded-3xl p-6 border border-[#F0E5D8] shadow-2xl space-y-4 text-center animate-in zoom-in-95 duration-200"
            style={{ willChange: "transform, opacity", transform: "translateZ(0)" }}
          >
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
