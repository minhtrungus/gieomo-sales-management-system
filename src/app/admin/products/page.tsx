"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { Badge } from "@/components/ui/Badge";
import { MOCK_PRODUCTS, MOCK_CATEGORIES, ExtendedProduct } from "@/lib/data/mockData";
import { Plus, Search, Edit3, Trash2, X, Check, AlertTriangle, Upload, Eye } from "lucide-react";

export default function AdminProductsPage() {
  const [products, setProducts] = useState<ExtendedProduct[]>(MOCK_PRODUCTS);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  // Modal States
  const [editingProduct, setEditingProduct] = useState<ExtendedProduct | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<ExtendedProduct | null>(null);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);

  // Quick Add Form States
  const [addName, setAddName] = useState("");
  const [addPrice, setAddPrice] = useState<number>(85000);
  const [addCostPrice, setAddCostPrice] = useState<number>(35000);
  const [addStock, setAddStock] = useState<number>(20);
  const [addCategory, setAddCategory] = useState("cat-1");
  const [addImageUrl, setAddImageUrl] = useState("/images/products/pounch_1.png");

  const filteredProducts = products.filter((p) => {
    if (selectedCategory !== "all" && p.category?.category_id !== selectedCategory) {
      return false;
    }
    if (
      searchQuery.trim() !== "" &&
      !p.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !p.slug.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  // Toggle active/draft status
  const handleToggleStatus = (productId: string) => {
    setProducts((prev) =>
      prev.map((p) =>
        p.product_id === productId
          ? { ...p, status: p.status === "active" ? "draft" : "active" }
          : p
      )
    );
  };

  // Save edited product
  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    setProducts((prev) =>
      prev.map((p) => (p.product_id === editingProduct.product_id ? editingProduct : p))
    );
    setEditingProduct(null);
  };

  // Confirm delete product
  const handleConfirmDelete = () => {
    if (!deletingProduct) return;
    setProducts((prev) => prev.filter((p) => p.product_id !== deletingProduct.product_id));
    setDeletingProduct(null);
  };

  // Handle Quick Add Product
  const handleQuickAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addName) return;

    const slug = addName
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[đĐ]/g, "d")
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");

    const categoryObj = MOCK_CATEGORIES.find((c) => c.category_id === addCategory) || MOCK_CATEGORIES[0];

    const newProd: ExtendedProduct = {
      product_id: `prod-${Date.now()}`,
      name: addName,
      slug,
      short_description: `Sản phẩm ${addName} handmade gây quỹ Mầm Mơ`,
      description: `Chi tiết sản phẩm ${addName}`,
      price: addPrice,
      compare_at_price: null,
      cost_price: addCostPrice,
      status: "active",
      featured: false,
      sort_order: products.length + 1,
      weight_gram: 100,
      thumbnail: addImageUrl,
      category_id: addCategory,
      category: categoryObj,
      images: [addImageUrl],
      variants: [
        {
          variant_id: `var-${Date.now()}`,
          product_id: `prod-${Date.now()}`,
          name: "Mặc định",
          sku: `GM-${slug.toUpperCase().slice(0, 8)}`,
          stock: addStock,
          price: null,
          compare_at_price: null,
          cost_price: null,
          weight_gram: 100,
          status: "active",
          sort_order: 1,
          created_at: new Date().toISOString(),
        },
      ],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setProducts([newProd, ...products]);
    setIsQuickAddOpen(false);

    // Reset Form
    setAddName("");
    setAddPrice(85000);
    setAddCostPrice(35000);
    setAddStock(20);
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
            Xem danh sách, thêm mới, sửa giá, kiểm soát tồn kho và cập nhật trạng thái sản phẩm.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsQuickAddOpen(true)}
            className="px-4 py-2.5 rounded-full bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-xs flex items-center gap-1.5 shadow-xs transition-all border border-[#9ed4a3] active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm nhanh sản phẩm</span>
          </button>

          <Link
            href="/admin/products/new"
            className="px-4 py-2.5 rounded-full bg-[#1B3622] hover:bg-[#132819] text-white font-extrabold text-xs flex items-center gap-1.5 shadow-xs transition-all active:scale-95"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Thêm chi tiết (Có upload)</span>
          </Link>
        </div>
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
          {MOCK_CATEGORIES.map((cat) => (
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
                <th className="py-2.5 px-2.5">Trạng thái</th>
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
                        className="cursor-pointer"
                        title="Bấm để đổi trạng thái"
                      >
                        <Badge variant={p.status === "active" ? "brand" : "default"} className="text-[10px] px-2 py-0.5">
                          {p.status === "active" ? "Đang bán" : "Nháp"}
                        </Badge>
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
                          onClick={() => setEditingProduct(p)}
                          className="p-1.5 rounded-xl text-[#7E7068] hover:text-[#2D6338] hover:bg-[#BFE9C3]/30 transition-colors cursor-pointer"
                          title="Sửa sản phẩm"
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
          MODAL 1: CHỈNH SỬA SẢN PHẨM (EDIT MODAL)
          ======================================================== */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-lg bg-white rounded-3xl p-6 sm:p-7 border border-[#F0E5D8] shadow-2xl space-y-5 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-[#F0E5D8] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#BFE9C3] flex items-center justify-center text-[#16381D]">
                  <Edit3 className="w-4 h-4" />
                </div>
                <h3 className="font-heading font-extrabold text-lg text-[#231B16]">
                  Chỉnh sửa sản phẩm
                </h3>
              </div>
              <button
                onClick={() => setEditingProduct(null)}
                className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700"
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
                      const cat = MOCK_CATEGORIES.find((c) => c.category_id === e.target.value);
                      setEditingProduct({
                        ...editingProduct,
                        category_id: e.target.value,
                        category: cat,
                      });
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] bg-white font-bold text-[#342A24]"
                  >
                    {MOCK_CATEGORIES.map((c) => (
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
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#342A24] block">Số lượng tồn kho (Tổng các phân loại)</label>
                <input
                  type="number"
                  value={editingProduct.variants?.[0]?.stock ?? 10}
                  onChange={(e) => {
                    const newStock = Number(e.target.value);
                    const updatedVariants = editingProduct.variants?.map((v, i) =>
                      i === 0 ? { ...v, stock: newStock } : v
                    ) ?? [{ variant_id: "var-1", product_id: editingProduct.product_id, name: "Mặc định", sku: "GM-SKU", stock: newStock, price: null, compare_at_price: null, cost_price: null, weight_gram: 100, status: "active" as const, sort_order: 1, created_at: new Date().toISOString() }];
                    setEditingProduct({ ...editingProduct, variants: updatedVariants });
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] font-bold"
                />
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 border border-[#F0E5D8] shadow-2xl space-y-4 text-center animate-in zoom-in-95">
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

      {/* ========================================================
          MODAL 3: THÊM NHANH SẢN PHẨM (QUICK ADD MODAL)
          ======================================================== */}
      {isQuickAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-7 border border-[#F0E5D8] shadow-2xl space-y-5 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-[#F0E5D8] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#BFE9C3] flex items-center justify-center text-[#16381D]">
                  <Plus className="w-4 h-4" />
                </div>
                <h3 className="font-heading font-extrabold text-lg text-[#231B16]">
                  Thêm nhanh sản phẩm mới
                </h3>
              </div>
              <button
                onClick={() => setIsQuickAddOpen(false)}
                className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleQuickAdd} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-[#342A24] block">Tên sản phẩm *</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Pouch Vải Mầm Xanh"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Giá bán (VNĐ) *</label>
                  <input
                    type="number"
                    required
                    value={addPrice}
                    onChange={(e) => setAddPrice(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Giá vốn (Cost price)</label>
                  <input
                    type="number"
                    value={addCostPrice}
                    onChange={(e) => setAddCostPrice(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Danh mục *</label>
                  <select
                    value={addCategory}
                    onChange={(e) => setAddCategory(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] bg-white font-bold text-[#342A24]"
                  >
                    {MOCK_CATEGORIES.map((c) => (
                      <option key={c.category_id} value={c.category_id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Số lượng tồn kho ban đầu *</label>
                  <input
                    type="number"
                    required
                    value={addStock}
                    onChange={(e) => setAddStock(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] font-bold"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#342A24] block">Ảnh sản phẩm mẫu</label>
                <select
                  value={addImageUrl}
                  onChange={(e) => setAddImageUrl(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] bg-white text-[#342A24]"
                >
                  <option value="/images/products/pounch_1.png">Pouch 1 (Hồng pastel)</option>
                  <option value="/images/products/pounch_2.jpg">Pouch 2 (Xanh pastel)</option>
                  <option value="/images/products/kep_toc.jpg">Kẹp tóc Nút Áo</option>
                  <option value="/images/products/so_tay.jpg">Sổ tay May Vá</option>
                  <option value="/images/products/set_combo_1.jpg">Set Combo 1</option>
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsQuickAddOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-xs shadow-xs border border-[#9ed4a3]"
                >
                  Thêm sản phẩm ➔
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
