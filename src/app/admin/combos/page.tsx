"use client";

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import {
  getStoredProducts,
  getStoredCombos,
  syncCombosFromServer,
  syncProductsFromServer,
  saveNewCombo,
  updateStoredCombo,
  deleteStoredCombo,
  type ExtendedCombo,
  type ExtendedProduct,
} from "@/lib/data/orderStore";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { DoubleConfirmDialog } from "@/components/ui/DoubleConfirmDialog";
import { Plus, Edit3, Trash2, X, Gift, AlertTriangle, Image as ImageIcon, PackageCheck, Check, Upload, Loader2 } from "lucide-react";
import { uploadAsset } from "@/lib/services/uploadService";
import {
  getComboAvailabilityLabel,
  getComboAvailabilityStatus,
  getComboVirtualStock as calculateComboVirtualStock,
  getDefaultComboVariantId,
} from "@/lib/comboInventory";

interface ComboItemSelection {
  product_id: string;
  variant_id: string | null;
  quantity: number;
}

type ComboItemInput = NonNullable<ExtendedCombo["items"]>[number] & {
  slug?: string;
  name?: string;
  price?: number;
};

interface ResolvedAdminComboItem {
  product_id: string;
  variant_id: string | null;
  name: string;
  quantity: number;
  price: number;
  product?: ExtendedProduct;
}

const COMBO_IMAGE_PRESETS = [
  { label: "Set quà tặng Mầm Mơ (Mặc định)", url: "/images/products/set_combo_1.jpg" },
  { label: "Pouch Vải & Phụ Kiện Handmade", url: "/images/products/pounch_1.png" },
  { label: "Kẹp Tóc & Đồ May Vá Mini", url: "/images/products/kep-toc-1.jpg" },
  { label: "Túi Tote & Đồ May Mầm Mơ", url: "/images/products/tote-gieo-mo-1.jpg" },
];

function getProductTotalStock(prod?: ExtendedProduct | null): number {
  if (!prod) return 0;
  if (prod.variants && prod.variants.length > 0) {
    return prod.variants.reduce((acc: number, v: { stock?: number }) => acc + (v.stock || 0), 0);
  }
  return 0;
}

function variantLabel(v: { name?: string | null; sku?: string | null }): string {
  const name = (v.name || "").trim();
  const sku = (v.sku || "").trim();
  if (name && sku && sku !== name) return `${name} · SKU ${sku}`;
  return name || sku || "Phân loại";
}

function normalizeText(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .trim();
}

function resolveAdminComboItems(
  combo: ExtendedCombo,
  availableProducts: ExtendedProduct[]
): ResolvedAdminComboItem[] {
  if (combo.items && combo.items.length > 0) {
    return combo.items.map((it: ComboItemInput) => {
      const pId = it.product_id || it.product?.product_id;
      const pSlug = it.slug || it.product?.slug;
      const pName = it.name || it.product?.name;
      const found = availableProducts.find(
        (p) =>
          (pId && p.product_id === pId) ||
          (pSlug && p.slug === pSlug) ||
          (pName && normalizeText(p.name) === normalizeText(pName))
      );
      const qty = Math.max(1, Number(it.quantity) || 1);
      const unitPrice = found?.price ?? it.product?.price ?? it.price ?? 40000;
      return {
        product_id: found?.product_id || pId || "",
        variant_id: it.variant_id ?? null,
        name: found?.name || pName || "Sản phẩm",
        quantity: qty,
        price: unitPrice,
        product: found || it.product,
      };
    });
  }

  const desc = combo.description || "";
  const cleanedDesc = desc.replace(/^(gồm|bao gồm|set quà gồm)\s*/i, "").trim();
  if (!cleanedDesc) return [];

  const parts = cleanedDesc.split(/[+,]/);
  const items: ResolvedAdminComboItem[] = [];
  for (const part of parts) {
    const raw = part.trim();
    if (!raw) continue;
    const match = raw.match(/^(\d+)?\s*(.+)$/);
    const qty = match && match[1] ? Math.max(1, parseInt(match[1])) : 1;
    const itemName = match && match[2] ? match[2].trim() : raw;
    const norm = normalizeText(itemName);

    const foundProd = availableProducts.find((p) => {
      const pNorm = normalizeText(p.name);
      return norm.includes(pNorm) || pNorm.includes(norm);
    });

    let price = foundProd?.price;
    if (!price) {
      if (norm.includes("pouch") || norm.includes("tui")) price = 85000;
      else if (norm.includes("kep") || norm.includes("nut ao")) price = 45000;
      else if (norm.includes("keychain") || norm.includes("moc khoa")) price = 35000;
      else if (norm.includes("vo") || norm.includes("so")) price = 30000;
      else if (norm.includes("sticker")) price = 35000;
      else if (norm.includes("kim chi")) price = 65000;
      else price = 40000;
    }

    items.push({
      product_id: foundProd?.product_id || "",
      variant_id: null,
      name: foundProd?.name || itemName,
      quantity: qty,
      price,
      product: foundProd,
    });
  }
  return items;
}

export default function AdminCombosPage() {
  const [combos, setCombos] = useState<ExtendedCombo[]>([]);
  const [availableProducts, setAvailableProducts] = useState(getStoredProducts());

  useEffect(() => {
    queueMicrotask(() => {
      setCombos(getStoredCombos());
      setAvailableProducts(getStoredProducts());
    });
    syncCombosFromServer(true);
    syncProductsFromServer(true);

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
  const [isDeleting, setIsDeleting] = useState(false);

  // Quick inline rename states for combo name
  const [renamingComboId, setRenamingComboId] = useState<string | null>(null);
  const [inlineComboName, setInlineComboName] = useState("");

  // Form states for Create Combo
  const [name, setName] = useState("");
  const [price, setPrice] = useState<number>(180000);
  const [description, setDescription] = useState("");
  const [thumbnail, setThumbnail] = useState(COMBO_IMAGE_PRESETS[0].url);
  const [status, setStatus] = useState<"active" | "draft" | "archived">("active");
  const [featured, setFeatured] = useState(true);
  const [comboItems, setComboItems] = useState<ComboItemSelection[]>(() => {
    const prods = getStoredProducts();
    if (prods.length > 0) {
      return [{
        product_id: prods[0].product_id,
        variant_id: getDefaultComboVariantId(prods[0]),
        quantity: 1,
      }];
    }
    return [];
  });

  // Form states for Edit Combo
  const [editComboItems, setEditComboItems] = useState<ComboItemSelection[]>([]);

  // Image upload states
  const [uploadingCreateThumb, setUploadingCreateThumb] = useState(false);
  const [uploadingEditThumb, setUploadingEditThumb] = useState(false);

  const handleUploadComboImage = async (
    file: File,
    onSuccess: (url: string) => void,
    setLoading: (v: boolean) => void
  ) => {
    if (!file) return;
    setLoading(true);
    try {
      const res = await uploadAsset(file, "product-media");
      if (res.success && res.url) {
        onSuccess(res.url);
      } else {
        alert(`Lỗi tải ảnh: ${res.error || "Không thể tải lên"}`);
      }
    } catch (caught: unknown) {
      const err = caught as { message?: string } | null;
      alert(`Lỗi kết nối khi tải ảnh: ${err?.message || "Lỗi không xác định"}`);
    } finally {
      setLoading(false);
    }
  };

  // Add item row in create modal
  const handleAddItemToCreate = () => {
    if (availableProducts.length === 0) return;
    setComboItems([
      ...comboItems,
      {
        product_id: availableProducts[0].product_id,
        variant_id: getDefaultComboVariantId(availableProducts[0]),
        quantity: 1,
      },
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
      {
        product_id: availableProducts[0]?.product_id || "prod-custom",
        variant_id: getDefaultComboVariantId(availableProducts[0]),
        quantity: 1,
      },
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
    const resolved = resolveAdminComboItems(cb, availableProducts);
    if (resolved.length > 0) {
      setEditComboItems(
        resolved.map((it) => ({
          product_id: it.product_id || availableProducts[0]?.product_id || "prod-1",
          // Giữ nguyên mapping hiện có (kể cả null của component chưa map) —
          // không tự gán variant khi thiếu dữ liệu.
          variant_id: it.variant_id ?? null,
          quantity: it.quantity,
        }))
      );
    } else {
      setEditComboItems([
        {
          product_id: availableProducts[0]?.product_id || "prod-1",
          variant_id: getDefaultComboVariantId(availableProducts[0]),
          quantity: 1,
        },
        {
          product_id: availableProducts[1]?.product_id || "prod-2",
          variant_id: getDefaultComboVariantId(availableProducts[1]),
          quantity: 1,
        },
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

  const createVirtualStock = useMemo(
    () => calculateComboVirtualStock(comboItems, availableProducts),
    [comboItems, availableProducts]
  );

  // Real-time calculations for Edit Modal
  const editRetailTotal = useMemo(() => {
    return editComboItems.reduce((sum, item) => {
      const prod = availableProducts.find((p) => p.product_id === item.product_id);
      return sum + (prod?.price || 0) * item.quantity;
    }, 0);
  }, [editComboItems, availableProducts]);

  const editSavings = editingCombo ? Math.max(0, editRetailTotal - editingCombo.price) : 0;
  const editSavingsPercent = editRetailTotal > 0 ? Math.round((editSavings / editRetailTotal) * 100) : 0;

  const editVirtualStock = useMemo(
    () => calculateComboVirtualStock(editComboItems, availableProducts),
    [editComboItems, availableProducts]
  );

  // Virtual stock calculation for table row
  const getComboAvailability = (cb: ExtendedCombo) => {
    const items = resolveAdminComboItems(cb, availableProducts);
    return getComboAvailabilityStatus(items, availableProducts);
  };

  const getComboRetailTotal = (cb: ExtendedCombo) => {
    const items = resolveAdminComboItems(cb, availableProducts);
    if (items.length === 0) return cb.price;
    return items.reduce((sum, it) => sum + (it.price * it.quantity), 0);
  };

  // Add Combo Submit
  const handleCreateCombo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || comboItems.length === 0) return;

    // variant_id=null là lựa chọn hợp lệ: dùng tổng tồn của mọi phân loại active.
    const missingProdIdx = comboItems.findIndex(
      (it) => !availableProducts.some((p) => p.product_id === it.product_id)
    );
    if (missingProdIdx >= 0) {
      alert(`Thành phần #${missingProdIdx + 1}: không tìm thấy sản phẩm đã chọn. Vui lòng chọn lại.`);
      return;
    }

    const slug = name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[đĐ]/g, "d")
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");

    const mappedItems = comboItems.map((item) => {
      const p = availableProducts.find((prod) => prod.product_id === item.product_id)!;
      return {
        product: p,
        product_id: p.product_id,
        variant_id: item.variant_id,
        slug: p.slug,
        name: p.name,
        price: p.price,
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

    const result = await saveNewCombo(newCb);
    setCombos(getStoredCombos());
    if (!result.success) {
      // Không đóng modal, không reset form — admin thấy lỗi và lưu lại được.
      alert(
        result.kind === "network"
          ? `Không thể kết nối máy chủ — Set Combo chỉ được lưu cục bộ: ${result.error}. Vui lòng thử lưu lại khi có kết nối.`
          : `Máy chủ từ chối lưu Set Combo: ${result.error}. Vui lòng thử lại.`
      );
      return;
    }
    setIsAddModalOpen(false);
    setName("");
    setDescription("");
    setThumbnail(COMBO_IMAGE_PRESETS[0].url);
    setStatus("active");
    setFeatured(true);
    setComboItems([
      {
        product_id: availableProducts[0]?.product_id || "prod-1",
        variant_id: getDefaultComboVariantId(availableProducts[0]),
        quantity: 1,
      },
      {
        product_id: availableProducts[1]?.product_id || "prod-2",
        variant_id: getDefaultComboVariantId(availableProducts[1]),
        quantity: 1,
      },
    ]);
  };

  // Save Edit Combo Submit
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCombo) return;

    // variant_id=null là lựa chọn hợp lệ: dùng tổng tồn của mọi phân loại active.
    const missingProdIdx = editComboItems.findIndex(
      (it) => !availableProducts.some((p) => p.product_id === it.product_id)
    );
    if (missingProdIdx >= 0) {
      alert(`Thành phần #${missingProdIdx + 1}: không tìm thấy sản phẩm đã chọn. Vui lòng chọn lại.`);
      return;
    }

    const mappedItems = editComboItems.map((item) => {
      const p = availableProducts.find((prod) => prod.product_id === item.product_id)!;
      return {
        product: p,
        product_id: p.product_id,
        variant_id: item.variant_id,
        slug: p.slug,
        name: p.name,
        price: p.price,
        quantity: item.quantity,
      };
    });

    const currentThumb = editingCombo.thumbnail || editingCombo.images?.[0] || COMBO_IMAGE_PRESETS[0].url;

    const updated: ExtendedCombo = {
      ...editingCombo,
      name: (editingCombo.name || "").trim(),
      slug: (editingCombo.slug || "").trim() || (editingCombo.name || "").toLowerCase().trim().replace(/\s+/g, "-"),
      items: mappedItems,
      thumbnail: currentThumb,
      images: [currentThumb],
      updated_at: new Date().toISOString(),
    };

    // Luồng sửa thành phần: gửi items (đã map variant_id tường minh).
    const result = await updateStoredCombo(updated, { includeItems: true });
    setCombos(getStoredCombos());
    if (!result.success) {
      // Không đóng modal sửa — admin thấy lỗi và lưu lại được.
      alert(
        result.kind === "network"
          ? `Không thể kết nối máy chủ — thay đổi chỉ được lưu cục bộ: ${result.error}. Vui lòng thử lại khi có kết nối.`
          : `Máy chủ từ chối cập nhật Set Combo: ${result.error}. Vui lòng thử lại.`
      );
      return;
    }
    setEditingCombo(null);
  };

  // Delete Combo
  const handleConfirmDelete = async () => {
    if (!deletingCombo) return;
    setIsDeleting(true);
    try {
      const result = await deleteStoredCombo(deletingCombo.combo_id);
      if (!result.success) {
        alert(
          result.kind === "network"
            ? `Không thể kết nối máy chủ để xóa combo: ${result.error}. Không xác định được server đã xóa hay chưa — vui lòng kiểm tra lại.`
            : `Máy chủ từ chối xóa combo: ${result.error}. Combo chưa bị xóa.`
        );
        return;
      }
      setCombos(getStoredCombos());
    } catch {
      alert("Không thể xóa combo. Vui lòng thử lại.");
    } finally {
      setIsDeleting(false);
      setDeletingCombo(null);
    }
  };

  // Quick toggle between Active / Draft
  const handleToggleComboStatus = async (comboId: string, currentStatus?: string) => {
    const nextStatus = currentStatus === "draft" ? "active" : "draft";
    const found = combos.find((c) => c.combo_id === comboId);
    if (!found) return;
    const updated: ExtendedCombo = {
      ...found,
      status: nextStatus,
      updated_at: new Date().toISOString(),
    };
    const result = await updateStoredCombo(updated);
    setCombos(getStoredCombos());
    if (!result.success) {
      alert(
        result.kind === "network"
          ? `Không thể kết nối máy chủ — trạng thái chỉ được lưu cục bộ: ${result.error}`
          : `Máy chủ từ chối cập nhật trạng thái: ${result.error}`
      );
    }
  };

  // Quick inline rename combo name
  const handleStartRename = (cb: ExtendedCombo) => {
    setRenamingComboId(cb.combo_id);
    setInlineComboName(cb.name);
  };

  const handleCancelRename = () => {
    setRenamingComboId(null);
    setInlineComboName("");
  };

  const handleSaveInlineRename = async (comboId: string) => {
    if (!inlineComboName.trim()) return;
    const target = combos.find((c) => c.combo_id === comboId);
    if (!target) return;

    const newSlug = inlineComboName
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[đĐ]/g, "d")
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");

    const updated: ExtendedCombo = {
      ...target,
      name: inlineComboName.trim(),
      slug: newSlug || target.slug,
      updated_at: new Date().toISOString(),
    };

    const result = await updateStoredCombo(updated);
    setCombos(getStoredCombos());
    if (!result.success) {
      // Giữ ô đổi tên mở để admin sửa/lưu lại.
      alert(
        result.kind === "network"
          ? `Không thể kết nối máy chủ — tên chỉ được lưu cục bộ: ${result.error}`
          : `Máy chủ từ chối đổi tên combo: ${result.error}`
      );
      return;
    }
    setRenamingComboId(null);
    setInlineComboName("");
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
            Tạo và cấu hình các bộ quà tặng ghép từ nhiều sản phẩm với mức giá ưu đãi.
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

      {/* MOBILE CARD VIEW (< sm) */}
      <div className="block sm:hidden space-y-3">
        {combos.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 border border-[#F0E5D8] text-center text-gray-500 space-y-2 shadow-soft">
            <div className="text-3xl">🎁</div>
            <p className="font-bold text-sm text-[#231B16]">Chưa có Set Combo nào được tạo.</p>
            <p className="text-xs text-[#A89B92]">Hãy nhấn &quot;Thêm Set Combo mới&quot; để bắt đầu.</p>
          </div>
        ) : (
          combos.map((cb) => {
            const items = resolveAdminComboItems(cb, availableProducts);
            const availability = getComboAvailability(cb);
            const retailTot = getComboRetailTotal(cb);
            const saveAmt = Math.max(0, retailTot - cb.price);
            const savePct = retailTot > 0 ? Math.round((saveAmt / retailTot) * 100) : 0;
            const thumb = cb.thumbnail || cb.images?.[0] || COMBO_IMAGE_PRESETS[0].url;

            return (
              <div
                key={cb.combo_id}
                className="bg-white rounded-2xl p-3.5 border border-[#F0E5D8] shadow-soft space-y-3"
              >
                {/* Header: Thumbnail + Name + Price */}
                <div className="flex items-start gap-3">
                  <div className="relative w-14 h-14 rounded-xl bg-[#FFF8EE] border border-[#F0E5D8] overflow-hidden shrink-0 flex items-center justify-center text-xl shadow-2xs">
                    {thumb ? (
                      <Image src={thumb} alt={cb.name} fill className="object-cover" />
                    ) : (
                      <span>🎁</span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-[#231B16] text-xs leading-tight line-clamp-2">
                      {cb.name}
                    </h4>
                    <div className="flex items-baseline gap-1.5 mt-1">
                      <MoneyDisplay amount={cb.price} className="font-extrabold text-[#1B3622] text-xs" />
                      {retailTot > cb.price && (
                        <span className="text-[10px] text-[#A89B92] line-through">
                          <MoneyDisplay amount={retailTot} />
                        </span>
                      )}
                    </div>
                    {saveAmt > 0 && (
                      <span className="text-[10px] text-amber-700 font-bold block">
                        Tiết kiệm {saveAmt.toLocaleString("vi-VN")}đ ({savePct}%)
                      </span>
                    )}
                  </div>
                </div>

                {/* Items chips */}
                <div className="p-2 rounded-xl bg-[#FFFDF9] border border-[#F5EFE6] space-y-1">
                  <div className="text-[10px] font-bold text-[#7E7068]">Sản phẩm thành phần:</div>
                  <div className="flex flex-wrap gap-1">
                    {items.map((it, idx) => (
                      <span key={idx} className="px-2 py-0.5 rounded-lg bg-white border border-[#F0E5D8] font-medium text-[#342A24] text-[10px]">
                        {it.name} <strong className="text-[#2D6338]">×{it.quantity}</strong>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Stock & Status & Actions Toolbar */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#F5EFE6] text-xs">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[10px] ${
                      availability.status === "out_of_stock"
                        ? "bg-red-100 text-red-700"
                        : availability.status === "unconfigured" || availability.status === "unknown"
                        ? "bg-slate-100 text-slate-700"
                        : availability.sets < 5
                        ? "bg-amber-100 text-amber-800"
                        : "bg-[#EAF7ED] text-[#16381D]"
                    }`}
                    title={"reason" in availability ? availability.reason : undefined}
                  >
                    <PackageCheck className="w-3 h-3" />
                    <span>{getComboAvailabilityLabel(availability)}</span>
                  </span>

                  <button
                    type="button"
                    onClick={() => handleToggleComboStatus(cb.combo_id, cb.status)}
                    className="cursor-pointer"
                  >
                    {cb.status === "active" || !cb.status ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-300">
                        🟢 Đang bán
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[10px] font-bold border border-gray-200">
                        ⚪ Nháp
                      </span>
                    )}
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditModal(cb)}
                      className="p-1.5 rounded-xl text-[#1B3622] bg-[#BFE9C3]/30 hover:bg-[#BFE9C3] border border-[#9ed4a3]/40 cursor-pointer"
                      title="Sửa Combo"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeletingCombo(cb)}
                      className="p-1.5 rounded-xl text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 cursor-pointer"
                      title="Xóa Combo"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* DESKTOP TABLE VIEW (>= sm) */}
      <div className="hidden sm:block bg-white rounded-3xl border border-[#F0E5D8] shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-xs">
            <thead>
              <tr className="bg-[#FFF8EE] border-b border-[#F0E5D8] text-[#7E7068] font-bold uppercase tracking-wider text-[10px]">
                <th className="py-2.5 px-4 whitespace-nowrap">Tên Set Combo</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Sản phẩm thành phần</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Giá trọn gói</th>
                <th className="py-2.5 px-3.5 text-center whitespace-nowrap">Tồn kho khả dụng</th>
                <th className="py-2.5 px-3.5 text-center whitespace-nowrap">Trạng thái</th>
                <th className="py-2.5 px-4 text-right whitespace-nowrap">Thao tác</th>
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
                  const items = resolveAdminComboItems(cb, availableProducts);
                  const availability = getComboAvailability(cb);
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
                        <div className="min-w-0">
                          {renamingComboId === cb.combo_id ? (
                            <div className="flex items-center gap-1.5 py-1">
                              <input
                                type="text"
                                autoFocus
                                value={inlineComboName}
                                onChange={(e) => setInlineComboName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    handleSaveInlineRename(cb.combo_id);
                                  } else if (e.key === "Escape") {
                                    handleCancelRename();
                                  }
                                }}
                                className="px-2.5 py-1 text-xs font-bold border-2 border-emerald-500 rounded-xl outline-none bg-white text-[#342A24] w-48 shadow-xs"
                                placeholder="Nhập tên combo mới..."
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveInlineRename(cb.combo_id)}
                                className="p-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer shadow-2xs transition-transform active:scale-95"
                                title="Lưu tên combo"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={handleCancelRename}
                                className="p-1.5 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 cursor-pointer transition-transform active:scale-95"
                                title="Hủy"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="group/name flex items-center gap-1.5">
                              <span className="font-bold text-[#342A24] block text-sm">{cb.name}</span>
                              <button
                                type="button"
                                onClick={() => handleStartRename(cb)}
                                className="opacity-0 group-hover/name:opacity-100 p-1 text-[#7E7068] hover:text-[#2D6338] hover:bg-[#BFE9C3]/40 rounded-lg transition-all cursor-pointer"
                                title="Đổi nhanh tên combo"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                              {cb.featured && (
                                <span className="px-1.5 py-0.2 rounded-md bg-amber-100 text-amber-900 text-[10px] font-bold">
                                  ⭐ Nổi bật
                                </span>
                              )}
                            </div>
                          )}
                          <span className="text-[11px] text-[#A89B92] font-mono">/{cb.slug}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap items-center gap-1.5 py-1">
                          {items.map((it, idx) => (
                            <span key={idx} className="inline-flex items-center gap-1">
                              <span className="px-2 py-0.5 rounded-lg bg-[#FFF8EE] border border-[#F0E5D8] font-semibold text-[#342A24] text-[11px] flex items-center gap-1">
                                <span>{it.name}</span>
                                <strong className="text-[#2D6338]">×{it.quantity}</strong>
                                <span className="text-[9.5px] text-[#7E7068] font-normal">
                                  ({(it.price || 0).toLocaleString("vi-VN")}đ)
                                </span>
                              </span>
                              {idx < items.length - 1 && (
                                <span className="w-4 h-4 rounded-full bg-[#FFE7A8] text-[#542B07] font-black flex items-center justify-center text-[10px] shadow-2xs border border-[#ebd089]">
                                  +
                                </span>
                              )}
                            </span>
                          ))}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-baseline gap-1.5">
                          <MoneyDisplay amount={cb.price} className="font-extrabold text-[#1B3622] text-sm block" />
                          {retailTot > cb.price && (
                            <span className="text-[10.5px] text-[#A89B92] line-through font-medium">
                              <MoneyDisplay amount={retailTot} />
                            </span>
                          )}
                        </div>
                        {saveAmt > 0 && (
                          <span className="text-[10.5px] text-amber-700 font-bold block">
                            Tiết kiệm {saveAmt.toLocaleString("vi-VN")}đ ({savePct}%)
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-bold text-[11px] ${
                            availability.status === "out_of_stock"
                              ? "bg-red-100 text-red-700"
                              : availability.status === "unconfigured" || availability.status === "unknown"
                              ? "bg-slate-100 text-slate-700"
                              : availability.sets < 5
                              ? "bg-amber-100 text-amber-800"
                              : "bg-[#EAF7ED] text-[#16381D]"
                          }`}
                          title={"reason" in availability ? availability.reason : undefined}
                        >
                          <PackageCheck className="w-3 h-3" />
                          <span>{getComboAvailabilityLabel(availability)}</span>
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleComboStatus(cb.combo_id, cb.status)}
                          className="cursor-pointer transition-transform hover:scale-105 active:scale-95 inline-block"
                          title="Nhấn để đổi giữa Đang bán và Bản nháp"
                        >
                          {cb.status === "active" || !cb.status ? (
                            <span className="px-2.5 py-1 rounded-full bg-[#EAF7ED] text-[#16381D] text-[11px] font-bold border border-emerald-300 shadow-2xs hover:bg-[#d8f3dc]">
                              ✓ Đang bán (Bấm đổi)
                            </span>
                          ) : cb.status === "draft" ? (
                            <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-900 text-[11px] font-bold border border-amber-300 shadow-2xs hover:bg-amber-100">
                              📝 Bản nháp (Bấm mở bán)
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full bg-red-50 text-red-600 text-[11px] font-bold border border-red-200">
                              Ngừng bán
                            </span>
                          )}
                        </button>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-in fade-in" style={{ willChange: "opacity" }}>
          <div
            className="w-full max-w-lg bg-white rounded-3xl p-6 sm:p-7 border border-[#F0E5D8] shadow-2xl space-y-4 text-left max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200"
            style={{ willChange: "transform, opacity", transform: "translateZ(0)" }}
          >
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
                <div className="flex items-center justify-between">
                  <label className="font-bold text-[#342A24] block">Tên Set Combo *</label>
                  {name && (
                    <span className="text-[10.5px] text-gray-400 font-mono">
                      /combos/{name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-")}
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Combo Gieo Mầm Yêu Thương"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] bg-white font-medium"
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
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <select
                        value={thumbnail}
                        onChange={(e) => setThumbnail(e.target.value)}
                        className="flex-1 px-3 py-2 rounded-xl border border-[#F0E5D8] text-xs font-semibold text-[#342A24] bg-white outline-none"
                      >
                        {COMBO_IMAGE_PRESETS.map((p, idx) => (
                          <option key={idx} value={p.url}>
                            {p.label}
                          </option>
                        ))}
                      </select>

                      <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#E8F5E9] hover:bg-[#C8E6C9] text-[#1B3622] font-bold text-xs cursor-pointer transition-colors border border-[#A5D6A7] shrink-0">
                        {uploadingCreateThumb ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#1B3622]" />
                            <span>Tải ảnh...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-3.5 h-3.5" />
                            <span>Tải ảnh lên</span>
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          disabled={uploadingCreateThumb}
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              handleUploadComboImage(file, (url) => setThumbnail(url), setUploadingCreateThumb);
                            }
                          }}
                        />
                      </label>
                    </div>

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
                    onChange={(e) => setStatus(e.target.value as ExtendedCombo["status"])}
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
                  {availableProducts.length > 0 && (
                    <button
                      type="button"
                      onClick={handleAddItemToCreate}
                      className="px-2.5 py-1 rounded-lg bg-[#FFE7A8] hover:bg-[#ffd980] text-[#542B07] font-extrabold text-[11px] flex items-center gap-1 transition-colors cursor-pointer border border-[#ebd089]"
                    >
                      <Plus className="w-3.5 h-3.5" /> Thêm món vào Combo
                    </button>
                  )}
                </div>

                {availableProducts.length === 0 ? (
                  <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-2">
                    <div className="font-bold flex items-center gap-1.5 text-amber-950">
                      <AlertTriangle className="w-4 h-4 text-amber-700" />
                      <span>Chưa có sản phẩm khả dụng trong kho</span>
                    </div>
                    <p className="text-[11px] text-amber-800 leading-relaxed">
                      Set Combo cần liên kết với các sản phẩm thực tế để tự động đồng bộ tồn kho. Bạn vui lòng tạo ít nhất 1 sản phẩm trước khi tạo Combo nhé!
                    </p>
                    <a
                      href="/admin/products/new"
                      className="inline-block px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-[11px] transition-colors"
                    >
                      + Tạo sản phẩm mới ngay ➔
                    </a>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {comboItems.map((item, index) => {
                      const currentProd = availableProducts.find((p) => p.product_id === item.product_id);
                      return (
                        <div key={index} className="flex items-center gap-2 bg-[#FFF8EE] p-2.5 rounded-2xl border border-[#F0E5D8]">
                          <span className="w-5 h-5 rounded-full bg-[#BFE9C3] text-[#16381D] font-extrabold flex items-center justify-center text-[10px] shrink-0">
                            {index + 1}
                          </span>

                        <div className="flex-1 flex items-center gap-1.5 min-w-0">
                          <select
                            value={item.product_id}
                            onChange={(e) => {
                              const updated = [...comboItems];
                              updated[index].product_id = e.target.value;
                              const nextProduct = availableProducts.find((p) => p.product_id === e.target.value);
                              updated[index].variant_id = getDefaultComboVariantId(nextProduct);
                              setComboItems(updated);
                            }}
                            className="min-w-0 flex-1 px-2.5 py-1.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] bg-white text-[#342A24] font-semibold"
                          >
                            {availableProducts.map((p) => (
                              <option key={p.product_id} value={p.product_id}>
                                {p.name} ({p.price.toLocaleString("vi-VN")}đ · Kho: {getProductTotalStock(p)})
                              </option>
                            ))}
                          </select>

                          {currentProd && currentProd.variants && currentProd.variants.length > 0 ? (
                            <select
                              value={item.variant_id || ""}
                              onChange={(e) => {
                                const updated = [...comboItems];
                                updated[index].variant_id = e.target.value || null;
                                setComboItems(updated);
                              }}
                              title="Để trống để dùng tất cả phân loại đang hoạt động"
                              className="w-40 shrink-0 px-2.5 py-1.5 rounded-xl border border-[#F0E5D8] text-xs outline-none bg-white font-semibold text-[#342A24] focus:border-[#FFB98A]"
                            >
                              <option value="">Tất cả phân loại</option>
                              {currentProd.variants.map((v) => (
                                <option key={v.variant_id} value={v.variant_id}>
                                  {variantLabel(v)}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="w-40 shrink-0 text-[10px] font-bold text-amber-700 leading-tight">
                              Sản phẩm chưa có phân loại
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          <span className="text-[11px] text-[#7E7068] font-bold">SL:</span>
                          <input
                            type="number"
                            min={1}
                            max={50}
                            value={item.quantity}
                            onChange={(e) => {
                              const updated = [...comboItems];
                              updated[index].quantity = Math.max(1, Math.floor(Number(e.target.value) || 1));
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
              )}

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
                  disabled={availableProducts.length === 0}
                  className={`px-5 py-2.5 rounded-full font-extrabold text-xs shadow-xs transition-all ${
                    availableProducts.length === 0
                      ? "bg-gray-200 text-gray-400 cursor-not-allowed border border-gray-300"
                      : "bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] border border-[#9ed4a3] cursor-pointer"
                  }`}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-in fade-in" style={{ willChange: "opacity" }}>
          <div
            className="w-full max-w-lg bg-white rounded-3xl p-6 sm:p-7 border border-[#F0E5D8] shadow-2xl space-y-4 text-left max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200"
            style={{ willChange: "transform, opacity", transform: "translateZ(0)" }}
          >
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
                  onChange={(e) => {
                    const newName = e.target.value;
                    const autoSlug = newName
                      .toLowerCase()
                      .normalize("NFD")
                      .replace(/[\u0300-\u036f]/g, "")
                      .replace(/[đĐ]/g, "d")
                      .replace(/[^a-z0-9\s-]/g, "")
                      .trim()
                      .replace(/\s+/g, "-");
                    setEditingCombo({ ...editingCombo, name: newName, slug: autoSlug || editingCombo.slug });
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] bg-white font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#342A24] block text-[11px]">Đường dẫn tĩnh (Slug) *</label>
                <div className="flex items-center rounded-xl border border-[#F0E5D8] bg-[#FFFDF9] px-3 py-2 text-xs">
                  <span className="text-gray-400 font-mono text-[11px]">/combos/</span>
                  <input
                    type="text"
                    required
                    value={editingCombo.slug || ""}
                    onChange={(e) => setEditingCombo({ ...editingCombo, slug: e.target.value })}
                    className="flex-1 font-mono text-[11px] text-[#342A24] outline-none bg-transparent pl-1 font-bold"
                  />
                </div>
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
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <select
                        value={editingCombo.thumbnail || editingCombo.images?.[0] || COMBO_IMAGE_PRESETS[0].url}
                        onChange={(e) => setEditingCombo({ ...editingCombo, thumbnail: e.target.value })}
                        className="flex-1 px-3 py-2 rounded-xl border border-[#F0E5D8] text-xs font-semibold text-[#342A24] bg-white outline-none"
                      >
                        {COMBO_IMAGE_PRESETS.map((p, idx) => (
                          <option key={idx} value={p.url}>
                            {p.label}
                          </option>
                        ))}
                      </select>

                      <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#E8F5E9] hover:bg-[#C8E6C9] text-[#1B3622] font-bold text-xs cursor-pointer transition-colors border border-[#A5D6A7] shrink-0">
                        {uploadingEditThumb ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#1B3622]" />
                            <span>Tải ảnh...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-3.5 h-3.5" />
                            <span>Tải ảnh mới</span>
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          disabled={uploadingEditThumb}
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              handleUploadComboImage(
                                file,
                                (url) => setEditingCombo({ ...editingCombo, thumbnail: url, images: [url] }),
                                setUploadingEditThumb
                              );
                            }
                          }}
                        />
                      </label>
                    </div>

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
                    onChange={(e) => setEditingCombo({ ...editingCombo, status: e.target.value as ExtendedCombo["status"] })}
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
                  {editComboItems.map((item, index) => {
                    const currentProd = availableProducts.find((p) => p.product_id === item.product_id);
                    return (
                    <div key={index} className="flex items-center gap-2 bg-[#FFF8EE] p-2.5 rounded-2xl border border-[#F0E5D8]">
                      <span className="w-5 h-5 rounded-full bg-[#BFE9C3] text-[#16381D] font-extrabold flex items-center justify-center text-[10px] shrink-0">
                        {index + 1}
                      </span>

                      <div className="flex-1 flex items-center gap-1.5 min-w-0">
                        <select
                          value={item.product_id}
                          onChange={(e) => {
                            const updated = [...editComboItems];
                            updated[index].product_id = e.target.value;
                            const nextProduct = availableProducts.find((p) => p.product_id === e.target.value);
                            updated[index].variant_id = getDefaultComboVariantId(nextProduct);
                            setEditComboItems(updated);
                          }}
                          className="min-w-0 flex-1 px-2.5 py-1.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] bg-white text-[#342A24] font-semibold"
                        >
                          {availableProducts.map((p) => (
                            <option key={p.product_id} value={p.product_id}>
                              {p.name} ({p.price.toLocaleString("vi-VN")}đ · Kho: {getProductTotalStock(p)})
                            </option>
                          ))}
                        </select>

                        {currentProd && currentProd.variants && currentProd.variants.length > 0 ? (
                          <select
                            value={item.variant_id || ""}
                            onChange={(e) => {
                              const updated = [...editComboItems];
                              updated[index].variant_id = e.target.value || null;
                              setEditComboItems(updated);
                            }}
                            title="Để trống để dùng tất cả phân loại đang hoạt động"
                            className="w-40 shrink-0 px-2.5 py-1.5 rounded-xl border border-[#F0E5D8] text-xs outline-none bg-white font-semibold text-[#342A24] focus:border-[#FFB98A]"
                          >
                            <option value="">Tất cả phân loại</option>
                            {currentProd.variants.map((v) => (
                              <option key={v.variant_id} value={v.variant_id}>
                                {variantLabel(v)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="w-40 shrink-0 text-[10px] font-bold text-amber-700 leading-tight">
                            Sản phẩm chưa có phân loại
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <span className="text-[11px] text-[#7E7068] font-bold">SL:</span>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={item.quantity}
                          onChange={(e) => {
                            const updated = [...editComboItems];
                            updated[index].quantity = Math.max(1, Math.floor(Number(e.target.value) || 1));
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
                    );
                  })}
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
        <DoubleConfirmDialog
          open={true}
          onClose={() => setDeletingCombo(null)}
          onConfirm={handleConfirmDelete}
          title="Xóa Set Combo"
          message="Bạn có chắc muốn xóa Set Combo này? Thao tác này sẽ gỡ bỏ Combo khỏi trang bán hàng."
          confirmCode="XOA"
          loading={isDeleting}
          details={[
            { label: "Tên Combo", value: deletingCombo.name },
            { label: "Trạng thái", value: deletingCombo.status || "active" },
          ]}
        />
      )}
    </div>
  );
}
