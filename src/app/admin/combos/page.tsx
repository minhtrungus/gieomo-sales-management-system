"use client";

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import { MOCK_PRODUCTS } from "@/lib/data/mockData";
import {
  getStoredProducts,
  getStoredCombos,
  saveNewCombo,
  updateStoredCombo,
  deleteStoredCombo,
  type ExtendedCombo,
  type ExtendedProduct,
} from "@/lib/data/orderStore";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { Badge } from "@/components/ui/Badge";
import { Plus, Edit3, Trash2, X, Gift, AlertTriangle, Sparkles, Image as ImageIcon, PackageCheck } from "lucide-react";

interface ComboItemSelection {
  product_id: string;
  quantity: number;
}

const COMBO_IMAGE_PRESETS = [
  { label: "Set quà tặng Mầm Mơ (Mặc định)", url: "/images/products/set_combo_1.jpg" },
  { label: "Pouch Vải & Phụ Kiện Handmade", url: "/images/products/pounch_1.png" },
  { label: "Kẹp Tóc & Đồ May Vá Mini", url: "/images/products/kep_toc.jpg" },
  { label: "Sổ Tay & Túi Mầm Mơ", url: "/images/products/so_tay.jpg" },
];

function getProductTotalStock(prod?: ExtendedProduct | null): number {
  if (!prod) return 0;
  if (prod.variants && prod.variants.length > 0) {
    return prod.variants.reduce((acc: number, v: { stock?: number }) => acc + (v.stock || 0), 0);
  }
  return 0;
}

export default function AdminCombosPage() {
  const [combos, setCombos] = useState<ExtendedCombo[]>([]);
  const [availableProducts, setAvailableProducts] = useState(getStoredProducts());

  useEffect(() => {
    setCombos(getStoredCombos());
    setAvailableProducts(getStoredProducts());

    const handleUpdate = () => {
      setCombos(getStoredCombos());
      setAvailableProducts(getStoredProducts());
    };

    window.addEventListener("gieomo_combos_updated", handleUpdate);
    window.addEventListener("gieomo_products_updated", handleUpdate);
    return () => {
      window.removeEventListener("gieomo_combos_updated", handleUpdate);
      window.removeEventListener("gieomo_products_updated", handleUpdate);
    };
  }, []);

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingCombo, setEditingCombo] = useState<ExtendedCombo | null>(null);
  const [deletingCombo, setDeletingCombo] = useState<ExtendedCombo | null>(null);

  // Form states for Create Combo
  const [name, setName] = useState("");
  const [price, setPrice] = useState<number>(180000);
  const [description, setDescription] = useState("");
  const [thumbnail, setThumbnail] = useState(COMBO_IMAGE_PRESETS[0].url);
  const [status, setStatus] = useState<"active" | "draft" | "archived">("active");
  const [featured, setFeatured] = useState(true);
  const [comboItems, setComboItems] = useState<ComboItemSelection[]>([
    { product_id: availableProducts[0]?.product_id || "prod-1", quantity: 1 },
    { product_id: availableProducts[1]?.product_id || "prod-2", quantity: 1 },
    { product_id: availableProducts[4]?.product_id || availableProducts[2]?.product_id || "prod-3", quantity: 1 },
  ]);

  // Form states for Edit Combo
  const [editComboItems, setEditComboItems] = useState<ComboItemSelection[]>([]);

  // Add item row in create modal
  const handleAddItemToCreate = () => {
    setComboItems([
      ...comboItems,
      { product_id: availableProducts[0]?.product_id || MOCK_PRODUCTS[0]?.product_id || "prod-1", quantity: 1 },
    ]);
  };

  // Remove item row in create modal
  const handleRemoveItemFromCreate = (index: number) => {
    if (comboItems.length <= 1) return;
    setComboItems(comboItems.filter((_, i) => i !== index));
  };

  // Add item row in edit modal
  const handleAddItemToEdit = () => {
    setEditComboItems([
      ...editComboItems,
      { product_id: availableProducts[0]?.product_id || MOCK_PRODUCTS[0]?.product_id || "prod-1", quantity: 1 },
    ]);
  };

  // Remove item row in edit modal
  const handleRemoveItemFromEdit = (index: number) => {
    if (editComboItems.length <= 1) return;
    setEditComboItems(editComboItems.filter((_, i) => i !== index));
  };

  const openEditModal = (cb: ExtendedCombo) => {
    setEditingCombo({
      ...cb,
      status: cb.status || "active",
      featured: cb.featured ?? true,
      thumbnail: cb.thumbnail || cb.images?.[0] || COMBO_IMAGE_PRESETS[0].url,
    });
    if (cb.items && cb.items.length > 0) {
      setEditComboItems(
        cb.items.map((it: any) => ({
          product_id: it.product.product_id,
          quantity: it.quantity,
        }))
      );
    } else {
      setEditComboItems([
        { product_id: availableProducts[0]?.product_id || "prod-1", quantity: 1 },
        { product_id: availableProducts[1]?.product_id || "prod-2", quantity: 1 },
      ]);
    }
  };

  // Real-time calculations for Create Modal
  const createRetailTotal = useMemo(() => {
    return comboItems.reduce((sum, item) => {
      const prod = availableProducts.find((p) => p.product_id === item.product_id);
      return sum + (prod?.price || 0) * item.quantity;
    }, 0);
  }, [comboItems, availableProducts]);

  const createSavings = Math.max(0, createRetailTotal - price);
  const createSavingsPercent = createRetailTotal > 0 ? Math.round((createSavings / createRetailTotal) * 100) : 0;

  const createVirtualStock = useMemo(() => {
    if (comboItems.length === 0) return 0;
    const stocks = comboItems.map((item) => {
      const prod = availableProducts.find((p) => p.product_id === item.product_id);
      const stock = getProductTotalStock(prod);
      return Math.floor(stock / Math.max(1, item.quantity));
    });
    return Math.max(0, Math.min(...stocks));
  }, [comboItems, availableProducts]);

  // Real-time calculations for Edit Modal
  const editRetailTotal = useMemo(() => {
    return editComboItems.reduce((sum, item) => {
      const prod = availableProducts.find((p) => p.product_id === item.product_id);
      return sum + (prod?.price || 0) * item.quantity;
    }, 0);
  }, [editComboItems, availableProducts]);

  const editSavings = editingCombo ? Math.max(0, editRetailTotal - editingCombo.price) : 0;
  const editSavingsPercent = editRetailTotal > 0 ? Math.round((editSavings / editRetailTotal) * 100) : 0;

  const editVirtualStock = useMemo(() => {
    if (editComboItems.length === 0) return 0;
    const stocks = editComboItems.map((item) => {
      const prod = availableProducts.find((p) => p.product_id === item.product_id);
      const stock = getProductTotalStock(prod);
      return Math.floor(stock / Math.max(1, item.quantity));
    });
    return Math.max(0, Math.min(...stocks));
  }, [editComboItems, availableProducts]);

  // Virtual stock calculation for table row
  const getComboVirtualStock = (cb: ExtendedCombo) => {
    if (!cb.items || cb.items.length === 0) return 0;
    const stocks = cb.items.map((it: any) => {
      const prod = availableProducts.find((p) => p.product_id === it.product?.product_id);
      const stock = getProductTotalStock(prod ?? it.product);
      return Math.floor(stock / Math.max(1, it.quantity));
    });
    return Math.max(0, Math.min(...stocks));
  };

  const getComboRetailTotal = (cb: ExtendedCombo) => {
    if (!cb.items || cb.items.length === 0) return cb.price;
    return cb.items.reduce((sum: number, it: any) => {
      const prod = availableProducts.find((p) => p.product_id === it.product?.product_id);
      return sum + ((prod?.price ?? it.product?.price ?? 0) * it.quantity);
    }, 0);
  };

  // Add Combo Submit
  const handleCreateCombo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || comboItems.length === 0) return;

    const slug = name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[đĐ]/g, "d")
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");

    const mappedItems = comboItems.map((item) => {
      const p =
        availableProducts.find((prod) => prod.product_id === item.product_id) ||
        MOCK_PRODUCTS.find((prod) => prod.product_id === item.product_id) ||
        MOCK_PRODUCTS[0];
      return {
        product: p,
        quantity: item.quantity,
      };
    });

    const newCb: ExtendedCombo = {
      combo_id: `combo-${Date.now()}`,
      name,
      slug,
      price,
      description,
      status,
      featured,
      sort_order: combos.length + 1,
      thumbnail,
      images: [thumbnail],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      items: mappedItems,
    };

    saveNewCombo(newCb);
    setCombos(getStoredCombos());
    setIsAddModalOpen(false);
    setName("");
    setDescription("");
    setThumbnail(COMBO_IMAGE_PRESETS[0].url);
    setStatus("active");
    setFeatured(true);
    setComboItems([
      { product_id: availableProducts[0]?.product_id || "prod-1", quantity: 1 },
      { product_id: availableProducts[1]?.product_id || "prod-2", quantity: 1 },
    ]);
  };

  // Save Edit Combo Submit
  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCombo) return;

    const mappedItems = editComboItems.map((item) => {
      const p =
        availableProducts.find((prod) => prod.product_id === item.product_id) ||
        MOCK_PRODUCTS.find((prod) => prod.product_id === item.product_id) ||
        MOCK_PRODUCTS[0];
      return {
        product: p,
        quantity: item.quantity,
      };
    });

    const currentThumb = editingCombo.thumbnail || editingCombo.images?.[0] || COMBO_IMAGE_PRESETS[0].url;

    const updated: ExtendedCombo = {
      ...editingCombo,
      items: mappedItems,
      thumbnail: currentThumb,
      images: [currentThumb],
      updated_at: new Date().toISOString(),
    };

    updateStoredCombo(updated);
    setCombos(getStoredCombos());
    setEditingCombo(null);
  };

  // Delete Combo
  const handleConfirmDelete = () => {
    if (!deletingCombo) return;
    deleteStoredCombo(deletingCombo.combo_id);
    setCombos(getStoredCombos());
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
            Tạo và cấu hình các bộ quà tặng may vá ghép từ nhiều sản phẩm (2, 3 hoặc nhiều món) với mức giá ưu đãi và tính toán tiết kiệm tự động.
          </p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="px-5 py-2.5 rounded-full bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-xs flex items-center gap-2 shadow-xs transition-all border border-[#9ed4a3] active:scale-95 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Thêm Set Combo mới</span>
        </button>
      </div>

      {/* Combos Table */}
      <div className="bg-white rounded-3xl border border-[#F0E5D8] shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-[#FFF8EE] border-b border-[#F0E5D8] text-[#7E7068] font-bold uppercase tracking-wider">
                <th className="py-3.5 px-5">Tên Set Combo</th>
                <th className="py-3.5 px-4">Sản phẩm thành phần ghép</th>
                <th className="py-3.5 px-4">Giá trọn gói</th>
                <th className="py-3.5 px-4 text-center">Tồn kho khả dụng</th>
                <th className="py-3.5 px-4 text-center">Trạng thái</th>
                <th className="py-3.5 px-5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0E5D8]">
              {combos.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-500">
                    Chưa có Set Combo nào được tạo. Hãy nhấn &quot;Thêm Set Combo mới&quot; để bắt đầu.
                  </td>
                </tr>
              ) : (
                combos.map((cb) => {
                  const vStock = getComboVirtualStock(cb);
                  const retailTot = getComboRetailTotal(cb);
                  const saveAmt = Math.max(0, retailTot - cb.price);
                  const savePct = retailTot > 0 ? Math.round((saveAmt / retailTot) * 100) : 0;
                  const thumb = cb.thumbnail || cb.images?.[0] || COMBO_IMAGE_PRESETS[0].url;

                  return (
                    <tr key={cb.combo_id} className="hover:bg-[#FFFDF9] transition-colors">
                      <td className="py-3.5 px-5 flex items-center gap-3">
                        <div className="relative w-12 h-12 rounded-2xl bg-[#FFF8EE] border border-[#F0E5D8] overflow-hidden shrink-0 flex items-center justify-center text-lg shadow-2xs">
                          {thumb ? (
                            <Image src={thumb} alt={cb.name} fill className="object-cover" />
                          ) : (
                            <span>🎁</span>
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-[#342A24] block text-sm">{cb.name}</span>
                            {cb.featured && (
                              <span className="px-1.5 py-0.2 rounded-md bg-amber-100 text-amber-900 text-[10px] font-bold">
                                ⭐ Nổi bật
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-[#A89B92] font-mono">/{cb.slug}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap items-center gap-1.5 py-1">
                          {cb.items?.map((it: any, idx: number) => (
                            <span key={idx} className="inline-flex items-center gap-1">
                              <span className="px-2 py-0.5 rounded-lg bg-[#FFF8EE] border border-[#F0E5D8] font-semibold text-[#342A24] text-[11px]">
                                {it.product?.name || "Sản phẩm"}{" "}
                                <strong className="text-[#2D6338]">×{it.quantity}</strong>
                              </span>
                              {idx < (cb.items?.length || 0) - 1 && (
                                <span className="w-4 h-4 rounded-full bg-[#FFE7A8] text-[#542B07] font-black flex items-center justify-center text-[10px] shadow-2xs border border-[#ebd089]">
                                  +
                                </span>
                              )}
                            </span>
                          ))}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <MoneyDisplay amount={cb.price} className="font-extrabold text-[#1B3622] text-sm block" />
                        {saveAmt > 0 && (
                          <span className="text-[10.5px] text-amber-700 font-bold block">
                            Tiết kiệm {saveAmt.toLocaleString("vi-VN")}đ ({savePct}%)
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-bold text-[11px] ${
                            vStock === 0
                              ? "bg-red-100 text-red-700"
                              : vStock < 5
                              ? "bg-amber-100 text-amber-800"
                              : "bg-[#EAF7ED] text-[#16381D]"
                          }`}
                        >
                          <PackageCheck className="w-3 h-3" />
                          <span>{vStock} bộ khả dụng</span>
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        {cb.status === "active" || !cb.status ? (
                          <Badge variant="brand">Đang bán</Badge>
                        ) : cb.status === "draft" ? (
                          <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-[10.5px] font-bold border border-gray-200">
                            Bản nháp
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-[10.5px] font-bold border border-red-200">
                            Ngừng bán
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openEditModal(cb)}
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
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: THÊM COMBO MỚI (ĐA SẢN PHẨM & TÍNH TOÁN GIÁ TRỊ) */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-lg bg-white rounded-3xl p-6 sm:p-7 border border-[#F0E5D8] shadow-2xl space-y-4 text-left max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#F0E5D8] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#BFE9C3] flex items-center justify-center text-[#16381D]">
                  <Gift className="w-4 h-4" />
                </div>
                <h3 className="font-heading font-extrabold text-lg text-[#231B16]">
                  Thêm Set Combo quà tặng mới
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

            <form onSubmit={handleCreateCombo} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-[#342A24] block">Tên Set Combo *</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Combo Gieo Mầm Yêu Thương"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] bg-white"
                />
              </div>

              {/* Thumbnail Selector */}
              <div className="space-y-1.5">
                <label className="font-bold text-[#342A24] block flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-emerald-800" />
                  <span>Ảnh đại diện Set Combo *</span>
                </label>
                <div className="flex items-center gap-3">
                  <div className="relative w-14 h-14 rounded-2xl bg-[#FFF8EE] border border-[#F0E5D8] overflow-hidden shrink-0">
                    <Image src={thumbnail} alt="Preview" fill className="object-cover" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <select
                      value={thumbnail}
                      onChange={(e) => setThumbnail(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-[#F0E5D8] text-xs font-semibold text-[#342A24] bg-white outline-none"
                    >
                      {COMBO_IMAGE_PRESETS.map((p, idx) => (
                        <option key={idx} value={p.url}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="Hoặc dán URL ảnh tùy chỉnh..."
                      value={thumbnail}
                      onChange={(e) => setThumbnail(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-xl border border-[#F0E5D8] text-[11px] text-gray-600 bg-[#FFFDF9] outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Price & Status Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Giá bán trọn gói (VNĐ) *</label>
                  <input
                    type="number"
                    required
                    value={price}
                    onChange={(e) => setPrice(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] font-bold text-[#1B3622] bg-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Trạng thái mở bán *</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] font-bold text-[#342A24] bg-white"
                  >
                    <option value="active">Đang mở bán (Active)</option>
                    <option value="draft">Bản nháp (Draft)</option>
                    <option value="archived">Tạm ngừng bán (Archived)</option>
                  </select>
                </div>
              </div>

              {/* Featured Checkbox */}
              <div className="p-2.5 rounded-2xl bg-amber-50/70 border border-amber-200">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={featured}
                    onChange={(e) => setFeatured(e.target.checked)}
                    className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-amber-950">
                    ⭐ Đưa lên khu vực nổi bật trên Trang chủ (Hero Showcase)
                  </span>
                </label>
              </div>

              {/* Dynamic Items Builder */}
              <div className="space-y-2 border-t border-[#F0E5D8] pt-3">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-[#342A24] block">
                    Sản phẩm thành phần trong Combo ({comboItems.length} món):
                  </label>
                  <button
                    type="button"
                    onClick={handleAddItemToCreate}
                    className="px-2.5 py-1 rounded-lg bg-[#FFE7A8] hover:bg-[#ffd980] text-[#542B07] font-extrabold text-[11px] flex items-center gap-1 transition-colors cursor-pointer border border-[#ebd089]"
                  >
                    <Plus className="w-3.5 h-3.5" /> Thêm món vào Combo
                  </button>
                </div>

                <div className="space-y-2">
                  {comboItems.map((item, index) => {
                    const currentProd = availableProducts.find((p) => p.product_id === item.product_id);
                    const prodStock = getProductTotalStock(currentProd);

                    return (
                      <div key={index} className="flex items-center gap-2 bg-[#FFF8EE] p-2.5 rounded-2xl border border-[#F0E5D8]">
                        <span className="w-5 h-5 rounded-full bg-[#BFE9C3] text-[#16381D] font-extrabold flex items-center justify-center text-[10px] shrink-0">
                          {index + 1}
                        </span>

                        <select
                          value={item.product_id}
                          onChange={(e) => {
                            const updated = [...comboItems];
                            updated[index].product_id = e.target.value;
                            setComboItems(updated);
                          }}
                          className="flex-1 px-2.5 py-1.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] bg-white text-[#342A24] font-semibold"
                        >
                          {availableProducts.map((p) => (
                            <option key={p.product_id} value={p.product_id}>
                              {p.name} ({p.price.toLocaleString("vi-VN")}đ · Kho: {getProductTotalStock(p)})
                            </option>
                          ))}
                        </select>

                        <div className="flex items-center gap-1">
                          <span className="text-[11px] text-[#7E7068] font-bold">SL:</span>
                          <input
                            type="number"
                            min={1}
                            max={50}
                            value={item.quantity}
                            onChange={(e) => {
                              const updated = [...comboItems];
                              updated[index].quantity = Math.max(1, Number(e.target.value));
                              setComboItems(updated);
                            }}
                            className="w-14 px-2 py-1.5 rounded-xl border border-[#F0E5D8] text-xs font-bold text-center bg-white"
                          />
                        </div>

                        {comboItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveItemFromCreate(index)}
                            className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-white transition-colors cursor-pointer"
                            title="Xóa món này"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Real-time Value Calculation Card */}
                <div className="p-3.5 rounded-2xl bg-emerald-50/80 border border-emerald-200 text-xs space-y-1.5">
                  <div className="flex items-center justify-between text-[#16381D] font-bold">
                    <span>Tổng giá trị mua lẻ từng món:</span>
                    <span>{createRetailTotal.toLocaleString("vi-VN")}đ</span>
                  </div>
                  <div className="flex items-center justify-between text-[#16381D] font-bold">
                    <span>Giá bán trọn gói Combo:</span>
                    <span className="text-emerald-800 font-extrabold text-sm">{price.toLocaleString("vi-VN")}đ</span>
                  </div>
                  <div className="flex items-center justify-between text-amber-800 font-extrabold border-t border-emerald-200/60 pt-1.5">
                    <span>Ưu đãi tiết kiệm cho người mua:</span>
                    <span>
                      {createSavings > 0
                        ? `${createSavings.toLocaleString("vi-VN")}đ (Tiết kiệm ${createSavingsPercent}%)`
                        : "Giá bằng mua lẻ"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[#2D6338] font-semibold text-[11px]">
                    <span>Ước tính tồn kho khả dụng tối đa:</span>
                    <span className="font-extrabold text-[#16381D]">{createVirtualStock} bộ Combo</span>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#342A24] block">Mô tả Set Combo</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Gồm 1 túi Pouch, 1 kẹp tóc handmade và sticker pack..."
                  className="w-full px-3.5 py-2 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] resize-none bg-white"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-full bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-xs shadow-xs border border-[#9ed4a3] transition-all cursor-pointer"
                >
                  Tạo Set Combo ➔
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SỬA COMBO (ĐA SẢN PHẨM & CẬP NHẬT ĐẦY ĐỦ) */}
      {editingCombo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-lg bg-white rounded-3xl p-6 sm:p-7 border border-[#F0E5D8] shadow-2xl space-y-4 text-left max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#F0E5D8] pb-3">
              <h3 className="font-heading font-extrabold text-lg text-[#231B16]">
                Chỉnh sửa Set Combo: {editingCombo.name}
              </h3>
              <button
                type="button"
                onClick={() => setEditingCombo(null)}
                className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-[#342A24] block">Tên Combo *</label>
                <input
                  type="text"
                  required
                  value={editingCombo.name}
                  onChange={(e) => setEditingCombo({ ...editingCombo, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] bg-white"
                />
              </div>

              {/* Thumbnail Selector */}
              <div className="space-y-1.5">
                <label className="font-bold text-[#342A24] block flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-emerald-800" />
                  <span>Ảnh đại diện Set Combo *</span>
                </label>
                <div className="flex items-center gap-3">
                  <div className="relative w-14 h-14 rounded-2xl bg-[#FFF8EE] border border-[#F0E5D8] overflow-hidden shrink-0">
                    <Image
                      src={editingCombo.thumbnail || editingCombo.images?.[0] || COMBO_IMAGE_PRESETS[0].url}
                      alt="Preview"
                      fill
                      className="object-cover"
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <select
                      value={editingCombo.thumbnail || editingCombo.images?.[0] || COMBO_IMAGE_PRESETS[0].url}
                      onChange={(e) => setEditingCombo({ ...editingCombo, thumbnail: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-[#F0E5D8] text-xs font-semibold text-[#342A24] bg-white outline-none"
                    >
                      {COMBO_IMAGE_PRESETS.map((p, idx) => (
                        <option key={idx} value={p.url}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="Hoặc dán URL ảnh tùy chỉnh..."
                      value={editingCombo.thumbnail || editingCombo.images?.[0] || ""}
                      onChange={(e) => setEditingCombo({ ...editingCombo, thumbnail: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-xl border border-[#F0E5D8] text-[11px] text-gray-600 bg-[#FFFDF9] outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Price & Status Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Giá bán (VNĐ) *</label>
                  <input
                    type="number"
                    required
                    value={editingCombo.price}
                    onChange={(e) => setEditingCombo({ ...editingCombo, price: Number(e.target.value) })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] font-bold text-[#1B3622] bg-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Trạng thái xuất bản *</label>
                  <select
                    value={editingCombo.status || "active"}
                    onChange={(e) => setEditingCombo({ ...editingCombo, status: e.target.value as any })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] font-bold text-[#342A24] bg-white"
                  >
                    <option value="active">Đang mở bán (Active)</option>
                    <option value="draft">Bản nháp (Draft)</option>
                    <option value="archived">Tạm ngừng bán (Archived)</option>
                  </select>
                </div>
              </div>

              {/* Featured Checkbox */}
              <div className="p-2.5 rounded-2xl bg-amber-50/70 border border-amber-200">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingCombo.featured ?? true}
                    onChange={(e) => setEditingCombo({ ...editingCombo, featured: e.target.checked })}
                    className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-amber-950">
                    ⭐ Đưa lên khu vực nổi bật trên Trang chủ (Hero Showcase)
                  </span>
                </label>
              </div>

              {/* Dynamic Items Builder in Edit */}
              <div className="space-y-2 border-t border-[#F0E5D8] pt-3">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-[#342A24] block">
                    Sản phẩm thành phần ({editComboItems.length} món):
                  </label>
                  <button
                    type="button"
                    onClick={handleAddItemToEdit}
                    className="px-2.5 py-1 rounded-lg bg-[#FFE7A8] hover:bg-[#ffd980] text-[#542B07] font-extrabold text-[11px] flex items-center gap-1 transition-colors cursor-pointer border border-[#ebd089]"
                  >
                    <Plus className="w-3.5 h-3.5" /> Thêm món vào Combo
                  </button>
                </div>

                <div className="space-y-2">
                  {editComboItems.map((item, index) => (
                    <div key={index} className="flex items-center gap-2 bg-[#FFF8EE] p-2.5 rounded-2xl border border-[#F0E5D8]">
                      <span className="w-5 h-5 rounded-full bg-[#BFE9C3] text-[#16381D] font-extrabold flex items-center justify-center text-[10px] shrink-0">
                        {index + 1}
                      </span>

                      <select
                        value={item.product_id}
                        onChange={(e) => {
                          const updated = [...editComboItems];
                          updated[index].product_id = e.target.value;
                          setEditComboItems(updated);
                        }}
                        className="flex-1 px-2.5 py-1.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] bg-white text-[#342A24] font-semibold"
                      >
                        {availableProducts.map((p) => (
                          <option key={p.product_id} value={p.product_id}>
                            {p.name} ({p.price.toLocaleString("vi-VN")}đ · Kho: {getProductTotalStock(p)})
                          </option>
                        ))}
                      </select>

                      <div className="flex items-center gap-1">
                        <span className="text-[11px] text-[#7E7068] font-bold">SL:</span>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={item.quantity}
                          onChange={(e) => {
                            const updated = [...editComboItems];
                            updated[index].quantity = Math.max(1, Number(e.target.value));
                            setEditComboItems(updated);
                          }}
                          className="w-14 px-2 py-1.5 rounded-xl border border-[#F0E5D8] text-xs font-bold text-center bg-white"
                        />
                      </div>

                      {editComboItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItemFromEdit(index)}
                          className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-white transition-colors cursor-pointer"
                          title="Xóa món này"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Real-time Value Calculation Card for Edit */}
                <div className="p-3.5 rounded-2xl bg-emerald-50/80 border border-emerald-200 text-xs space-y-1.5">
                  <div className="flex items-center justify-between text-[#16381D] font-bold">
                    <span>Tổng giá trị mua lẻ từng món:</span>
                    <span>{editRetailTotal.toLocaleString("vi-VN")}đ</span>
                  </div>
                  <div className="flex items-center justify-between text-[#16381D] font-bold">
                    <span>Giá bán trọn gói Combo:</span>
                    <span className="text-emerald-800 font-extrabold text-sm">{editingCombo.price.toLocaleString("vi-VN")}đ</span>
                  </div>
                  <div className="flex items-center justify-between text-amber-800 font-extrabold border-t border-emerald-200/60 pt-1.5">
                    <span>Ưu đãi tiết kiệm cho người mua:</span>
                    <span>
                      {editSavings > 0
                        ? `${editSavings.toLocaleString("vi-VN")}đ (Tiết kiệm ${editSavingsPercent}%)`
                        : "Giá bằng mua lẻ"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[#2D6338] font-semibold text-[11px]">
                    <span>Ước tính tồn kho khả dụng tối đa:</span>
                    <span className="font-extrabold text-[#16381D]">{editVirtualStock} bộ Combo</span>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#342A24] block">Mô tả Combo</label>
                <textarea
                  rows={2}
                  value={editingCombo.description ?? ""}
                  onChange={(e) => setEditingCombo({ ...editingCombo, description: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] resize-none bg-white"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditingCombo(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-full bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-xs shadow-xs border border-[#9ed4a3] transition-all cursor-pointer"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 border border-[#F0E5D8] shadow-2xl space-y-4 text-center">
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
                className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-5 py-2.5 rounded-full bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs shadow-xs cursor-pointer"
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
