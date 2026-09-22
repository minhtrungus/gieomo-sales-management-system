"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { MOCK_CATEGORIES } from "@/lib/data/mockData";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

export default function AdminNewProductPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("cat-1");
  const [price, setPrice] = useState<number>(0);
  const [compareAtPrice, setCompareAtPrice] = useState<number | "">("");
  const [costPrice, setCostPrice] = useState<number | "">("");
  const [status, setStatus] = useState("active");
  const [featured, setFeatured] = useState(false);

  // Variants list
  const [variants, setVariants] = useState([
    { name: "Mặc định", sku: "GM-SKU-01", stock: 20 },
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
  };

  const handleAddVariant = () => {
    setVariants((prev) => [
      ...prev,
      { name: `Phân loại ${prev.length + 1}`, sku: `GM-SKU-0${prev.length + 1}`, stock: 10 },
    ]);
  };

  const handleRemoveVariant = (index: number) => {
    setVariants((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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

            <div>
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block mb-2">
                Mô tả chi tiết sản phẩm & Ý nghĩa gây quỹ:
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Mô tả chất liệu, hoa văn, mục đích gây quỹ..."
                rows={4}
                className="w-full p-3 rounded-2xl border border-gray-200 text-xs outline-none focus:border-soft-green"
              />
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

                  <div className="w-32">
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

                  <div className="w-24">
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
              label="Danh mục sản phẩm *"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              options={MOCK_CATEGORIES.map((c) => ({ value: c.category_id, label: c.name }))}
            />

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

            <Button type="submit" variant="primary" fullWidth size="lg">
              Lưu sản phẩm mới ➔
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
