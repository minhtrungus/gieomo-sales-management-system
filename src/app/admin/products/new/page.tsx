"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { saveNewProduct } from "@/lib/data/orderStore";
import { uploadAsset } from "@/lib/services/uploadService";
import { ArrowLeft, Plus, Trash2, X, Upload, Loader2 } from "lucide-react";

export default function AdminNewProductPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  // 4 Khung chi tiết sản phẩm
  const [descOverview, setDescOverview] = useState("");
  const [descSize, setDescSize] = useState("");
  const [descMaterials, setDescMaterials] = useState("");
  const [descImpact, setDescImpact] = useState("");
  const [price, setPrice] = useState<number>(0);
  const [compareAtPrice, setCompareAtPrice] = useState<number | "">("");
  const [costPrice, setCostPrice] = useState<number | "">("");
  const [status, setStatus] = useState("active");
  const [featured, setFeatured] = useState(false);
  const [imageUrl, setImageUrl] = useState("/images/products/pounch_1.png");
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingGallery, setIsUploadingGallery] = useState(false);
  const [uploadingVariantIdx, setUploadingVariantIdx] = useState<number | null>(null);

  // Variants list
  const [variants, setVariants] = useState([
    { name: "Mặc định", sku: "GM-SKU-01", stock: 20, imageUrl: "" },
  ]);
  const [extraImagesText, setExtraImagesText] = useState("");

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
  };

  const handleAddVariant = () => {
    setVariants((prev) => [
      ...prev,
      {
        name: `Phân loại ${prev.length + 1}`,
        sku: `GM-SKU-0${prev.length + 1}`,
        stock: 10,
        imageUrl: "",
      },
    ]);
  };

  const handleRemoveVariant = (index: number) => {
    setVariants((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const fullDescription = [
      descOverview.trim(),
      descSize.trim() ? `\n\n## Kích thước\n${descSize.trim()}` : "",
      descMaterials.trim() ? `\n\n## Chất liệu\n${descMaterials.trim()}` : "",
      descImpact.trim() ? `\n\n## Ý nghĩa\n${descImpact.trim()}` : "",
    ].filter(Boolean).join("");

    const prodId = `prod-${Date.now()}`;
    const cleanSlug = slug.trim() || `prod-${Date.now()}`;

    const newProd = {
      product_id: prodId,
      category_id: null,
      category: null,
      name,
      slug: cleanSlug,
      short_description: shortDescription,
      description: fullDescription,
      price: Number(price) || 0,
      compare_at_price: compareAtPrice ? Number(compareAtPrice) : null,
      cost_price: costPrice ? Number(costPrice) : null,
      featured,
      status: status as "active" | "draft",
      sort_order: 1,
      thumbnail: imageUrl,
      images: Array.from(
        new Set([
          imageUrl,
          ...extraImagesText
            .split("\n")
            .map((s) => s.trim())
            .filter((s) => s.length > 0),
        ])
      ),
      impact_story: descImpact || undefined,
      variants: variants.map((v, i) => {
        const st = Number(v.stock) || 0;
        const wh1 = Math.ceil(st * 0.7);
        const wh2 = st - wh1;
        return {
          variant_id: `var-${Date.now()}-${i}`,
          product_id: prodId,
          name: v.name,
          sku: v.sku || `GM-${cleanSlug.toUpperCase().slice(0, 6)}-0${i + 1}`,
          stock: st,
          stock_warehouse_1: wh1,
          stock_warehouse_2: wh2,
          price: null,
          compare_at_price: null,
          cost_price: null,
          weight_gram: 100,
          image_url: v.imageUrl?.trim() || null,
          status: "active" as const,
          sort_order: i + 1,
          created_at: new Date().toISOString(),
        };
      }),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    saveNewProduct(newProd as any);
    router.push("/admin/products");
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
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
            Tạo vật phẩm mới đăng bán trên trang chủ Gieo Mơ.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Form Box */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-2xs space-y-4">
            <h3 className="font-heading font-bold text-base text-emerald-950">
              1. Thông tin cơ bản
            </h3>

            <Input
              label="Tên sản phẩm *"
              placeholder="Ví dụ: Pouch Mầm Mơ"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              required
            />

            <Input
              label="Đường dẫn thân thiện (Slug) *"
              placeholder="pouch-mam-mo"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              required
            />

            <Input
              label="Mô tả ngắn (Hiển thị ở card) *"
              placeholder="Chiếc pouch nhỏ xinh may tay tỉ mỉ..."
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
                  Điền vào 4 khung dưới đây để hệ thống hiển thị thông tin mạch lạc trên trang chi tiết sản phẩm.
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
                label="Giá vốn (Cost price)"
                type="number"
                placeholder="35000"
                value={costPrice}
                onChange={(e) => setCostPrice(Number(e.target.value))}
              />
            </div>
          </div>

          {/* Variants */}
          <div className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-bold text-base text-emerald-950">
                3. Danh sách phân loại (Variants) & Tồn kho
              </h3>
              <button
                type="button"
                onClick={handleAddVariant}
                className="text-xs font-bold text-emerald-800 hover:underline flex items-center gap-1"
              >
                <Plus className="w-4 h-4" /> Thêm phân loại
              </button>
            </div>

            <div className="space-y-3">
              {variants.map((v, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 rounded-2xl bg-gray-50 border border-gray-200/60">
                  <div className="flex-1">
                    <input
                      type="text"
                      placeholder="Tên phân loại (VD: Màu hồng)"
                      value={v.name}
                      onChange={(e) => {
                        const val = e.target.value;
                        setVariants((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, name: val } : item))
                        );
                      }}
                      className="w-full p-2 rounded-xl border border-gray-200 text-xs font-semibold outline-none"
                    />
                  </div>

                  <div className="w-28">
                    <input
                      type="text"
                      placeholder="SKU"
                      value={v.sku}
                      onChange={(e) => {
                        const val = e.target.value;
                        setVariants((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, sku: val } : item))
                        );
                      }}
                      className="w-full p-2 rounded-xl border border-gray-200 text-xs font-mono outline-none"
                    />
                  </div>

                  <div className="w-20">
                    <input
                      type="number"
                      placeholder="Tồn kho"
                      value={v.stock}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setVariants((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, stock: val } : item))
                        );
                      }}
                      className="w-full p-2 text-center rounded-xl border border-gray-200 text-xs font-bold outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-2 flex-1 min-w-[220px]">
                    {/* Variant photo preview */}
                    <div className="relative w-8 h-8 rounded-lg bg-white border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center">
                      {v.imageUrl ? (
                        <Image src={v.imageUrl} alt="" fill className="object-cover" />
                      ) : (
                        <span className="text-[10px] text-gray-300">Ảnh</span>
                      )}
                    </div>

                    {/* Variant file upload button */}
                    <label className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[11px] font-bold cursor-pointer border border-emerald-200 shrink-0 transition-colors">
                      {uploadingVariantIdx === idx ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>Tải...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-3 h-3" />
                          <span>Tải ảnh</span>
                        </>
                      )}
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
                                prev.map((item, i) => (i === idx ? { ...item, imageUrl: res.url || "" } : item))
                              );
                            } else {
                              const reader = new FileReader();
                              reader.onload = (ev) => {
                                if (ev.target?.result) {
                                  setVariants((prev) =>
                                    prev.map((item, i) => (i === idx ? { ...item, imageUrl: ev.target!.result as string } : item))
                                  );
                                }
                              };
                              reader.readAsDataURL(file);
                            }
                          } catch (err) {
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                              if (ev.target?.result) {
                                setVariants((prev) =>
                                  prev.map((item, i) => (i === idx ? { ...item, imageUrl: ev.target!.result as string } : item))
                                );
                              }
                            };
                            reader.readAsDataURL(file);
                          } finally {
                            setUploadingVariantIdx(null);
                            e.target.value = "";
                          }
                        }}
                      />
                    </label>

                    <input
                      type="text"
                      placeholder="Hoặc dán URL ảnh riêng..."
                      value={v.imageUrl || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setVariants((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, imageUrl: val } : item))
                        );
                      }}
                      className="flex-1 p-1.5 rounded-xl border border-gray-200 text-[11px] font-mono outline-none bg-white"
                      title="Khi khách chọn phân loại này, ảnh chính sẽ tự động chuyển sang ảnh này"
                    />

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

                  {variants.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveVariant(idx)}
                      className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Settings Sidebar */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-2xs space-y-4 sticky top-24">
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

            <label className="flex items-center gap-2 cursor-pointer pt-2">
              <input
                type="checkbox"
                checked={featured}
                onChange={(e) => setFeatured(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-xs font-bold text-gray-800">Sản phẩm nổi bật (Hero/Featured)</span>
            </label>

            {/* Ảnh sản phẩm & Tải lên */}
            <div className="space-y-2 pt-2 border-t border-gray-100">
              <label className="text-xs font-bold text-gray-800 block">Hình ảnh sản phẩm *</label>
              <div className="flex items-center gap-3">
                <div className="relative w-16 h-16 rounded-2xl bg-[#FFF8EE] border border-[#F0E5D8] overflow-hidden shrink-0 flex items-center justify-center">
                  <Image src={imageUrl} alt="" fill className="object-cover" />
                </div>
                <div className="flex-1 space-y-1.5">
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold cursor-pointer border border-emerald-200 transition-colors">
                    {isUploading ? (
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
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={isUploading}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setIsUploading(true);
                        try {
                          const res = await uploadAsset(file, "product-media");
                          if (res.success && res.url) {
                            setImageUrl(res.url);
                          } else {
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                              if (ev.target?.result) setImageUrl(ev.target.result as string);
                            };
                            reader.readAsDataURL(file);
                          }
                        } catch (err) {
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            if (ev.target?.result) setImageUrl(ev.target.result as string);
                          };
                          reader.readAsDataURL(file);
                        } finally {
                          setIsUploading(false);
                        }
                      }}
                    />
                  </label>
                  <select
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    className="w-full p-1.5 rounded-lg border border-gray-200 text-[11px] text-gray-700 bg-white"
                  >
                    <option value="/images/products/pounch_1.png">Mẫu: Pouch Hồng pastel</option>
                    <option value="/images/products/pounch_2.jpg">Mẫu: Pouch Xanh pastel</option>
                    <option value="/images/products/kep_toc.jpg">Mẫu: Kẹp tóc Nút Áo</option>
                    <option value="/images/products/so_tay.jpg">Mẫu: Sổ tay May Vá</option>
                    <option value="/images/products/set_combo_1.jpg">Mẫu: Set Combo 1</option>
                  </select>
                </div>
              </div>

              {/* Album ảnh phụ (Gallery) */}
              <div className="pt-2 border-t border-gray-100 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-800 block">
                    🖼️ Album ảnh chi tiết (Gallery)
                  </label>
                  <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 text-[11px] font-bold cursor-pointer transition-colors">
                    {isUploadingGallery ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Tải...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-3 h-3" />
                        <span>+ Tải ảnh vào Album</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      disabled={isUploadingGallery}
                      onChange={async (e) => {
                        const files = e.target.files;
                        if (!files || files.length === 0) return;
                        setIsUploadingGallery(true);
                        try {
                          const newUrls: string[] = [];
                          for (let i = 0; i < files.length; i++) {
                            const f = files[i];
                            let url = "";
                            try {
                              const res = await uploadAsset(f, "product-media");
                              if (res.success && res.url) url = res.url;
                            } catch (e) {}
                            if (!url) {
                              url = await new Promise<string>((resolve) => {
                                const reader = new FileReader();
                                reader.onload = (ev) => resolve((ev.target?.result as string) || "");
                                reader.onerror = () => resolve("");
                                reader.readAsDataURL(f);
                              });
                            }
                            if (url) newUrls.push(url);
                          }
                          if (newUrls.length > 0) {
                            setExtraImagesText((prev) => (prev.trim() ? `${prev}\n${newUrls.join("\n")}` : newUrls.join("\n")));
                          }
                        } finally {
                          setIsUploadingGallery(false);
                          e.target.value = "";
                        }
                      }}
                    />
                  </label>
                </div>
                <p className="text-[10px] text-gray-500">
                  Thêm nhiều ảnh góc chụp cận cảnh, chất vải, đường may... Nhập mỗi link ảnh trên 1 dòng:
                </p>
                <textarea
                  value={extraImagesText}
                  onChange={(e) => setExtraImagesText(e.target.value)}
                  placeholder={"/images/products/pounch_1.png\n/images/products/pounch_2.jpg\nhttps://example.com/anh-chi-tiet.jpg"}
                  rows={3}
                  className="w-full p-2 rounded-xl border border-gray-200 text-[11px] font-mono outline-none focus:border-emerald-500 bg-white"
                />
              </div>
            </div>

            <Button type="submit" variant="primary" fullWidth size="lg">
              Lưu sản phẩm mới ➔
            </Button>
          </div>
        </div>
      </form>

    </div>
  );
}
