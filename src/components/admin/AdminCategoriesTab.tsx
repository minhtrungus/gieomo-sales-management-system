"use client";

import { useState, useEffect, useMemo } from "react";
import {
  getStoredCategories,
  saveNewCategory,
  updateStoredCategory,
  deleteStoredCategory,
  getStoredProducts,
} from "@/lib/data/orderStore";
import type { ProductCategory } from "@/types/database";
import { AdminSearchInput } from "@/components/admin/AdminSearchInput";
import {
  FolderPlus,
  FolderTree,
  Edit3,
  Trash2,
  X,
  AlertTriangle,
  Boxes,
} from "lucide-react";

export function AdminCategoriesTab() {
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [products, setProducts] = useState(getStoredProducts());
  const [searchQuery, setSearchQuery] = useState("");

  const loadData = () => {
    setCategories(getStoredCategories());
    setProducts(getStoredProducts());
  };

  useEffect(() => {
    loadData();
    const handleCatUpdate = () => setCategories(getStoredCategories());
    const handleProdUpdate = () => setProducts(getStoredProducts());

    window.addEventListener("gieomo_categories_updated", handleCatUpdate);
    window.addEventListener("gieomo_products_updated", handleProdUpdate);

    return () => {
      window.removeEventListener("gieomo_categories_updated", handleCatUpdate);
      window.removeEventListener("gieomo_products_updated", handleProdUpdate);
    };
  }, []);

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ProductCategory | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<ProductCategory | null>(null);

  // Form states for Add
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newStatus, setNewStatus] = useState<"active" | "draft">("active");
  const [newSortOrder, setNewSortOrder] = useState<number>(1);

  // Helper to generate slug
  const generateSlug = (val: string) => {
    return val
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[đĐ]/g, "d")
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");
  };

  const handleNameChange = (val: string) => {
    setNewName(val);
    setNewSlug(generateSlug(val));
  };

  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    const catSlug = newSlug.trim() || generateSlug(newName);

    const newCat: ProductCategory = {
      category_id: `cat-${Date.now()}`,
      name: newName.trim(),
      slug: catSlug,
      description: newDescription.trim() || null,
      status: newStatus,
      sort_order: Number(newSortOrder) || categories.length + 1,
      created_at: new Date().toISOString(),
    };

    saveNewCategory(newCat);
    setCategories(getStoredCategories());

    // Reset form
    setNewName("");
    setNewSlug("");
    setNewDescription("");
    setNewStatus("active");
    setNewSortOrder(categories.length + 2);
    setIsAddModalOpen(false);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory || !editingCategory.name.trim()) return;

    const updated: ProductCategory = {
      ...editingCategory,
      name: editingCategory.name.trim(),
      slug: editingCategory.slug.trim() || generateSlug(editingCategory.name),
      description: editingCategory.description?.trim() || null,
    };

    updateStoredCategory(updated);
    setCategories(getStoredCategories());
    setProducts(getStoredProducts());
    setEditingCategory(null);
  };

  const handleConfirmDelete = () => {
    if (!deletingCategory) return;
    deleteStoredCategory(deletingCategory.category_id);
    setCategories(getStoredCategories());
    setProducts(getStoredProducts());
    setDeletingCategory(null);
  };

  // Count products in each category
  const productCountByCat = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products) {
      const cId = p.category_id || p.category?.category_id || "uncategorized";
      map.set(cId, (map.get(cId) || 0) + 1);
    }
    return map;
  }, [products]);

  // Filtered categories
  const filteredCategories = useMemo(() => {
    return categories.filter((c) => {
      if (
        searchQuery.trim() !== "" &&
        !c.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !c.slug.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [categories, searchQuery]);

  return (
    <div className="space-y-5">
      {/* Subheader */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-heading font-extrabold text-lg text-[#231B16] flex items-center gap-2">
            <FolderTree className="w-5 h-5 text-[#2D6338]" />
            <span>Danh mục sản phẩm</span>
          </h2>
          <p className="text-xs text-[#7E7068] mt-0.5">
            Quản lý tên, đường dẫn và thứ tự các nhóm sản phẩm gây quỹ.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setNewName("");
            setNewSlug("");
            setNewDescription("");
            setNewStatus("active");
            setNewSortOrder(categories.length + 1);
            setIsAddModalOpen(true);
          }}
          className="px-4 py-2 rounded-full bg-[#1B3622] hover:bg-[#132819] text-white font-extrabold text-xs flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer whitespace-nowrap"
        >
          <FolderPlus className="w-4 h-4" />
          <span>Thêm danh mục mới</span>
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-3xl p-4 border border-[#F0E5D8] shadow-soft">
          <div className="text-gray-500 text-xs font-semibold">Tổng số danh mục</div>
          <div className="font-heading font-extrabold text-2xl text-[#231B16] mt-1">
            {categories.length}
          </div>
        </div>

        <div className="bg-white rounded-3xl p-4 border border-[#F0E5D8] shadow-soft">
          <div className="text-gray-500 text-xs font-semibold">Đang hoạt động</div>
          <div className="font-heading font-extrabold text-2xl text-emerald-800 mt-1">
            {categories.filter((c) => c.status === "active").length}
          </div>
        </div>

        <div className="bg-white rounded-3xl p-4 border border-[#F0E5D8] shadow-soft">
          <div className="text-gray-500 text-xs font-semibold">Sản phẩm đã phân loại</div>
          <div className="font-heading font-extrabold text-2xl text-amber-900 mt-1">
            {products.length}
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white rounded-3xl p-3 sm:p-4 border border-[#F0E5D8] shadow-soft flex items-center justify-between gap-4">
        <div className="w-full sm:w-80">
          <AdminSearchInput
            placeholder="Tìm theo tên danh mục, slug..."
            onSearch={setSearchQuery}
          />
        </div>
        <span className="text-xs text-gray-500 font-semibold hidden sm:inline whitespace-nowrap">
          Hiển thị <strong>{filteredCategories.length}</strong> danh mục
        </span>
      </div>

      {/* Categories Table */}
      <div className="bg-white rounded-3xl border border-[#F0E5D8] shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-[#FFFDF9] border-b border-[#F0E5D8] text-[#7E7068] font-bold">
                <th className="py-3 px-3 w-12 text-center whitespace-nowrap">STT</th>
                <th className="py-3 px-4 whitespace-nowrap">Tên danh mục &amp; Mô tả</th>
                <th className="py-3 px-4 whitespace-nowrap">Đường dẫn (Slug)</th>
                <th className="py-3 px-4 text-center whitespace-nowrap">Số sản phẩm</th>
                <th className="py-3 px-4 text-center whitespace-nowrap">Thứ tự</th>
                <th className="py-3 px-4 text-center whitespace-nowrap">Trạng thái</th>
                <th className="py-3 px-4 text-right whitespace-nowrap">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0E5D8]">
              {filteredCategories.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-[#7E7068]">
                    {searchQuery
                      ? "Không tìm thấy danh mục nào phù hợp với từ khóa."
                      : "Chưa có danh mục nào. Hãy bấm 'Thêm danh mục mới'!"}
                  </td>
                </tr>
              ) : (
                filteredCategories.map((cat, idx) => {
                  const prodCount = productCountByCat.get(cat.category_id) || 0;
                  return (
                    <tr key={cat.category_id} className="hover:bg-[#FFFDF9] transition-colors">
                      <td className="py-3.5 px-3 text-center font-bold text-gray-400">
                        {idx + 1}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="space-y-0.5">
                          <span className="font-heading font-extrabold text-xs sm:text-sm text-[#231B16] block">
                            {cat.name}
                          </span>
                          {cat.description ? (
                            <p className="text-[11px] text-[#7E7068] line-clamp-1">
                              {cat.description}
                            </p>
                          ) : (
                            <span className="text-[10px] text-gray-400 italic">Chưa có mô tả</span>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="font-mono text-gray-600 font-semibold bg-gray-100 px-2 py-0.5 rounded-lg text-[11px] whitespace-nowrap">
                          /{cat.slug}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 font-bold text-[11px] border border-emerald-200">
                          <Boxes className="w-3 h-3 text-emerald-600" />
                          <span>{prodCount} sản phẩm</span>
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-center font-mono font-bold text-gray-600">
                        {cat.sort_order ?? idx + 1}
                      </td>

                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {cat.status === "active" ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-[#EAF7ED] text-[#16381D] font-bold text-[11px] border border-emerald-200">
                            Đang dùng
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-600 font-bold text-[11px]">
                            Tạm ẩn
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingCategory(cat)}
                            className="p-1.5 rounded-xl text-gray-600 hover:text-emerald-800 hover:bg-emerald-50 transition-colors cursor-pointer"
                            title="Sửa tên / Cập nhật danh mục"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingCategory(cat)}
                            className="p-1.5 rounded-xl text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                            title="Xóa danh mục"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Thêm danh mục */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 border border-[#F0E5D8] shadow-2xl space-y-4 text-left animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-[#F0E5D8] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-800">
                  <FolderPlus className="w-4 h-4" />
                </div>
                <h3 className="font-heading font-extrabold text-base text-[#231B16]">
                  Thêm danh mục sản phẩm mới
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCategory} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-[#342A24] block">Tên danh mục *</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Đồ thủ công may vá"
                  value={newName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] bg-white font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#342A24] block">Đường dẫn tĩnh (Slug) *</label>
                <input
                  type="text"
                  required
                  placeholder="do-thu-cong-may-va"
                  value={newSlug}
                  onChange={(e) => setNewSlug(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs font-mono outline-none focus:border-[#FFB98A] bg-white text-gray-700"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#342A24] block">Mô tả ngắn</label>
                <textarea
                  rows={2}
                  placeholder="Mô tả ý nghĩa danh mục này..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] bg-white resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Thứ tự hiển thị</label>
                  <input
                    type="number"
                    min={1}
                    value={newSortOrder}
                    onChange={(e) => setNewSortOrder(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-[#F0E5D8] text-xs font-bold outline-none bg-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Trạng thái</label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-[#F0E5D8] text-xs font-semibold text-[#342A24] bg-white outline-none"
                  >
                    <option value="active">Đang dùng</option>
                    <option value="draft">Tạm ẩn</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-[#F0E5D8]">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs shadow-xs cursor-pointer transition-colors"
                >
                  Tạo danh mục ➔
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Sửa danh mục */}
      {editingCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 border border-[#F0E5D8] shadow-2xl space-y-4 text-left animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-[#F0E5D8] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-800">
                  <Edit3 className="w-4 h-4" />
                </div>
                <h3 className="font-heading font-extrabold text-base text-[#231B16]">
                  Chỉnh sửa danh mục
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingCategory(null)}
                className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-[#342A24] block">Tên danh mục *</label>
                <input
                  type="text"
                  required
                  value={editingCategory.name}
                  onChange={(e) =>
                    setEditingCategory({ ...editingCategory, name: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] bg-white font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#342A24] block">Đường dẫn tĩnh (Slug) *</label>
                <input
                  type="text"
                  required
                  value={editingCategory.slug}
                  onChange={(e) =>
                    setEditingCategory({ ...editingCategory, slug: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs font-mono outline-none focus:border-[#FFB98A] bg-white text-gray-700"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#342A24] block">Mô tả ngắn</label>
                <textarea
                  rows={2}
                  value={editingCategory.description || ""}
                  onChange={(e) =>
                    setEditingCategory({ ...editingCategory, description: e.target.value })
                  }
                  className="w-full px-3.5 py-2 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] bg-white resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Thứ tự hiển thị</label>
                  <input
                    type="number"
                    min={1}
                    value={editingCategory.sort_order ?? 1}
                    onChange={(e) =>
                      setEditingCategory({
                        ...editingCategory,
                        sort_order: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[#F0E5D8] text-xs font-bold outline-none bg-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Trạng thái</label>
                  <select
                    value={editingCategory.status}
                    onChange={(e) =>
                      setEditingCategory({
                        ...editingCategory,
                        status: e.target.value as any,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[#F0E5D8] text-xs font-semibold text-[#342A24] bg-white outline-none"
                  >
                    <option value="active">Đang dùng</option>
                    <option value="draft">Tạm ẩn</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-[#F0E5D8]">
                <button
                  type="button"
                  onClick={() => setEditingCategory(null)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs shadow-xs cursor-pointer transition-colors"
                >
                  Lưu thay đổi ➔
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Xác nhận xóa danh mục */}
      {deletingCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 border border-[#F0E5D8] shadow-2xl space-y-4 text-center animate-in zoom-in-95">
            <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="font-heading font-extrabold text-base text-[#231B16]">
              Xác nhận xóa danh mục?
            </h3>
            <p className="text-xs text-[#7E7068] leading-relaxed">
              Bạn có chắc chắn muốn xóa danh mục <strong>&quot;{deletingCategory.name}&quot;</strong>?
            </p>

            {(productCountByCat.get(deletingCategory.category_id) || 0) > 0 && (
              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 text-left space-y-1">
                <span className="font-bold block">⚠️ Lưu ý an toàn dữ liệu:</span>
                <span>
                  Hiện có <strong>{productCountByCat.get(deletingCategory.category_id)}</strong> sản phẩm thuộc danh mục này. Khi xóa, các sản phẩm sẽ được tự động chuyển về danh mục đầu tiên để không bị gián đoạn bán hàng.
                </span>
              </div>
            )}

            <div className="flex items-center justify-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeletingCategory(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-xs cursor-pointer transition-colors"
              >
                Xác nhận xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
