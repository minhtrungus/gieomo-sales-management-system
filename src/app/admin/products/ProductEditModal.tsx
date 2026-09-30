"use client";

import { useState, useId } from "react";
import Image from "next/image";
import { ExtendedProduct } from "@/lib/data/mockData";
import { parseProductDescription } from "@/lib/utils/productParser";
import { uploadAsset } from "@/lib/services/uploadService";
import { Edit3, X, Upload, Loader2, Trash2 } from "lucide-react";

interface ProductEditModalProps {
  product: ExtendedProduct;
  onClose: () => void;
  onSave: (updated: ExtendedProduct) => void;
}

export function ProductEditModal({ product, onClose, onSave }: ProductEditModalProps) {
  // Initialize form state once from product
  const [name, setName] = useState(product.name || "");
  const [price, setPrice] = useState(product.price || 0);
  const [costPrice, setCostPrice] = useState<number | "">(product.cost_price ?? "");
  const [status, setStatus] = useState<"active" | "draft" | "archived">(product.status || "active");
  const [featured, setFeatured] = useState<boolean>(product.featured ?? false);

  // Warehouse stock for variant 0
  const initialWh1 = product.variants?.[0]?.stock_warehouse_1 ?? (product.variants?.[0]?.stock ? Math.ceil((product.variants[0].stock || 0) * 0.7) : 0);
  const initialWh2 = product.variants?.[0]?.stock_warehouse_2 ?? (product.variants?.[0]?.stock ? Math.max(0, (product.variants[0].stock || 0) - initialWh1) : 0);
  const [stockWh1, setStockWh1] = useState(initialWh1);
  const [stockWh2, setStockWh2] = useState(initialWh2);

  // Images
  const [thumbnail, setThumbnail] = useState(product.thumbnail || "/images/products/pounch_1.png");
  const [images, setImages] = useState<string[]>(
    product.images && product.images.length > 0 ? product.images : [product.thumbnail || "/images/products/pounch_1.png"]
  );
  const [imagesTextInput, setImagesTextInput] = useState("");

  // Variants with individual image URLs
  const [variants, setVariants] = useState<any[]>(() => {
    return (product.variants || []).map((v) => ({
      ...v,
      image_url: v.image_url || "",
    }));
  });

  // Descriptions / Specs
  const parsed = parseProductDescription(product.description, product.specs, product.impact_story ?? undefined);
  const [overview, setOverview] = useState(parsed.overview || product.description || "");
  const [sizeGuide, setSizeGuide] = useState(parsed.sizeGuide || "");
  const [materials, setMaterials] = useState(parsed.materials || "");
  const [careGuide, setCareGuide] = useState(parsed.careGuide || "");
  const [extraSpecs, setExtraSpecs] = useState(
    Object.entries(parsed.extraSpecs)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n")
  );
  const [impactStory, setImpactStory] = useState(parsed.impactStory || product.impact_story || "");

  // Uploading states
  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const [uploadingVariantIdx, setUploadingVariantIdx] = useState<number | null>(null);

  const thumbInputId = useId();
  const galleryInputId = useId();

  // Upload handler helper
  const handleUploadSingle = async (
    file: File,
    onSuccess: (url: string) => void,
    setLoading?: (v: boolean) => void
  ) => {
    if (!file) return;
    setLoading?.(true);
    try {
      const res = await uploadAsset(file, "product-media");
      if (res.success && res.url) {
        onSuccess(res.url);
        return;
      }
    } catch (err) {
      console.warn("Upload service error, fallback to data url:", err);
    }
    // Fallback to local Data URL
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) onSuccess(e.target.result as string);
      setLoading?.(false);
    };
    reader.onerror = () => setLoading?.(false);
    reader.readAsDataURL(file);
  };

  // Upload multiple images to gallery
  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingGallery(true);
    try {
      const newUrls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        let uploadedUrl = "";
        try {
          const res = await uploadAsset(file, "product-media");
          if (res.success && res.url) {
            uploadedUrl = res.url;
          }
        } catch (err) {}
        if (!uploadedUrl) {
          uploadedUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (ev) => resolve((ev.target?.result as string) || "");
            reader.onerror = () => resolve("");
            reader.readAsDataURL(file);
          });
        }
        if (uploadedUrl) newUrls.push(uploadedUrl);
      }
      if (newUrls.length > 0) {
        setImages((prev) => Array.from(new Set([...prev, ...newUrls])));
      }
    } finally {
      setUploadingGallery(false);
      e.target.value = "";
    }
  };

  // Add custom URL to gallery
  const handleAddImageUrl = () => {
    const url = imagesTextInput.trim();
    if (!url) return;
    setImages((prev) => Array.from(new Set([...prev, url])));
    setImagesTextInput("");
  };

  const handleRemoveGalleryImage = (idxToRemove: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idxToRemove));
  };

  // Variant photo upload
  const handleVariantPhotoUpload = async (file: File, variantIndex: number) => {
    setUploadingVariantIdx(variantIndex);
    await handleUploadSingle(
      file,
      (url) => {
        setVariants((prev) =>
          prev.map((v, i) => (i === variantIndex ? { ...v, image_url: url } : v))
        );
      },
      () => setUploadingVariantIdx(null)
    );
  };

  // Save changes
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Parse extra specs
    const parsedExtraSpecs: Record<string, string> = {};
    if (extraSpecs.trim()) {
      const lines = extraSpecs.split("\n");
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
    if (sizeGuide.trim()) newSpecs["Kích thước"] = sizeGuide.trim();
    if (materials.trim()) newSpecs["Chất liệu"] = materials.trim();
    if (careGuide.trim()) newSpecs["Bảo quản"] = careGuide.trim();

    const fullDescription = [
      overview.trim(),
      sizeGuide.trim() ? `\n\n## Kích thước\n${sizeGuide.trim()}` : "",
      materials.trim() ? `\n\n## Chất liệu\n${materials.trim()}` : "",
      careGuide.trim() ? `\n\n## Bảo quản\n${careGuide.trim()}` : "",
      impactStory.trim() ? `\n\n## Ý nghĩa\n${impactStory.trim()}` : "",
    ].filter(Boolean).join("");

    const finalThumb = thumbnail.trim() || images[0] || "/images/products/pounch_1.png";
    const finalImages = Array.from(new Set([finalThumb, ...images])).filter(Boolean);

    // Update variant warehouse stock
    const updatedVariants = variants.map((v, i) => {
      if (i === 0) {
        return {
          ...v,
          stock_warehouse_1: stockWh1,
          stock_warehouse_2: stockWh2,
          stock: stockWh1 + stockWh2,
        };
      }
      return v;
    });

    const updated: ExtendedProduct = {
      ...product,
      name: name.trim(),
      price: Number(price) || 0,
      cost_price: costPrice === "" ? null : Number(costPrice),
      status,
      featured,
      thumbnail: finalThumb,
      images: finalImages,
      variants: updatedVariants,
      description: fullDescription,
      impact_story: impactStory.trim() || undefined,
      specs: newSpecs,
    };

    onSave(updated);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-[2px] transition-opacity duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-white rounded-3xl p-5 sm:p-7 border border-[#F0E5D8] shadow-2xl space-y-5 text-left"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#F0E5D8] pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-[#BFE9C3] flex items-center justify-center text-[#16381D] shadow-2xs">
              <Edit3 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-heading font-extrabold text-lg text-[#231B16]">
                Chỉnh sửa sản phẩm
              </h3>
              <p className="text-[11px] text-gray-500">
                Thêm hình ảnh, cấu hình phân loại và phân bổ tồn kho
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Tên sản phẩm */}
          <div className="space-y-1">
            <label className="font-bold text-[#342A24] block">Tên sản phẩm *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] font-semibold"
            />
          </div>

          {/* Giá bán & Giá vốn */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="font-bold text-[#342A24] block">Giá bán (VNĐ) *</label>
              <input
                type="number"
                required
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] font-bold text-emerald-950"
              />
            </div>

            <div className="space-y-1">
              <label className="font-bold text-[#342A24] block">Giá vốn (Cost price)</label>
              <input
                type="number"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A]"
              />
            </div>
          </div>

          {/* Trạng thái & Nổi bật */}
          <div className="space-y-2">
            <label className="font-bold text-[#342A24] block text-xs">Trạng thái xuất bản *</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as "active" | "draft" | "archived")}
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] bg-white font-bold text-[#342A24] cursor-pointer"
            >
              <option value="active">Đang bán (Active)</option>
              <option value="draft">Bản nháp (Draft)</option>
              <option value="archived">Lưu trữ (Archived)</option>
            </select>

            <label className="flex items-center gap-2 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={featured}
                onChange={(e) => setFeatured(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
              />
              <span className="text-[11.5px] font-bold text-[#342A24]">
                ⭐ Hiển thị nổi bật trên Trang chủ (Hero)
              </span>
            </label>
          </div>

          {/* ========================================================
              HÌNH ẢNH SẢN PHẨM & ALBUM GALLERY
              ======================================================== */}
          <div className="p-4 rounded-2xl bg-amber-50/50 border border-amber-200/80 space-y-4">
            <div className="flex items-center justify-between">
              <label className="font-extrabold text-[#342A24] uppercase tracking-wider block text-xs">
                🖼️ Hình ảnh đại diện &amp; Album chi tiết (Gallery)
              </label>
              <span className="text-[10px] text-amber-800 font-semibold bg-amber-100/70 px-2 py-0.5 rounded-full">
                Hỗ trợ tải trực tiếp từ máy
              </span>
            </div>

            {/* Thumbnail */}
            <div className="space-y-2 bg-white p-3 rounded-2xl border border-amber-100">
              <label className="font-bold text-[#342A24] block text-[11px]">
                1. Ảnh đại diện chính (Thumbnail):
              </label>
              <div className="flex items-center gap-3">
                <div className="relative w-16 h-16 rounded-xl bg-gray-50 border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center shadow-2xs">
                  {thumbnail ? (
                    <Image src={thumbnail} alt="" fill className="object-cover" />
                  ) : (
                    <span className="text-xl">🖼️</span>
                  )}
                </div>

                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor={thumbInputId}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer shadow-xs transition-colors"
                    >
                      {uploadingThumbnail ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Đang tải lên...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-3.5 h-3.5" />
                          <span>Tải ảnh từ máy</span>
                        </>
                      )}
                    </label>
                    <input
                      id={thumbInputId}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploadingThumbnail}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          handleUploadSingle(file, (url) => setThumbnail(url), setUploadingThumbnail);
                        }
                      }}
                    />
                    <span className="text-[10.5px] text-gray-500 italic">hoặc dán đường dẫn ảnh:</span>
                  </div>

                  <input
                    type="text"
                    value={thumbnail}
                    onChange={(e) => setThumbnail(e.target.value)}
                    placeholder="/images/products/pounch_1.png hoặc URL ảnh https://..."
                    className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-[11px] font-mono outline-none bg-white focus:border-amber-400"
                  />
                </div>
              </div>
            </div>

            {/* Gallery / Album */}
            <div className="space-y-2 bg-white p-3 rounded-2xl border border-amber-100">
              <div className="flex items-center justify-between">
                <label className="font-bold text-[#342A24] block text-[11px]">
                  2. Album ảnh chi tiết (Gallery - Khách xem nhiều góc chụp):
                </label>
                <label
                  htmlFor={galleryInputId}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 text-[11px] font-bold cursor-pointer transition-colors"
                >
                  {uploadingGallery ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Đang tải...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-3 h-3" />
                      <span>+ Chọn ảnh tải vào Album (nhiều ảnh)</span>
                    </>
                  )}
                </label>
                <input
                  id={galleryInputId}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  disabled={uploadingGallery}
                  onChange={handleGalleryUpload}
                />
              </div>

              {/* Thumbnails preview strip */}
              {images.length > 0 ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  {images.map((imgUrl, imgIdx) => (
                    <div
                      key={imgIdx}
                      className="group relative w-16 h-16 rounded-xl border border-gray-200 overflow-hidden bg-gray-50 shadow-2xs"
                    >
                      <Image src={imgUrl} alt="" fill className="object-cover" />
                      <button
                        type="button"
                        onClick={() => handleRemoveGalleryImage(imgIdx)}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-600/90 text-white flex items-center justify-center opacity-80 hover:opacity-100 cursor-pointer shadow-xs transition-opacity"
                        title="Xóa ảnh này khỏi album"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-gray-50 border border-dashed border-gray-200 text-center text-gray-400 text-[11px]">
                  Chưa có ảnh phụ nào trong album
                </div>
              )}

              {/* Thêm link thủ công */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  value={imagesTextInput}
                  onChange={(e) => setImagesTextInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddImageUrl();
                    }
                  }}
                  placeholder="Dán link ảnh thủ công (https://...) rồi nhấn Thêm"
                  className="flex-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-[11px] font-mono outline-none focus:border-amber-400"
                />
                <button
                  type="button"
                  onClick={handleAddImageUrl}
                  className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold cursor-pointer transition-colors"
                >
                  Thêm link
                </button>
              </div>
            </div>
          </div>

          {/* ========================================================
              PHÂN LOẠI & ẢNH RIÊNG TỪNG PHÂN LOẠI (VARIANT PHOTOS)
              ======================================================== */}
          {variants.length > 0 && (
            <div className="p-4 rounded-2xl bg-emerald-50/50 border border-emerald-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="font-extrabold text-emerald-950 uppercase tracking-wider block text-xs">
                    🎨 Phân loại sản phẩm &amp; Ảnh riêng (Variant Photos)
                  </label>
                  <p className="text-[10px] text-gray-500">
                    Bấm &quot;Tải ảnh&quot; để gán ảnh riêng cho từng màu/mẫu. Khách bấm chọn phân loại nào sẽ lập tức đổi ảnh đó.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {variants.map((v, vIdx) => {
                  const varFileId = `var-img-${vIdx}`;
                  const isUploadingThis = uploadingVariantIdx === vIdx;

                  return (
                    <div
                      key={v.variant_id || vIdx}
                      className="flex flex-wrap items-center gap-2.5 bg-white p-2.5 rounded-xl border border-emerald-100 shadow-2xs"
                    >
                      {/* Variant name badge */}
                      <span className="font-bold text-xs text-gray-800 w-28 truncate shrink-0">
                        {v.name}:
                      </span>

                      {/* Photo preview */}
                      <div className="relative w-9 h-9 rounded-lg bg-gray-50 border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center">
                        {v.image_url ? (
                          <Image src={v.image_url} alt="" fill className="object-cover" />
                        ) : (
                          <span className="text-gray-300 text-xs">Không</span>
                        )}
                      </div>

                      {/* Upload button for this variant */}
                      <label
                        htmlFor={varFileId}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[11px] font-bold cursor-pointer border border-emerald-200 shrink-0 transition-colors"
                      >
                        {isUploadingThis ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>Đang tải...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-3 h-3" />
                            <span>Tải ảnh</span>
                          </>
                        )}
                      </label>
                      <input
                        id={varFileId}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={isUploadingThis}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            handleVariantPhotoUpload(file, vIdx);
                          }
                          e.target.value = "";
                        }}
                      />

                      {/* URL input */}
                      <input
                        type="text"
                        value={v.image_url || ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setVariants((prev) =>
                            prev.map((item, i) => (i === vIdx ? { ...item, image_url: val } : item))
                          );
                        }}
                        placeholder="Hoặc dán URL ảnh riêng..."
                        className="flex-1 min-w-[130px] px-2 py-1 rounded-lg border border-gray-200 text-[11px] font-mono outline-none focus:border-emerald-500 bg-white"
                      />

                      {/* Clear photo button */}
                      {v.image_url && (
                        <button
                          type="button"
                          onClick={() => {
                            setVariants((prev) =>
                              prev.map((item, i) => (i === vIdx ? { ...item, image_url: null } : item))
                            );
                          }}
                          className="p-1 text-gray-400 hover:text-red-600 cursor-pointer"
                          title="Gỡ ảnh phân loại này"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ========================================================
              PHÂN BỔ TỒN KHO 2 KHO
              ======================================================== */}
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
                  value={stockWh1}
                  onChange={(e) => setStockWh1(Number(e.target.value) || 0)}
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
                  value={stockWh2}
                  onChange={(e) => setStockWh2(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-xl border border-amber-300 text-xs font-bold text-[#542B07] bg-white"
                />
              </div>
            </div>
            <div className="text-[11px] text-gray-500 flex justify-between pt-1">
              <span>Tổng tồn toàn hệ thống:</span>
              <strong className="text-emerald-900">
                {stockWh1 + stockWh2} sản phẩm
              </strong>
            </div>
          </div>

          {/* ========================================================
              CÁC KHUNG THÔNG TIN CHI TIẾT
              ======================================================== */}
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
                value={overview}
                onChange={(e) => setOverview(e.target.value)}
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
                  value={sizeGuide}
                  onChange={(e) => setSizeGuide(e.target.value)}
                  placeholder="Ví dụ: 35cm x 40cm, quai dài 28cm..."
                  rows={2}
                  className="w-full p-2.5 rounded-xl border border-gray-200 text-xs outline-none focus:border-emerald-600 bg-white"
                />
              </div>

              {/* Khung 3: Chất liệu */}
              <div className="p-3 rounded-2xl bg-gray-50/70 border border-gray-200/80 space-y-1">
                <label className="font-bold text-gray-800 block text-xs">🧶 Khung 3: Chất liệu vải &amp; Phụ liệu</label>
                <textarea
                  value={materials}
                  onChange={(e) => setMaterials(e.target.value)}
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
                  value={careGuide}
                  onChange={(e) => setCareGuide(e.target.value)}
                  placeholder="Ví dụ: Giặt tay nhẹ nhàng, không dùng thuốc tẩy..."
                  rows={2}
                  className="w-full p-2.5 rounded-xl border border-gray-200 text-xs outline-none focus:border-emerald-600 bg-white"
                />
              </div>

              {/* Khung 5: Thông số bổ sung khác */}
              <div className="p-3 rounded-2xl bg-gray-50/70 border border-gray-200/80 space-y-1">
                <label className="font-bold text-gray-800 block text-xs">⚙️ Khung 5: Thông số bổ sung khác</label>
                <textarea
                  value={extraSpecs}
                  onChange={(e) => setExtraSpecs(e.target.value)}
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
                value={impactStory}
                onChange={(e) => setImpactStory(e.target.value)}
                placeholder="Ý nghĩa và mục đích gây quỹ thiện nguyện..."
                rows={2}
                className="w-full p-2.5 rounded-xl border border-emerald-200 text-xs outline-none focus:border-emerald-600 bg-white"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer transition-colors"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-[#1B3622] hover:bg-[#132819] text-white font-extrabold text-xs shadow-xs cursor-pointer transition-colors active:scale-95"
            >
              Lưu thay đổi ➔
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
