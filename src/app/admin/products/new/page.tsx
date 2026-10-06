"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { saveNewProduct } from "@/lib/data/orderStore";
import { uploadAsset, uploadAssetsParallel } from "@/lib/services/uploadService";
import { generateSku } from "@/lib/utils/skuGenerator";
import {
  ArrowLeft,
  Plus,
  Trash2,
  X,
  Upload,
  Loader2,
  Star,
  Info,
  Link as LinkIcon,
  ImageIcon,
  Sparkles,
} from "lucide-react";
import { BulkVariantGenerator } from "@/components/admin/BulkVariantGenerator";

export default function AdminNewProductPage() {
  const router = useRouter();

  // Basic info
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [shortDescription, setShortDescription] = useState("");

  // 4 Khung chi tiết sản phẩm
  const [descOverview, setDescOverview] = useState("");
  const [descSize, setDescSize] = useState("");
  const [descMaterials, setDescMaterials] = useState("");
  const [descImpact, setDescImpact] = useState("");

  // Pricing
  const [price, setPrice] = useState<number>(0);
  const [compareAtPrice, setCompareAtPrice] = useState<number | "">("");
  const [costPrice, setCostPrice] = useState<number | "">("");

  // Publication status
  const [status, setStatus] = useState("active");
  const [featured, setFeatured] = useState(false);

  // Unified Media Images: images[0] is the main cover (thumbnail), rest are gallery images
  const [images, setImages] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [customUrl, setCustomUrl] = useState("");
  const [uploadingVariantIdx, setUploadingVariantIdx] = useState<number | null>(null);

  // Form submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Variants list with initial stock 0 (must be stocked via warehouse inflow receipt)
  const [variants, setVariants] = useState([
    { name: "Mặc định", sku: "GM-SP-01", stock: 0, imageUrl: "" },
  ]);

  const handleNameChange = (val: string) => {
    setName(val);
    const generatedSlug = val
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[đĐ]/g, "d")
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");
    setSlug(generatedSlug);

    // Auto-generate SKUs for all variants when product name changes
    setVariants((prev) =>
      prev.map((v, i) => {
        // If sku is empty or starts with GM-, update it with the new product name
        if (!v.sku || v.sku.startsWith("GM-")) {
          return { ...v, sku: generateSku(val, v.name, i) };
        }
        return v;
      })
    );
  };

  const handleAddVariant = () => {
    setVariants((prev) => {
      const nextIdx = prev.length;
      const vName = `Phân loại ${nextIdx + 1}`;
      return [
        ...prev,
        {
          name: vName,
          sku: generateSku(name, vName, nextIdx),
          stock: 20,
          imageUrl: "",
        },
      ];
    });
  };

  const handleRegenerateAllSkus = () => {
    setVariants((prev) =>
      prev.map((v, i) => ({
        ...v,
        sku: generateSku(name, v.name, i),
      }))
    );
  };

  const handleRemoveVariant = (index: number) => {
    setVariants((prev) => prev.filter((_, i) => i !== index));
  };

  // Upload multiple images concurrently with automatic client-side compression
  const handleImagesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    setIsUploading(true);
    setUploadError(null);
    try {
      const { successfulUrls, errors } = await uploadAssetsParallel(fileList, "product-media");
      if (successfulUrls.length > 0) {
        setImages((prev) => Array.from(new Set([...prev, ...successfulUrls])));
      }
      if (errors.length > 0) {
        setUploadError(`Có ${errors.length} ảnh gặp sự cố: ${errors.join("; ")}`);
      }
    } catch (err: any) {
      setUploadError(err?.message || "Lỗi tải ảnh");
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  // Set any image as main cover
  const handleSetAsCover = (index: number) => {
    setImages((prev) => {
      const target = prev[index];
      const rest = prev.filter((_, i) => i !== index);
      return [target, ...rest];
    });
  };

  // Remove an image from gallery
  const handleRemoveImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  // Add image from custom web URL
  const handleAddCustomUrl = () => {
    const trimmed = customUrl.trim();
    if (!trimmed) return;
    setImages((prev) => Array.from(new Set([...prev, trimmed])));
    setCustomUrl("");
    setShowUrlInput(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setSubmitError("Vui lòng nhập tên sản phẩm!");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    const fullDescription = [
      descOverview.trim(),
      descSize.trim() ? `\n\n## Kích thước\n${descSize.trim()}` : "",
      descMaterials.trim() ? `\n\n## Chất liệu\n${descMaterials.trim()}` : "",
      descImpact.trim() ? `\n\n## Ý nghĩa\n${descImpact.trim()}` : "",
    ].filter(Boolean).join("");

    const prodId = `prod-${Date.now()}`;
    const cleanSlug = slug.trim() || `prod-${Date.now()}`;

    // Thumbnail is the 1st image if available
    const mainThumbnail = images[0] || "/images/products/pounch_1.png";
    const allImages = images.length > 0 ? images : [mainThumbnail];

    const newProd = {
      product_id: prodId,
      category_id: null,
      category: null,
      name: name.trim(),
      slug: cleanSlug,
      short_description: shortDescription.trim(),
      description: fullDescription,
      price: Number(price) || 0,
      compare_at_price: compareAtPrice ? Number(compareAtPrice) : null,
      cost_price: costPrice ? Number(costPrice) : null,
      featured,
      status: status as "active" | "draft",
      sort_order: 1,
      thumbnail: mainThumbnail,
      images: allImages,
      impact_story: descImpact.trim() || undefined,
      variants: variants.map((v, i) => {
        const cleanSku =
          v.sku?.trim() ||
          `GM-${(cleanSlug || "PROD").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6)}-0${i + 1}`;
        return {
          variant_id: `var-${Date.now()}-${i}`,
          product_id: prodId,
          name: v.name?.trim() || "Mặc định",
          sku: cleanSku,
          stock: v.stock !== undefined ? Number(v.stock) : 0,
          stock_warehouse_1: (v as any).stock_warehouse_1 !== undefined ? Number((v as any).stock_warehouse_1) : Number(v.stock || 0),
          stock_warehouse_2: (v as any).stock_warehouse_2 !== undefined ? Number((v as any).stock_warehouse_2) : 0,
          price: null,
          compare_at_price: null,
          cost_price: null,
          weight_gram: 100,
          image_url: (v.imageUrl || (v as any).image_url)?.trim() || null,
          status: "active" as const,
          sort_order: i + 1,
          created_at: new Date().toISOString(),
        };
      }),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    try {
      const result = await saveNewProduct(newProd as any);
      if (!result.success) {
        setSubmitError(result.error || "Không thể lưu sản phẩm vào hệ thống!");
        setIsSubmitting(false);
        return;
      }
      router.push("/admin/products");
    } catch (err: any) {
      setSubmitError(err?.message || "Đã xảy ra sự cố khi lưu sản phẩm.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/admin/products" className="p-2 rounded-xl text-gray-500 hover:bg-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-emerald-950">
            Thêm sản phẩm gây quỹ mới
          </h1>
          <p className="text-xs text-gray-500">
            Đăng ký mặt hàng mới vào hệ thống. Số lượng tồn kho sẽ được cập nhật khi làm phiếu Nhập kho.
          </p>
        </div>
      </div>

      {/* Error alert banner */}
      {submitError && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center justify-between">
          <span>⚠️ {submitError}</span>
          <button
            type="button"
            onClick={() => setSubmitError(null)}
            className="text-red-500 hover:text-red-800 text-sm font-bold"
          >
            ✕
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Form Box */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-2xs space-y-4">
            <h3 className="font-heading font-bold text-base text-emerald-950">
              1. Thông tin cơ bản
            </h3>

            <Input
              label="Tên sản phẩm *"
              placeholder="Ví dụ: Pouch May Mắn Mầm Mơ"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              required
            />

            <Input
              label="Đường dẫn thân thiện (Slug) *"
              placeholder="pouch-may-man-mam-mo"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              required
            />

            <Input
              label="Mô tả ngắn (Hiển thị ở card danh mục) *"
              placeholder="Chiếc pouch nhỏ xinh may tay tỉ mỉ từ vải canvas dệt..."
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
              required
            />

            {/* 4 Khung Mô tả & Thông tin chuyên sâu */}
            <div className="space-y-4 pt-2 border-t border-gray-100">
              <div>
                <label className="text-xs font-extrabold text-emerald-950 uppercase tracking-wider block">
                  Nội dung chi tiết sản phẩm (4 Khung chuyên sâu)
                </label>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Điền vào các khung dưới đây để thông tin hiển thị đẹp và rõ ràng trên trang chi tiết sản phẩm.
                </p>
              </div>

              {/* Khung 1: Mô tả chung */}
              <div className="p-3.5 rounded-2xl bg-gray-50/70 border border-gray-200/80 space-y-1.5">
                <label className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                  <span>📋 Khung 1: Mô tả chung sản phẩm *</span>
                </label>
                <textarea
                  value={descOverview}
                  onChange={(e) => setDescOverview(e.target.value)}
                  placeholder="Giới thiệu câu chuyện, đặc điểm thiết kế, phong cách chiếc pouch..."
                  rows={3}
                  className="w-full p-2.5 rounded-xl border border-gray-200 text-xs outline-none focus:border-emerald-600 bg-white"
                  required
                />
              </div>

              {/* Khung 2: Kích thước & Size */}
              <div className="p-3.5 rounded-2xl bg-gray-50/70 border border-gray-200/80 space-y-1.5">
                <label className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                  <span>📏 Khung 2: Kích thước &amp; Bảng Size</span>
                </label>
                <textarea
                  value={descSize}
                  onChange={(e) => setDescSize(e.target.value)}
                  placeholder="Ví dụ: Kích thước: 18cm x 12cm x đáy 4cm. Đựng vừa các loại bút, thước kẻ 15cm..."
                  rows={2}
                  className="w-full p-2.5 rounded-xl border border-gray-200 text-xs outline-none focus:border-emerald-600 bg-white"
                />
              </div>

              {/* Khung 3: Chất liệu & Bảo quản */}
              <div className="p-3.5 rounded-2xl bg-gray-50/70 border border-gray-200/80 space-y-1.5">
                <label className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                  <span>🧶 Khung 3: Chất liệu &amp; Hướng dẫn bảo quản</span>
                </label>
                <textarea
                  value={descMaterials}
                  onChange={(e) => setDescMaterials(e.target.value)}
                  placeholder="Ví dụ: Vải nỉ canvas dệt mộc, lót dù trượt nước. Giặt tay nhẹ nhàng bằng xà phòng loãng..."
                  rows={2}
                  className="w-full p-2.5 rounded-xl border border-gray-200 text-xs outline-none focus:border-emerald-600 bg-white"
                />
              </div>

              {/* Khung 4: Ý nghĩa gây quỹ */}
              <div className="p-3.5 rounded-2xl bg-emerald-50/40 border border-emerald-200/80 space-y-1.5">
                <label className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                  <span>💖 Khung 4: Ý nghĩa gây quỹ Mầm Mơ</span>
                </label>
                <textarea
                  value={descImpact}
                  onChange={(e) => setDescImpact(e.target.value)}
                  placeholder="Ví dụ: 100% lợi nhuận thu được từ sản phẩm này sẽ được quy đổi thành tập vở và học bổng cho các em nhỏ..."
                  rows={2}
                  className="w-full p-2.5 rounded-xl border border-emerald-200 text-xs outline-none focus:border-emerald-600 bg-white"
                />
              </div>
            </div>
          </div>

          {/* Pricing & Financials */}
          <div className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-2xs space-y-4">
            <h3 className="font-heading font-bold text-base text-emerald-950">
              2. Thiết lập Giá & Chi phí
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input
                label="Giá bán (VNĐ) *"
                type="number"
                placeholder="85000"
                value={price || ""}
                onChange={(e) => setPrice(Number(e.target.value))}
                required
              />
              <Input
                label="Giá so sánh (Gốc)"
                type="number"
                placeholder="100000"
                value={compareAtPrice}
                onChange={(e) => setCompareAtPrice(Number(e.target.value))}
              />
              <Input
                label="Giá vốn ước tính (Cost price)"
                type="number"
                placeholder="35000"
                value={costPrice}
                onChange={(e) => setCostPrice(Number(e.target.value))}
              />
            </div>
          </div>

          {/* Variants & Stock Management Rule */}
          <div className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-heading font-bold text-base text-emerald-950">
                  3. Danh sách phân loại (Variants)
                </h3>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Mỗi mặt hàng có thể có các mẫu màu, họa tiết hoặc kích cỡ khác nhau. Mã SKU được tự động khởi tạo.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRegenerateAllSkus}
                  className="text-xs font-bold text-gray-600 hover:text-emerald-800 flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-gray-200 bg-white hover:bg-emerald-50 transition-colors shadow-2xs"
                  title="Tự động tính toán lại toàn bộ mã SKU chuẩn theo tên sản phẩm"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>Tự tạo lại SKU</span>
                </button>
                <button
                  type="button"
                  onClick={handleAddVariant}
                  className="text-xs font-bold text-emerald-800 hover:text-emerald-950 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 transition-colors shadow-2xs"
                >
                  <Plus className="w-4 h-4" /> Thêm phân loại
                </button>
              </div>
            </div>

            {/* Bulk Numbered Variants Tool */}
            <BulkVariantGenerator
              productName={name}
              galleryImages={images}
              variants={variants}
              onVariantsChange={(newVars) => setVariants(newVars as any)}
            />

            {/* Note box explaining stock connection */}
            <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-emerald-50/80 border border-emerald-200/70 text-xs text-emerald-950">
              <Info className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-bold text-[#342A24]">Quy trình khai báo nhập kho:</span>
                <p className="text-[11px] text-[#7E7068] leading-relaxed">
                  Đối với hàng thủ công độc bản đánh số (mỗi mẫu 1 chiếc), bạn có thể nhập trực tiếp tồn kho ban đầu = 1 ở công cụ tạo nhanh phía trên. Đối với hàng đại trà (túi tote, áo...), bạn có thể lập thêm <strong>Phiếu nhập kho</strong> tại mục{" "}
                  <Link href="/admin/inventory" className="font-bold text-[#2D6338] underline hover:text-[#1B3622]">
                    Kiểm kho
                  </Link>.
                </p>
              </div>
            </div>

            {/* Variants table */}
            <div className="space-y-3">
              {variants.map((v, idx) => (
                <div key={idx} className="flex flex-wrap sm:flex-nowrap items-center gap-3 p-3.5 rounded-2xl bg-gray-50 border border-gray-200/70">
                  {/* Variant name */}
                  <div className="flex-1 min-w-[140px]">
                    <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">
                      Tên phân loại
                    </label>
                    <input
                      type="text"
                      placeholder="VD: Màu Hồng pastel"
                      value={v.name}
                      onChange={(e) => {
                        const val = e.target.value;
                        setVariants((prev) =>
                          prev.map((item, i) => {
                            if (i !== idx) return item;
                            const shouldAuto = !item.sku || item.sku.startsWith("GM-");
                            return {
                              ...item,
                              name: val,
                              sku: shouldAuto ? generateSku(name, val, idx) : item.sku,
                            };
                          })
                        );
                      }}
                      className="w-full p-2 rounded-xl border border-gray-200 text-xs font-semibold outline-none focus:border-emerald-600 bg-white"
                      required
                    />
                  </div>

                  {/* SKU */}
                  <div className="w-36 min-w-[130px]">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] font-bold text-gray-500 uppercase block">
                        Mã SKU
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setVariants((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, sku: generateSku(name, item.name, idx) } : item
                            )
                          );
                        }}
                        className="text-[9.5px] font-bold text-emerald-700 hover:text-emerald-900 cursor-pointer"
                        title="Tự động tạo mã SKU chuẩn"
                      >
                        ⚡ Tự tạo
                      </button>
                    </div>
                    <input
                      type="text"
                      placeholder="GM-SP-01"
                      value={v.sku}
                      onChange={(e) => {
                        const val = e.target.value;
                        setVariants((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, sku: val } : item))
                        );
                      }}
                      className="w-full p-2 rounded-xl border border-gray-200 text-xs font-mono outline-none focus:border-emerald-600 bg-white font-semibold text-emerald-950"
                    />
                  </div>

                  {/* Initial stock (Read-only 0) */}
                  <div className="w-24">
                    <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1" title="Tồn kho ban đầu luôn là 0 cho đến khi lập phiếu nhập kho">
                      Tồn ban đầu
                    </label>
                    <div className="w-full p-2 text-center rounded-xl bg-gray-100 border border-gray-200 text-xs font-bold text-gray-500">
                      0
                    </div>
                  </div>

                  {/* Variant Photo */}
                  <div className="min-w-[150px] flex items-center gap-2">
                    <div>
                      <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">
                        Ảnh phân loại
                      </label>
                      <div className="flex items-center gap-1.5">
                        <div className="relative w-8 h-8 rounded-lg bg-white border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center">
                          {v.imageUrl ? (
                            <Image src={v.imageUrl} alt="" fill className="object-cover" unoptimized />
                          ) : (
                            <ImageIcon className="w-3.5 h-3.5 text-gray-300" />
                          )}
                        </div>

                        {/* Upload button for this variant */}
                        <label className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-white hover:bg-emerald-50 text-emerald-800 text-[11px] font-bold cursor-pointer border border-emerald-200 shrink-0 transition-colors">
                          {uploadingVariantIdx === idx ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Upload className="w-3 h-3" />
                          )}
                          <span>{v.imageUrl ? "Đổi" : "Tải ảnh"}</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={uploadingVariantIdx === idx}
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              setUploadingVariantIdx(idx);
                              try {
                                const res = await uploadAsset(file, "product-media");
                                if (res.success && res.url) {
                                  setVariants((prev) =>
                                    prev.map((item, i) =>
                                      i === idx ? { ...item, imageUrl: res.url || "" } : item
                                    )
                                  );
                                } else {
                                  alert(`Lỗi tải ảnh phân loại: ${res.error || "Không thể tải lên"}`);
                                }
                              } catch (err: any) {
                                alert(`Lỗi tải ảnh phân loại: ${err?.message || "Lỗi kết nối"}`);
                              } finally {
                                setUploadingVariantIdx(null);
                                e.target.value = "";
                              }
                            }}
                          />
                        </label>

                        {v.imageUrl && (
                          <button
                            type="button"
                            onClick={() => {
                              setVariants((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, imageUrl: "" } : item))
                              );
                            }}
                            className="p-1 text-gray-400 hover:text-red-500 cursor-pointer"
                            title="Gỡ ảnh phân loại này"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Remove variant button */}
                  {variants.length > 1 && (
                    <div className="pt-4">
                      <button
                        type="button"
                        onClick={() => handleRemoveVariant(idx)}
                        className="p-1.5 text-gray-400 hover:text-red-600 transition-colors rounded-lg hover:bg-red-50"
                        title="Xóa phân loại này"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Settings Sidebar */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-2xs space-y-5 sticky top-24">
            <h3 className="font-heading font-bold text-base text-emerald-950 border-b border-gray-100 pb-3">
              Cấu hình xuất bản
            </h3>

            <Select
              label="Trạng thái xuất bản"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              options={[
                { value: "active", label: "Đang bán (Active)" },
                { value: "draft", label: "Bản nháp (Draft)" },
                { value: "archived", label: "Lưu trữ (Archived)" },
              ]}
            />

            <label className="flex items-center gap-2 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={featured}
                onChange={(e) => setFeatured(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-xs font-bold text-gray-800">Sản phẩm nổi bật (Hero/Featured)</span>
            </label>

            {/* ========================================================
                HÌNH ẢNH & ALBUM SẢN PHẨM (UNIFIED MEDIA MANAGER)
                ======================================================== */}
            <div className="space-y-3 pt-3 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <label className="text-xs font-extrabold text-emerald-950 uppercase tracking-wider block">
                  Hình ảnh &amp; Album sản phẩm *
                </label>
                <span className="text-[10px] text-gray-400">
                  {images.length} ảnh
                </span>
              </div>

              {/* Single Main Upload Box */}
              <label className="flex flex-col items-center justify-center p-5 border-2 border-dashed border-emerald-300 hover:border-emerald-500 rounded-2xl bg-emerald-50/40 hover:bg-emerald-50/70 transition-all cursor-pointer text-center group">
                {isUploading ? (
                  <>
                    <Loader2 className="w-6 h-6 text-emerald-700 animate-spin mb-1.5" />
                    <span className="text-xs font-bold text-emerald-900">Đang tải ảnh lên...</span>
                    <span className="text-[10px] text-gray-500 mt-0.5">Vui lòng chờ giây lát</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-6 h-6 text-emerald-700 group-hover:scale-110 transition-transform mb-1.5" />
                    <span className="text-xs font-bold text-emerald-950">
                      Tải ảnh từ máy tính / điện thoại
                    </span>
                    <span className="text-[11px] text-gray-500 mt-0.5">
                      Có thể chọn cùng lúc nhiều ảnh (JPG, PNG, WebP)
                    </span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  disabled={isUploading}
                  onChange={handleImagesUpload}
                />
              </label>

              {/* Visual Images Grid */}
              {images.length > 0 ? (
                <div className="space-y-2 pt-1">
                  <div className="grid grid-cols-3 gap-2">
                    {images.map((imgUrl, imgIdx) => (
                      <div
                        key={imgIdx}
                        className={`group relative rounded-xl overflow-hidden border-2 aspect-square bg-gray-50 shadow-2xs transition-all ${
                          imgIdx === 0
                            ? "border-amber-400 ring-2 ring-amber-300"
                            : "border-gray-200 hover:border-emerald-300"
                        }`}
                      >
                        <Image src={imgUrl} alt="" fill className="object-cover" unoptimized />

                        {/* Cover Badge for 1st image */}
                        {imgIdx === 0 && (
                          <div className="absolute top-1 left-1 bg-amber-500 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-md shadow-xs flex items-center gap-0.5 z-10">
                            <Star className="w-2.5 h-2.5 fill-white" />
                            <span>Bìa chính</span>
                          </div>
                        )}

                        {/* Hover Overlay Actions */}
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-1.5 z-20">
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => handleRemoveImage(imgIdx)}
                              className="p-1 rounded-full bg-red-600/90 hover:bg-red-600 text-white shadow-xs cursor-pointer transition-colors"
                              title="Xóa ảnh này"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>

                          {imgIdx !== 0 && (
                            <button
                              type="button"
                              onClick={() => handleSetAsCover(imgIdx)}
                              className="w-full py-1 rounded bg-white hover:bg-amber-50 text-amber-900 text-[10px] font-bold text-center shadow-xs cursor-pointer transition-colors"
                              title="Đặt ảnh này làm ảnh bìa chính hiển thị trên card sản phẩm"
                            >
                              ★ Làm ảnh bìa
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <p className="text-[10px] text-gray-500 italic text-center pt-0.5">
                    Ảnh có nhãn <strong className="text-amber-700">★ Bìa chính</strong> sẽ hiển thị trên trang chủ &amp; danh mục. Các ảnh còn lại nằm trong album chi tiết.
                  </p>
                </div>
              ) : (
                <div className="p-3.5 rounded-2xl bg-gray-50 border border-dashed border-gray-200 text-center text-gray-400 text-xs">
                  Chưa có hình ảnh nào. Hãy tải lên ảnh mặt trước, mặt sau và góc cận cảnh.
                </div>
              )}

              {/* Optional: Add via external URL toggle */}
              <div className="pt-1">
                {!showUrlInput ? (
                  <button
                    type="button"
                    onClick={() => setShowUrlInput(true)}
                    className="text-[11px] text-emerald-800 hover:text-emerald-950 font-bold flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <LinkIcon className="w-3 h-3" />
                    <span>Hoặc thêm ảnh từ đường dẫn mạng (URL)</span>
                  </button>
                ) : (
                  <div className="space-y-1.5 p-2.5 rounded-xl bg-gray-50 border border-gray-200">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-gray-600">Dán URL ảnh trực tiếp:</span>
                      <button
                        type="button"
                        onClick={() => setShowUrlInput(false)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex gap-1.5">
                      <input
                        type="url"
                        value={customUrl}
                        onChange={(e) => setCustomUrl(e.target.value)}
                        placeholder="https://example.com/hinh-anh.jpg"
                        className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-[11px] font-mono outline-none bg-white focus:border-emerald-500"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddCustomUrl();
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleAddCustomUrl}
                        className="px-3 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold shrink-0 transition-colors"
                      >
                        Thêm
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              fullWidth
              size="lg"
              disabled={isSubmitting || isUploading}
              className="gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  <span>Đang lưu sản phẩm vào hệ thống...</span>
                </>
              ) : (
                <span>Lưu sản phẩm mới ➔</span>
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
