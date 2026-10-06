"use client";

import React, { useState, useMemo } from "react";
import Image from "next/image";
import {
  Sparkles,
  Layers,
  Zap,
  Trash2,
  Plus,
  Grid,
  List,
  Upload,
  Loader2,
  Check,
  Info,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { generateSku } from "@/lib/utils/skuGenerator";
import { uploadAsset } from "@/lib/services/uploadService";

export interface VariantItem {
  name: string;
  sku: string;
  stock: number;
  stock_warehouse_1?: number;
  stock_warehouse_2?: number;
  imageUrl?: string;
  image_url?: string;
  price?: number | null;
  compare_at_price?: number | null;
  variant_id?: string;
}

interface BulkVariantGeneratorProps {
  productName: string;
  galleryImages: string[];
  variants: VariantItem[];
  onVariantsChange: (newVariants: VariantItem[]) => void;
}

export function BulkVariantGenerator({
  productName,
  galleryImages,
  variants,
  onVariantsChange,
}: BulkVariantGeneratorProps) {
  // Mode: 'numbered' (batch handmade items e.g. #01-#50) vs 'standard' (S/M/L, colors)
  const isInitiallyNumbered = variants.length > 4 && variants.some((v) => /#?\d+/.test(v.name));
  const [activeTab, setActiveTab] = useState<"numbered" | "standard">(
    isInitiallyNumbered ? "numbered" : "standard"
  );

  // Generator inputs
  const [count, setCount] = useState<number>(20);
  const [prefix, setPrefix] = useState<string>("Mẫu #");
  const [startNumber, setStartNumber] = useState<number>(1);
  const [padZero, setPadZero] = useState<boolean>(true);
  const [initialStock, setInitialStock] = useState<number>(1);
  const [showAdvancedGen, setShowAdvancedGen] = useState<boolean>(false);

  // Range image assignment state
  const [selectedImageIdx, setSelectedImageIdx] = useState<number>(0);
  const [rangeStart, setRangeStart] = useState<number>(1);
  const [rangeEnd, setRangeEnd] = useState<number>(5);

  // View mode in numbered tab: matrix grid vs detail table
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);

  // Total stock calculation
  const totalStock = useMemo(() => {
    return variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
  }, [variants]);

  // 1. Generate numbered items (Presets or Custom)
  const handleGenerateNumbered = (targetCount: number = count, targetPrefix: string = prefix) => {
    if (targetCount <= 0) return;
    const total = Math.min(targetCount, 200);
    const newItems: VariantItem[] = [];

    for (let i = 0; i < total; i++) {
      const num = startNumber + i;
      const numStr = padZero && num < 10 ? `0${num}` : `${num}`;
      const vName = `${targetPrefix}${numStr}`;
      const vSku = generateSku(productName || "SP", vName, i);

      // Distribute evenly across gallery images if available
      let mappedImg = "";
      if (galleryImages.length > 0) {
        const itemsPerImg = Math.ceil(total / galleryImages.length);
        const imgIdx = Math.min(Math.floor(i / itemsPerImg), galleryImages.length - 1);
        mappedImg = galleryImages[imgIdx] || "";
      }

      newItems.push({
        name: vName,
        sku: vSku,
        stock: initialStock,
        stock_warehouse_1: initialStock,
        stock_warehouse_2: 0,
        imageUrl: mappedImg,
        image_url: mappedImg,
      });
    }

    onVariantsChange(newItems);
  };

  // 2. Add single standard variant
  const handleAddStandardVariant = () => {
    const nextIdx = variants.length;
    const nextName = `Phân loại ${nextIdx + 1}`;
    onVariantsChange([
      ...variants,
      {
        name: nextName,
        sku: generateSku(productName || "SP", nextName, nextIdx),
        stock: 10,
        stock_warehouse_1: 10,
        stock_warehouse_2: 0,
        imageUrl: galleryImages[0] || "",
        image_url: galleryImages[0] || "",
      },
    ]);
  };

  // 3. Auto-distribute gallery images across variants
  const handleAutoDistributeImages = () => {
    if (galleryImages.length === 0 || variants.length === 0) {
      alert("Vui lòng tải ảnh lên thư viện trước khi gán ảnh!");
      return;
    }

    const itemsPerImg = Math.ceil(variants.length / galleryImages.length);
    const updated = variants.map((v, i) => {
      const imgIdx = Math.min(Math.floor(i / itemsPerImg), galleryImages.length - 1);
      const imgUrl = galleryImages[imgIdx] || "";
      return {
        ...v,
        imageUrl: imgUrl,
        image_url: imgUrl,
      };
    });

    onVariantsChange(updated);
  };

  // 4. Assign selected image to a custom range
  const handleAssignImageRange = () => {
    if (!galleryImages[selectedImageIdx]) {
      alert("Vui lòng chọn hình ảnh hợp lệ!");
      return;
    }

    const start = Math.max(1, rangeStart);
    const end = Math.min(variants.length, rangeEnd);

    if (start > end) {
      alert("Số bắt đầu không được lớn hơn số kết thúc!");
      return;
    }

    const targetUrl = galleryImages[selectedImageIdx];
    const updated = variants.map((v, idx) => {
      const itemNum = idx + 1;
      if (itemNum >= start && itemNum <= end) {
        return {
          ...v,
          imageUrl: targetUrl,
          image_url: targetUrl,
        };
      }
      return v;
    });

    onVariantsChange(updated);
  };

  // 5. Batch stock actions
  const handleSetAllStock = (newStock: number) => {
    onVariantsChange(
      variants.map((v) => ({
        ...v,
        stock: newStock,
        stock_warehouse_1: newStock,
        stock_warehouse_2: 0,
      }))
    );
  };

  // 6. Regenerate SKUs for all
  const handleRegenerateAllSkus = () => {
    onVariantsChange(
      variants.map((v, i) => ({
        ...v,
        sku: generateSku(productName || "SP", v.name, i),
      }))
    );
  };

  // 7. Handle variant photo upload
  const handlePhotoUpload = async (file: File, vIdx: number) => {
    try {
      setUploadingIdx(vIdx);
      const res = await uploadAsset(file, "product-media");
      if (res.success && res.url) {
        onVariantsChange(
          variants.map((item, i) =>
            i === vIdx ? { ...item, imageUrl: res.url, image_url: res.url } : item
          )
        );
      } else {
        alert(res.error || "Tải ảnh thất bại");
      }
    } catch (err: any) {
      alert(err?.message || "Lỗi tải ảnh");
    } finally {
      setUploadingIdx(null);
    }
  };

  return (
    <div className="rounded-3xl border border-[#E8DFD5] bg-white p-5 sm:p-6 shadow-xs space-y-5">
      {/* Header & Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#F0E5D8]">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-extrabold text-[#231B16]">🎨 Phân loại sản phẩm</span>
            <span className="px-2.5 py-0.5 rounded-full bg-[#EBF7EE] text-[#16381D] text-xs font-bold border border-[#BFE9C3]">
              {variants.length} mẫu • Tổng kho: {totalStock}
            </span>
          </div>
          <p className="text-xs text-[#7E7068] mt-0.5">
            Tùy chọn cấu hình phân loại theo nhóm tiêu chuẩn hoặc tạo hàng loạt đánh số cho đồ handmade.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="inline-flex p-1 rounded-2xl bg-[#F5EFEB] border border-[#E8DFD5] self-start sm:self-auto shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab("standard")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "standard"
                ? "bg-white text-[#16381D] shadow-xs"
                : "text-[#7E7068] hover:text-[#231B16]"
            }`}
          >
            🏷️ Phân loại thường
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("numbered")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "numbered"
                ? "bg-[#16381D] text-white shadow-xs"
                : "text-[#7E7068] hover:text-[#231B16]"
            }`}
          >
            ✨ Đánh số độc bản (#01-#50)
          </button>
        </div>
      </div>

      {/* ========================================================
          TAB 1: HÀNG THỦ CÔNG ĐÁNH SỐ (NUMBERED BATCH GENERATOR)
          ======================================================== */}
      {activeTab === "numbered" && (
        <div className="space-y-5">
          {/* Quick 1-Click Presets */}
          <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-[#EFE8DE] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-extrabold text-[#231B16] uppercase tracking-wider flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-500" /> Tạo nhanh số lượng mẫu:
              </span>
              <button
                type="button"
                onClick={() => setShowAdvancedGen(!showAdvancedGen)}
                className="text-[11px] font-bold text-emerald-800 hover:text-emerald-950 inline-flex items-center gap-1 cursor-pointer"
              >
                <SlidersHorizontal className="w-3 h-3" />
                <span>{showAdvancedGen ? "Ẩn tùy chỉnh" : "Tùy chỉnh nâng cao"}</span>
                {showAdvancedGen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>

            {/* Presets */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[20, 50, 100, 150].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handleGenerateNumbered(num, prefix)}
                  className="py-2.5 px-3 rounded-xl bg-white hover:bg-emerald-50 text-emerald-950 border border-[#E8DFD5] hover:border-emerald-500 font-extrabold text-xs transition-all shadow-2xs hover:scale-101 cursor-pointer text-center"
                >
                  ⚡ Tạo {num} mẫu (#{padZero ? "01" : "1"} → #{num})
                </button>
              ))}
            </div>

            {/* Advanced Generator Form */}
            {showAdvancedGen && (
              <div className="pt-3 border-t border-[#E8DFD5] grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-gray-500 block mb-1">Số lượng:</label>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value) || 1)}
                    className="w-full px-3 py-1.5 rounded-xl border border-gray-300 text-xs font-bold bg-white outline-none focus:border-emerald-600"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 block mb-1">Tiền tố:</label>
                  <input
                    type="text"
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value)}
                    placeholder="Mẫu #"
                    className="w-full px-3 py-1.5 rounded-xl border border-gray-300 text-xs font-bold bg-white outline-none focus:border-emerald-600"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 block mb-1">Bắt đầu từ số:</label>
                  <input
                    type="number"
                    min={1}
                    value={startNumber}
                    onChange={(e) => setStartNumber(Number(e.target.value) || 1)}
                    className="w-full px-3 py-1.5 rounded-xl border border-gray-300 text-xs font-bold bg-white outline-none focus:border-emerald-600"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 block mb-1">Tồn kho/mẫu:</label>
                  <input
                    type="number"
                    min={0}
                    value={initialStock}
                    onChange={(e) => setInitialStock(Number(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 rounded-xl border border-gray-300 text-xs font-bold bg-white outline-none focus:border-emerald-600"
                  />
                </div>
                <div className="col-span-2 sm:col-span-4 flex items-center justify-between pt-2">
                  <label className="inline-flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={padZero}
                      onChange={(e) => setPadZero(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
                    />
                    <span>Đánh số có số 0 ở đầu (01, 02... thay vì 1, 2...)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => handleGenerateNumbered(count, prefix)}
                    className="px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs cursor-pointer shadow-xs"
                  >
                    Áp dụng cấu hình
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Batch Image Mapping Box */}
          {variants.length > 0 && (
            <div className="p-4 rounded-2xl bg-[#F4F9F4] border border-[#CDE5D1] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-extrabold text-[#16381D] uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-emerald-700" /> Gán ảnh chụp bảng gom cho phân loại:
                </span>
                <span className="text-[11px] text-emerald-800 font-semibold">
                  Đã tải {galleryImages.length} ảnh trong Gallery
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleAutoDistributeImages}
                  disabled={galleryImages.length === 0}
                  className="px-3.5 py-2 rounded-xl bg-[#2D6338] hover:bg-[#1B4024] disabled:bg-gray-200 disabled:text-gray-400 text-white font-extrabold text-xs inline-flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>Tự động chia đều {galleryImages.length} ảnh cho {variants.length} mẫu</span>
                </button>

                {galleryImages.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 text-xs bg-white px-3 py-1.5 rounded-xl border border-emerald-200">
                    <span className="text-gray-500 text-[11px]">Hoặc gán</span>
                    <select
                      value={selectedImageIdx}
                      onChange={(e) => setSelectedImageIdx(Number(e.target.value))}
                      className="px-2 py-1 rounded-lg border border-gray-300 bg-white font-bold text-xs"
                    >
                      {galleryImages.map((_, idx) => (
                        <option key={idx} value={idx}>
                          Ảnh số {idx + 1}
                        </option>
                      ))}
                    </select>
                    <span className="text-gray-500 text-[11px]">cho mẫu từ</span>
                    <input
                      type="number"
                      min={1}
                      max={variants.length}
                      value={rangeStart}
                      onChange={(e) => setRangeStart(Number(e.target.value))}
                      className="w-12 px-1.5 py-1 text-center rounded-lg border border-gray-300 font-bold text-xs"
                    />
                    <span className="text-gray-500 text-[11px]">đến</span>
                    <input
                      type="number"
                      min={1}
                      max={variants.length}
                      value={rangeEnd}
                      onChange={(e) => setRangeEnd(Number(e.target.value))}
                      className="w-12 px-1.5 py-1 text-center rounded-lg border border-gray-300 font-bold text-xs"
                    />
                    <button
                      type="button"
                      onClick={handleAssignImageRange}
                      className="px-2.5 py-1 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-[11px] cursor-pointer"
                    >
                      Gán
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Matrix Actions Toolbar */}
          {variants.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-700">Thao tác nhanh trên toàn bộ kho:</span>
                <button
                  type="button"
                  onClick={() => handleSetAllStock(1)}
                  className="px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 text-[11px] font-bold cursor-pointer"
                >
                  Tồn kho = 1
                </button>
                <button
                  type="button"
                  onClick={() => handleSetAllStock(0)}
                  className="px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 text-[11px] font-bold cursor-pointer"
                >
                  Tồn kho = 0
                </button>
                <button
                  type="button"
                  onClick={handleRegenerateAllSkus}
                  className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-900 text-[11px] font-bold border border-emerald-200 cursor-pointer"
                >
                  Đồng bộ SKU
                </button>
                <button
                  type="button"
                  onClick={() => onVariantsChange([])}
                  className="px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-[11px] font-bold border border-red-200 cursor-pointer"
                >
                  Xoá hết
                </button>
              </div>

              {/* View Switcher */}
              <div className="inline-flex rounded-xl border border-gray-200 p-0.5 bg-gray-50">
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1 ${
                    viewMode === "grid" ? "bg-white text-emerald-950 shadow-2xs" : "text-gray-500"
                  }`}
                >
                  <Grid className="w-3.5 h-3.5" /> Lưới thu gọn
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1 ${
                    viewMode === "table" ? "bg-white text-emerald-950 shadow-2xs" : "text-gray-500"
                  }`}
                >
                  <List className="w-3.5 h-3.5" /> Bảng chi tiết
                </button>
              </div>
            </div>
          )}

          {/* VISUAL MATRIX TILES VIEW */}
          {viewMode === "grid" && variants.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5 max-h-[480px] overflow-y-auto p-3.5 rounded-2xl bg-[#FAF8F5] border border-[#E8DFD5] scrollbar-thin">
              {variants.map((v, idx) => {
                const vImg = v.imageUrl || v.image_url;
                const isOutOfStock = (Number(v.stock) || 0) <= 0;
                const varFileId = `grid-var-img-${idx}`;
                const isUploading = uploadingIdx === idx;

                return (
                  <div
                    key={idx}
                    className={`p-3 rounded-2xl bg-white border transition-all flex flex-col justify-between gap-2.5 shadow-2xs hover:shadow-xs ${
                      isOutOfStock
                        ? "border-red-200/80 bg-red-50/10"
                        : "border-[#EFE8DE] hover:border-emerald-500"
                    }`}
                  >
                    {/* Top Row: Badge Number & Quick Delete */}
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-0.5 rounded-lg bg-[#EBF7EE] text-[#16381D] font-mono font-extrabold text-xs border border-[#BFE9C3]">
                        {v.name.replace(/^Mẫu\s*/i, "") || `#${idx + 1}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => onVariantsChange(variants.filter((_, i) => i !== idx))}
                        className="p-1 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                        title="Xoá mẫu này"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Middle: Image Preview (56x56) & Name/SKU */}
                    <div className="flex items-center gap-2.5">
                      <div className="relative w-14 h-14 rounded-xl bg-gray-50 border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center group/img">
                        {vImg ? (
                          <Image src={vImg} alt="" fill className="object-cover" unoptimized />
                        ) : (
                          <span className="text-base text-gray-300">📷</span>
                        )}
                        <label
                          htmlFor={varFileId}
                          className="absolute inset-0 bg-black/40 text-white flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity cursor-pointer text-[10px] font-bold"
                          title="Đổi ảnh cho mẫu này"
                        >
                          {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Đổi ảnh"}
                        </label>
                        <input
                          id={varFileId}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handlePhotoUpload(file, idx);
                            e.target.value = "";
                          }}
                        />
                      </div>

                      <div className="flex-1 min-w-0 space-y-0.5">
                        <input
                          type="text"
                          value={v.name}
                          onChange={(e) => {
                            const val = e.target.value;
                            onVariantsChange(
                              variants.map((item, i) => (i === idx ? { ...item, name: val } : item))
                            );
                          }}
                          className="w-full text-xs font-bold text-gray-900 truncate bg-transparent outline-none focus:bg-emerald-50 rounded px-1 border border-transparent focus:border-emerald-300"
                        />
                        <span className="text-[10px] font-mono text-gray-400 block truncate px-1">
                          {v.sku}
                        </span>
                      </div>
                    </div>

                    {/* Bottom: Stock Stepper */}
                    <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-xs">
                      <span className={`text-[11px] font-bold ${isOutOfStock ? "text-red-600" : "text-emerald-800"}`}>
                        {isOutOfStock ? "Hết hàng (0)" : "Còn hàng (1)"}
                      </span>
                      <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                        <button
                          type="button"
                          onClick={() => {
                            const current = Number(v.stock) || 0;
                            const next = Math.max(0, current - 1);
                            onVariantsChange(
                              variants.map((item, i) =>
                                i === idx ? { ...item, stock: next, stock_warehouse_1: next, stock_warehouse_2: 0 } : item
                              )
                            );
                          }}
                          className="px-2 py-0.5 text-xs font-bold text-gray-600 hover:bg-gray-200 cursor-pointer"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min={0}
                          value={v.stock}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 0;
                            onVariantsChange(
                              variants.map((item, i) =>
                                i === idx
                                  ? { ...item, stock: val, stock_warehouse_1: val, stock_warehouse_2: 0 }
                                  : item
                              )
                            );
                          }}
                          className="w-8 py-0.5 text-center font-bold text-xs bg-white outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const current = Number(v.stock) || 0;
                            const next = current + 1;
                            onVariantsChange(
                              variants.map((item, i) =>
                                i === idx ? { ...item, stock: next, stock_warehouse_1: next, stock_warehouse_2: 0 } : item
                              )
                            );
                          }}
                          className="px-2 py-0.5 text-xs font-bold text-gray-600 hover:bg-gray-200 cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* TABLE DETAIL VIEW */}
          {viewMode === "table" && variants.length > 0 && (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1 scrollbar-thin">
              {variants.map((v, idx) => {
                const varFileId = `bulk-var-img-${idx}`;
                const isUploading = uploadingIdx === idx;
                return (
                  <div
                    key={idx}
                    className="flex flex-wrap items-center gap-2.5 p-2.5 rounded-xl bg-gray-50 border border-gray-200 text-xs"
                  >
                    <div className="w-28 font-bold text-gray-800 shrink-0">
                      <input
                        type="text"
                        value={v.name}
                        onChange={(e) => {
                          const val = e.target.value;
                          onVariantsChange(
                            variants.map((item, i) => (i === idx ? { ...item, name: val } : item))
                          );
                        }}
                        className="w-full p-1 rounded-lg border border-gray-300 bg-white font-bold"
                      />
                    </div>

                    <div className="w-32">
                      <input
                        type="text"
                        value={v.sku}
                        onChange={(e) => {
                          const val = e.target.value;
                          onVariantsChange(
                            variants.map((item, i) => (i === idx ? { ...item, sku: val } : item))
                          );
                        }}
                        placeholder="SKU"
                        className="w-full p-1 rounded-lg border border-gray-300 bg-white font-mono text-[11px]"
                      />
                    </div>

                    <div className="relative w-8 h-8 rounded-lg bg-gray-200 border overflow-hidden shrink-0 flex items-center justify-center">
                      {v.imageUrl || v.image_url ? (
                        <Image src={(v.imageUrl || v.image_url)!} alt="" fill className="object-cover" unoptimized />
                      ) : (
                        <span className="text-[10px] text-gray-400">Không</span>
                      )}
                    </div>

                    <input
                      type="text"
                      value={v.imageUrl || v.image_url || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        onVariantsChange(
                          variants.map((item, i) => (i === idx ? { ...item, imageUrl: val, image_url: val } : item))
                        );
                      }}
                      placeholder="Dán URL ảnh hoặc chọn file..."
                      className="flex-1 min-w-[120px] p-1 rounded-lg border border-gray-300 bg-white font-mono text-[11px]"
                    />

                    <label
                      htmlFor={varFileId}
                      className="px-2.5 py-1 rounded-lg bg-white hover:bg-emerald-50 text-emerald-900 border border-emerald-200 font-bold text-[11px] cursor-pointer"
                    >
                      {isUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Tải ảnh"}
                    </label>
                    <input
                      id={varFileId}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handlePhotoUpload(file, idx);
                        e.target.value = "";
                      }}
                    />

                    <div className="flex items-center gap-1">
                      <span className="text-gray-500 text-[10px]">Tồn:</span>
                      <input
                        type="number"
                        min={0}
                        value={v.stock}
                        onChange={(e) => {
                          const val = Number(e.target.value) || 0;
                          onVariantsChange(
                            variants.map((item, i) =>
                              i === idx ? { ...item, stock: val, stock_warehouse_1: val, stock_warehouse_2: 0 } : item
                            )
                          );
                        }}
                        className="w-12 p-1 text-center font-bold rounded-lg border border-gray-300 bg-white"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => onVariantsChange(variants.filter((_, i) => i !== idx))}
                      className="p-1 text-gray-400 hover:text-red-500 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================
          TAB 2: PHÂN LOẠI TIÊU CHUẨN (STANDARD S/M/L, COLORS)
          ======================================================== */}
      {activeTab === "standard" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-600">
              Danh sách các phân loại kích thước, màu sắc của sản phẩm:
            </span>
            <button
              type="button"
              onClick={handleAddStandardVariant}
              className="px-3 py-1.5 rounded-xl bg-[#2D6338] hover:bg-[#1B4024] text-white font-extrabold text-xs inline-flex items-center gap-1 cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Thêm phân loại</span>
            </button>
          </div>

          {variants.length === 0 ? (
            <div className="p-8 text-center rounded-2xl bg-[#FAF8F5] border border-dashed border-[#E8DFD5] space-y-2">
              <span className="text-2xl">🌱</span>
              <p className="text-xs font-bold text-gray-700">Chưa có phân loại nào.</p>
              <p className="text-[11px] text-gray-500">
                Bấm &quot;Thêm phân loại&quot; để tạo các phiên bản như Size S/M/L, Màu Trắng/Xanh... hoặc chuyển sang tab &quot;Đánh số độc bản&quot; cho đồ handmade.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {variants.map((v, idx) => {
                const varFileId = `std-var-img-${idx}`;
                const isUploading = uploadingIdx === idx;
                return (
                  <div
                    key={idx}
                    className="flex flex-wrap sm:flex-nowrap items-center gap-3 p-3 rounded-2xl bg-white border border-[#E8DFD5] shadow-2xs hover:border-emerald-300 transition-colors"
                  >
                    {/* Variant Name */}
                    <div className="flex-1 min-w-[140px]">
                      <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">
                        Tên phân loại
                      </label>
                      <input
                        type="text"
                        placeholder="VD: Size L / Màu Hồng"
                        value={v.name}
                        onChange={(e) => {
                          const val = e.target.value;
                          onVariantsChange(
                            variants.map((item, i) => (i === idx ? { ...item, name: val } : item))
                          );
                        }}
                        className="w-full px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-800 outline-none focus:border-emerald-600 bg-gray-50 focus:bg-white"
                      />
                    </div>

                    {/* SKU */}
                    <div className="w-36 min-w-[120px]">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] font-bold text-gray-500 uppercase block">
                          Mã SKU
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            onVariantsChange(
                              variants.map((item, i) =>
                                i === idx ? { ...item, sku: generateSku(productName, item.name, idx) } : item
                              )
                            );
                          }}
                          className="text-[9.5px] font-bold text-emerald-800 hover:text-emerald-950 cursor-pointer"
                        >
                          ⚡ SKU
                        </button>
                      </div>
                      <input
                        type="text"
                        value={v.sku}
                        onChange={(e) => {
                          const val = e.target.value;
                          onVariantsChange(
                            variants.map((item, i) => (i === idx ? { ...item, sku: val } : item))
                          );
                        }}
                        className="w-full px-2.5 py-1.5 rounded-xl border border-gray-200 text-xs font-mono font-semibold outline-none focus:border-emerald-600 bg-gray-50 focus:bg-white"
                      />
                    </div>

                    {/* Image Preview & Upload */}
                    <div className="flex items-center gap-2">
                      <div className="relative w-9 h-9 rounded-xl bg-gray-100 border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center">
                        {v.imageUrl || v.image_url ? (
                          <Image src={(v.imageUrl || v.image_url)!} alt="" fill className="object-cover" unoptimized />
                        ) : (
                          <span className="text-[10px] text-gray-400">📷</span>
                        )}
                      </div>

                      <label
                        htmlFor={varFileId}
                        className="px-2.5 py-1.5 rounded-xl bg-gray-50 hover:bg-emerald-50 text-gray-700 hover:text-emerald-900 border border-gray-200 hover:border-emerald-300 font-bold text-[11px] cursor-pointer transition-colors"
                      >
                        {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      </label>
                      <input
                        id={varFileId}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handlePhotoUpload(file, idx);
                          e.target.value = "";
                        }}
                      />
                    </div>

                    {/* Stock */}
                    <div className="w-20">
                      <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">
                        Tồn kho
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={v.stock}
                        onChange={(e) => {
                          const val = Number(e.target.value) || 0;
                          onVariantsChange(
                            variants.map((item, i) =>
                              i === idx ? { ...item, stock: val, stock_warehouse_1: val, stock_warehouse_2: 0 } : item
                            )
                          );
                        }}
                        className="w-full px-2 py-1.5 text-center rounded-xl border border-gray-200 text-xs font-bold outline-none focus:border-emerald-600 bg-gray-50 focus:bg-white"
                      />
                    </div>

                    {/* Delete Button */}
                    <button
                      type="button"
                      onClick={() => onVariantsChange(variants.filter((_, i) => i !== idx))}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer self-end mb-0.5"
                      title="Xoá phân loại"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
