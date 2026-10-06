"use client";

import React, { useState } from "react";
import Image from "next/image";
import { Sparkles, Layers, Zap, Image as ImageIcon, Trash2, Check, RefreshCw, Grid, List, Plus } from "lucide-react";
import { generateSku } from "@/lib/utils/skuGenerator";

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
  const [isOpen, setIsOpen] = useState(false);
  const [count, setCount] = useState<number>(20);
  const [prefix, setPrefix] = useState<string>("Mẫu #");
  const [padZero, setPadZero] = useState<boolean>(true);
  const [initialStock, setInitialStock] = useState<number>(1);
  const [startNumber, setStartNumber] = useState<number>(1);

  // Range image assignment state
  const [selectedImageIdx, setSelectedImageIdx] = useState<number>(0);
  const [rangeStart, setRangeStart] = useState<number>(1);
  const [rangeEnd, setRangeEnd] = useState<number>(5);

  // View mode: grid vs table
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  // Check if current variants look like numbered variants
  const isNumberedCollection = variants.length > 5 && variants.some((v) => /#\d+/.test(v.name));

  // 1. Generate bulk numbered variants
  const handleGenerate = () => {
    if (count <= 0) return;
    const newItems: VariantItem[] = [];
    const total = Math.min(count, 200); // safety max

    for (let i = 0; i < total; i++) {
      const num = startNumber + i;
      const numStr = padZero && num < 10 ? `0${num}` : `${num}`;
      const vName = `${prefix}${numStr}`;
      const vSku = generateSku(productName || "SP", vName, i);

      // Auto map image if images available
      let mappedImg = "";
      if (galleryImages.length > 0) {
        // distribute items evenly across gallery images
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

  // 2. Auto-distribute existing gallery images across current variants
  const handleAutoDistributeImages = () => {
    if (galleryImages.length === 0 || variants.length === 0) {
      alert("Vui lòng tải lên ít nhất 1 ảnh trong Bộ sưu tập ảnh (Gallery) trước khi gán ảnh!");
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

  // 3. Assign selected image to a custom range (e.g. Mẫu 1 -> Mẫu 5)
  const handleAssignImageRange = () => {
    if (!galleryImages[selectedImageIdx]) {
      alert("Vui lòng chọn một hình ảnh hợp lệ!");
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

  // 4. Set stock for all variants
  const handleSetAllStock = (newStock: number) => {
    const updated = variants.map((v) => ({
      ...v,
      stock: newStock,
      stock_warehouse_1: newStock,
      stock_warehouse_2: 0,
    }));
    onVariantsChange(updated);
  };

  return (
    <div className="rounded-3xl border-2 border-[#BFE9C3] bg-linear-to-b from-[#FAFDF9] to-white p-5 sm:p-6 shadow-sm space-y-5">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-emerald-100">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-[#BFE9C3] flex items-center justify-center text-[#16381D] shrink-0 shadow-2xs">
            <Sparkles className="w-5 h-5 text-[#2D6338]" />
          </div>
          <div>
            <h3 className="font-heading font-extrabold text-sm sm:text-base text-emerald-950 flex items-center gap-2">
              <span>Bộ tạo phân loại số lượng lớn (Hàng thủ công độc bản)</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-[10px] font-bold">
                ⚡ Đánh số #01 → #{variants.length || 50}
              </span>
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Tạo nhanh 20, 50, 100 mẫu đánh số chỉ với 1 click, tự gán ảnh bảng gom và tự động điền kho = 1.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="px-3.5 py-1.5 rounded-xl bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-bold text-xs self-start sm:self-auto cursor-pointer transition-colors"
        >
          {isOpen ? "Thu gọn công cụ ▲" : "Mở công cụ tạo nhanh ▼"}
        </button>
      </div>

      {/* Generator Form Controls (Collapsible) */}
      {isOpen && (
        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-emerald-200/80 shadow-xs space-y-5 animate-in fade-in">
          {/* Step 1: Generator Parameters */}
          <div className="space-y-3">
            <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5 uppercase tracking-wider">
              <span>1️⃣</span> Cấu hình tạo mẫu tự động:
            </span>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-[11px] font-bold text-gray-600 block mb-1">
                  Số lượng mẫu cần tạo:
                </label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value) || 1)}
                  className="w-full p-2.5 rounded-xl border border-gray-300 text-xs font-bold text-emerald-950 outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-600 block mb-1">
                  Tiền tố tên phân loại:
                </label>
                <input
                  type="text"
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value)}
                  placeholder="VD: Mẫu #"
                  className="w-full p-2.5 rounded-xl border border-gray-300 text-xs font-semibold outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-600 block mb-1">
                  Bắt đầu từ số:
                </label>
                <input
                  type="number"
                  min={1}
                  value={startNumber}
                  onChange={(e) => setStartNumber(Number(e.target.value) || 1)}
                  className="w-full p-2.5 rounded-xl border border-gray-300 text-xs font-semibold outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-600 block mb-1">
                  Tồn kho mỗi mẫu:
                </label>
                <input
                  type="number"
                  min={0}
                  value={initialStock}
                  onChange={(e) => setInitialStock(Number(e.target.value) || 0)}
                  className="w-full p-2.5 rounded-xl border border-gray-300 text-xs font-bold text-emerald-950 outline-none focus:border-emerald-600"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <label className="inline-flex items-center gap-2 text-xs text-gray-700 cursor-pointer font-medium">
                <input
                  type="checkbox"
                  checked={padZero}
                  onChange={(e) => setPadZero(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                />
                <span>Định dạng 2 chữ số (01, 02, 03... thay vì 1, 2, 3)</span>
              </label>

              <button
                type="button"
                onClick={handleGenerate}
                className="px-5 py-2.5 rounded-xl bg-[#2D6338] hover:bg-[#1E4B27] text-white font-extrabold text-xs inline-flex items-center gap-2 shadow-xs cursor-pointer transition-all active:scale-95"
              >
                <Zap className="w-4 h-4 text-[#FFE7A8]" />
                <span>⚡ Tạo ngay {count} phân loại ({prefix}{padZero && startNumber < 10 ? `0${startNumber}` : startNumber} → {prefix}{startNumber + count - 1})</span>
              </button>
            </div>
          </div>

          {/* Step 2: Batch Image Mapping Tool */}
          {variants.length > 0 && galleryImages.length > 0 && (
            <div className="pt-4 border-t border-gray-200 space-y-3">
              <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5 uppercase tracking-wider">
                <span>2️⃣</span> Công cụ gán ảnh bảng gom cho các phân loại:
              </span>

              <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 text-xs text-amber-950 space-y-2">
                <p className="font-semibold">
                  💡 Bạn đã tải lên <strong>{galleryImages.length} ảnh</strong> trong Bộ sưu tập. Bạn có thể gán nhanh ảnh cho từng nhóm mẫu:
                </p>

                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={handleAutoDistributeImages}
                    className="px-3.5 py-2 rounded-lg bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-xs inline-flex items-center gap-1.5 cursor-pointer shadow-2xs border border-[#9ed4a3]"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>⚡ Tự động chia đều {galleryImages.length} ảnh cho {variants.length} mẫu</span>
                  </button>

                  <span className="text-gray-400 text-xs">hoặc</span>

                  {/* Manual Range Assign */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-gray-600 text-[11px]">Gán Ảnh</span>
                    <select
                      value={selectedImageIdx}
                      onChange={(e) => setSelectedImageIdx(Number(e.target.value))}
                      className="p-1.5 rounded-lg border border-gray-300 bg-white text-xs font-bold"
                    >
                      {galleryImages.map((img, idx) => (
                        <option key={idx} value={idx}>
                          Ảnh {idx + 1}
                        </option>
                      ))}
                    </select>
                    <span className="text-gray-600 text-[11px]">cho Mẫu từ</span>
                    <input
                      type="number"
                      min={1}
                      max={variants.length}
                      value={rangeStart}
                      onChange={(e) => setRangeStart(Number(e.target.value))}
                      className="w-14 p-1.5 text-center rounded-lg border border-gray-300 text-xs font-bold"
                    />
                    <span className="text-gray-600 text-[11px]">đến</span>
                    <input
                      type="number"
                      min={1}
                      max={variants.length}
                      value={rangeEnd}
                      onChange={(e) => setRangeEnd(Number(e.target.value))}
                      className="w-14 p-1.5 text-center rounded-lg border border-gray-300 text-xs font-bold"
                    />
                    <button
                      type="button"
                      onClick={handleAssignImageRange}
                      className="px-3 py-1.5 rounded-lg bg-emerald-800 text-white font-bold text-xs hover:bg-emerald-900 cursor-pointer shadow-2xs"
                    >
                      Áp dụng dải này
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Action Toolbar & Summary */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-700">
            Tổng cộng: <strong className="text-emerald-950 font-extrabold text-sm">{variants.length}</strong> phân loại
          </span>
          {variants.length > 0 && (
            <span className="text-xs text-gray-500">
              (Tổng tồn kho: <strong>{variants.reduce((s, v) => s + (Number(v.stock) || 0), 0)} chiếc</strong>)
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Quick stock shortcuts */}
          <button
            type="button"
            onClick={() => handleSetAllStock(1)}
            className="px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-[11px] font-bold cursor-pointer"
            title="Đặt tồn kho mỗi mẫu = 1 chiếc"
          >
            Tồn kho = 1
          </button>
          <button
            type="button"
            onClick={() => handleSetAllStock(0)}
            className="px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-[11px] font-bold cursor-pointer"
            title="Đặt tồn kho mỗi mẫu = 0 chiếc"
          >
            Tồn kho = 0
          </button>

          {/* View mode toggle */}
          <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-md text-xs cursor-pointer ${
                viewMode === "grid" ? "bg-white text-emerald-900 shadow-2xs font-bold" : "text-gray-500"
              }`}
              title="Chế độ lưới thu gọn"
            >
              <Grid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`p-1.5 rounded-md text-xs cursor-pointer ${
                viewMode === "table" ? "bg-white text-emerald-900 shadow-2xs font-bold" : "text-gray-500"
              }`}
              title="Chế độ danh sách chi tiết"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* COMPACT MATRIX GRID VIEW (For 20-100 items without endless scrolling) */}
      {viewMode === "grid" && variants.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2.5 max-h-96 overflow-y-auto p-2 rounded-2xl bg-gray-50/70 border border-gray-200 scrollbar-thin">
          {variants.map((v, idx) => {
            const vImg = v.imageUrl || v.image_url;
            return (
              <div
                key={idx}
                className="p-2.5 rounded-xl bg-white border border-gray-200 hover:border-emerald-400 shadow-2xs flex flex-col justify-between gap-1.5 relative group"
              >
                <div className="flex items-center gap-2">
                  {/* Thumbnail */}
                  <div className="relative w-8 h-8 rounded-lg bg-gray-100 border border-gray-200 overflow-hidden shrink-0">
                    {vImg ? (
                      <Image src={vImg} alt="" fill className="object-cover" unoptimized />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400">
                        📷
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      value={v.name}
                      onChange={(e) => {
                        const val = e.target.value;
                        onVariantsChange(
                          variants.map((item, i) => (i === idx ? { ...item, name: val } : item))
                        );
                      }}
                      className="w-full text-xs font-bold text-emerald-950 truncate bg-transparent outline-none focus:bg-emerald-50 rounded px-0.5"
                    />
                    <span className="text-[10px] font-mono text-gray-400 block truncate">
                      {v.sku}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-gray-100 text-[11px]">
                  <div className="flex items-center gap-1">
                    <span className="text-gray-500 text-[10px]">Kho:</span>
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
                      className="w-12 p-0.5 text-center font-bold rounded bg-gray-100 border border-gray-200 text-xs"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onVariantsChange(variants.filter((_, i) => i !== idx));
                    }}
                    className="text-gray-400 hover:text-red-500 p-0.5 rounded cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Xóa mẫu này"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
