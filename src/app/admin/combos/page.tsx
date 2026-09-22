"use client";

import { useState } from "react";
import Image from "next/image";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { MOCK_COMBOS, MOCK_PRODUCTS } from "@/lib/data/mockData";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { Badge } from "@/components/ui/Badge";
import { Plus, Edit3, Trash2, X, Gift, AlertTriangle } from "lucide-react";

export default function AdminCombosPage() {
  const [combos, setCombos] = useState(MOCK_COMBOS);

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingCombo, setEditingCombo] = useState<(typeof MOCK_COMBOS)[0] | null>(null);
  const [deletingCombo, setDeletingCombo] = useState<(typeof MOCK_COMBOS)[0] | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [price, setPrice] = useState<number>(180000);
  const [description, setDescription] = useState("");
  const [selectedProduct1, setSelectedProduct1] = useState(MOCK_PRODUCTS[0].product_id);
  const [selectedProduct2, setSelectedProduct2] = useState(MOCK_PRODUCTS[1].product_id);

  // Add Combo
  const handleCreateCombo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    const slug = name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[đĐ]/g, "d")
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");

    const p1 = MOCK_PRODUCTS.find((p) => p.product_id === selectedProduct1) || MOCK_PRODUCTS[0];
    const p2 = MOCK_PRODUCTS.find((p) => p.product_id === selectedProduct2) || MOCK_PRODUCTS[1];

    const newCb = {
      combo_id: `combo-${Date.now()}`,
      name,
      slug,
      price,
      description,
      status: "active" as const,
      featured: true,
      sort_order: combos.length + 1,
      thumbnail: "/images/products/set_combo_1.jpg",
      images: ["/images/products/set_combo_1.jpg"],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      items: [
        { product: p1, quantity: 1 },
        { product: p2, quantity: 1 },
      ],
    };

    setCombos([newCb, ...combos]);
    setIsAddModalOpen(false);
    setName("");
    setDescription("");
  };

  // Save Edit Combo
  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCombo) return;

    setCombos((prev) =>
      prev.map((c) => (c.combo_id === editingCombo.combo_id ? editingCombo : c))
    );
    setEditingCombo(null);
  };

  // Delete Combo
  const handleConfirmDelete = () => {
    if (!deletingCombo) return;
    setCombos((prev) => prev.filter((c) => c.combo_id !== deletingCombo.combo_id));
    setDeletingCombo(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-[#231B16]">
            Quản lý Set Combo quà tặng
          </h1>
          <p className="text-xs text-[#7E7068] mt-0.5">
            Tạo và cấu hình các bộ quà tặng may vá ghép từ nhiều sản phẩm với mức giá ưu đãi.
          </p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="px-5 py-2.5 rounded-full bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-xs flex items-center gap-2 shadow-xs transition-all border border-[#9ed4a3] active:scale-95 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>+ Thêm Set Combo mới</span>
        </button>
      </div>

      {/* Combos Table */}
      <div className="bg-white rounded-3xl border border-[#F0E5D8] shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-[#FFF8EE] border-b border-[#F0E5D8] text-[#7E7068] font-bold uppercase tracking-wider">
                <th className="py-3.5 px-5">Tên Set Combo</th>
                <th className="py-3.5 px-4">Sản phẩm thành phần</th>
                <th className="py-3.5 px-4">Giá Combo</th>
                <th className="py-3.5 px-4">Trạng thái</th>
                <th className="py-3.5 px-5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0E5D8]">
              {combos.map((cb) => (
                <tr key={cb.combo_id} className="hover:bg-[#FFFDF9] transition-colors">
                  <td className="py-3.5 px-5 flex items-center gap-3">
                    <div className="relative w-12 h-12 rounded-2xl bg-[#FFF8EE] border border-[#F0E5D8] overflow-hidden shrink-0 flex items-center justify-center text-lg shadow-2xs">
                      {cb.images?.[0] ? (
                        <Image src={cb.images[0]} alt="" fill className="object-cover" />
                      ) : (
                        <span>🎁</span>
                      )}
                    </div>
                    <div>
                      <span className="font-bold text-[#342A24] block text-sm">{cb.name}</span>
                      <span className="text-[11px] text-[#A89B92] font-mono">/{cb.slug}</span>
                    </div>
                  </td>

                  <td className="py-3.5 px-4">
                    <ul className="list-disc list-inside text-[11px] text-[#5C4D44] space-y-0.5">
                      {cb.items?.map((it, idx) => (
                        <li key={idx}>
                          {it.product.name} (x{it.quantity})
                        </li>
                      ))}
                    </ul>
                  </td>

                  <td className="py-3.5 px-4">
                    <MoneyDisplay amount={cb.price} className="font-extrabold text-[#1B3622] text-sm" />
                  </td>

                  <td className="py-3.5 px-4">
                    <Badge variant="brand">Đang bán</Badge>
                  </td>

                  <td className="py-3.5 px-5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => setEditingCombo(cb)}
                        className="p-1.5 rounded-xl text-[#7E7068] hover:text-[#2D6338] hover:bg-[#BFE9C3]/30 transition-colors cursor-pointer"
                        title="Sửa Combo"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeletingCombo(cb)}
                        className="p-1.5 rounded-xl text-[#7E7068] hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                        title="Xóa Combo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: THÊM COMBO MỚI */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-7 border border-[#F0E5D8] shadow-2xl space-y-5 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-[#F0E5D8] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#BFE9C3] flex items-center justify-center text-[#16381D]">
                  <Gift className="w-4 h-4" />
                </div>
                <h3 className="font-heading font-extrabold text-lg text-[#231B16]">
                  Thêm Set Combo mới
                </h3>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCombo} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-[#342A24] block">Tên Set Combo *</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Combo Gieo Mầm Yêu Thương"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A]"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#342A24] block">Giá bán trọn gói (VNĐ) *</label>
                <input
                  type="number"
                  required
                  value={price}
                  onChange={(e) => setPrice(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#342A24] block">Sản phẩm ghép 1 *</label>
                <select
                  value={selectedProduct1}
                  onChange={(e) => setSelectedProduct1(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] bg-white text-[#342A24]"
                >
                  {MOCK_PRODUCTS.map((p) => (
                    <option key={p.product_id} value={p.product_id}>
                      {p.name} ({p.price.toLocaleString("vi-VN")}đ)
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#342A24] block">Sản phẩm ghép 2 *</label>
                <select
                  value={selectedProduct2}
                  onChange={(e) => setSelectedProduct2(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] bg-white text-[#342A24]"
                >
                  {MOCK_PRODUCTS.map((p) => (
                    <option key={p.product_id} value={p.product_id}>
                      {p.name} ({p.price.toLocaleString("vi-VN")}đ)
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#342A24] block">Mô tả Set Combo</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Gồm 1 túi Pouch và 1 kẹp tóc handmade..."
                  className="w-full px-3.5 py-2 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] resize-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-xs shadow-xs border border-[#9ed4a3]"
                >
                  Tạo Set Combo ➔
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SỬA COMBO */}
      {editingCombo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-7 border border-[#F0E5D8] shadow-2xl space-y-5 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-[#F0E5D8] pb-3">
              <h3 className="font-heading font-extrabold text-lg text-[#231B16]">
                Chỉnh sửa Set Combo
              </h3>
              <button
                onClick={() => setEditingCombo(null)}
                className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-[#342A24] block">Tên Combo *</label>
                <input
                  type="text"
                  required
                  value={editingCombo.name}
                  onChange={(e) => setEditingCombo({ ...editingCombo, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A]"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#342A24] block">Giá bán (VNĐ) *</label>
                <input
                  type="number"
                  required
                  value={editingCombo.price}
                  onChange={(e) => setEditingCombo({ ...editingCombo, price: Number(e.target.value) })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#342A24] block">Mô tả Combo</label>
                <textarea
                  rows={2}
                  value={editingCombo.description ?? ""}
                  onChange={(e) => setEditingCombo({ ...editingCombo, description: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] resize-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditingCombo(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100"
                >
                  Hủy
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

      {/* MODAL: XÓA COMBO */}
      {deletingCombo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 border border-[#F0E5D8] shadow-2xl space-y-4 text-center animate-in zoom-in-95">
            <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="font-heading font-extrabold text-lg text-[#231B16]">
              Xóa Set Combo này?
            </h3>
            <p className="text-xs text-[#7E7068] leading-relaxed">
              Bạn có chắc muốn xóa <strong>&quot;{deletingCombo.name}&quot;</strong>? Thao tác này sẽ gỡ Combo khỏi trang bán hàng.
            </p>

            <div className="flex items-center justify-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeletingCombo(null)}
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
