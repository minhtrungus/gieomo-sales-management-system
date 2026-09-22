"use client";

import { use, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ProductCard } from "@/components/products/ProductCard";
import { MOCK_PRODUCTS } from "@/lib/data/mockData";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { Badge } from "@/components/ui/Badge";
import { useCartStore } from "@/store/cart";
import { Toast } from "@/components/ui/Toast";

export default function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const product = MOCK_PRODUCTS.find((p) => p.slug === resolvedParams.slug) ?? MOCK_PRODUCTS[0];

  const [selectedVariant, setSelectedVariant] = useState(product.variants?.[0] ?? null);
  const [quantity, setQuantity] = useState(1);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const addItem = useCartStore((state) => state.addItem);

  const currentStock = selectedVariant?.stock ?? 10;
  const isOutOfStock = currentStock <= 0;

  const handleAddToCart = () => {
    if (isOutOfStock) return;

    addItem({
      product_id: product.product_id,
      variant_id: selectedVariant?.variant_id ?? null,
      combo_id: null,
      product_name: product.name,
      variant_name: selectedVariant?.name ?? null,
      price: product.price,
      quantity,
      stock: currentStock,
      image_url: product.images?.[0] ?? null,
    });

    setToastMessage(`Đã thêm ${quantity}x "${product.name}" vào giỏ hàng!`);
  };

  const handleBuyNow = () => {
    handleAddToCart();
    router.push("/checkout");
  };

  const relatedProducts = MOCK_PRODUCTS.filter((p) => p.product_id !== product.product_id).slice(0, 3);

  return (
    <div className="min-h-screen flex flex-col bg-cream/60">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 sm:px-6 py-8 md:py-12">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-xs text-gray-500 mb-6">
          <Link href="/" className="hover:text-emerald-800 transition-colors">Trang chủ</Link>
          <span>/</span>
          <Link href="/products" className="hover:text-emerald-800 transition-colors">Sản phẩm</Link>
          <span>/</span>
          <span className="text-gray-900 font-semibold truncate max-w-[200px] sm:max-w-none">{product.name}</span>
        </nav>

        {/* Product Detail Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 bg-white rounded-3xl p-6 sm:p-8 border border-emerald-100 shadow-xs mb-12">
          {/* Gallery - Left 6 Cols */}
          <div className="lg:col-span-6 space-y-4">
            <div className="relative aspect-4/3 sm:aspect-square w-full rounded-2xl bg-cream border border-emerald-100 overflow-hidden flex items-center justify-center">
              {product.images?.[selectedImageIndex] ? (
                <Image
                  src={product.images[selectedImageIndex]}
                  alt={product.name}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-emerald-800/60">
                  <span className="text-6xl">🧵</span>
                  <span className="text-sm font-medium">Mầm Mơ Handmade</span>
                </div>
              )}
            </div>

            {/* Thumbnails */}
            {product.images && product.images.length > 1 && (
              <div className="flex gap-3">
                {product.images.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedImageIndex(idx)}
                    className={`relative w-20 h-20 rounded-xl overflow-hidden border-2 transition-all ${
                      selectedImageIndex === idx
                        ? "border-emerald-700 ring-2 ring-emerald-700/20"
                        : "border-transparent opacity-70 hover:opacity-100"
                    }`}
                  >
                    <Image src={img} alt="" fill className="object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details - Right 6 Cols */}
          <div className="lg:col-span-6 space-y-6 flex flex-col justify-between">
            <div className="space-y-4">
              {/* Category & Badge */}
              <div className="flex items-center gap-2">
                {product.category && (
                  <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-900 text-xs font-bold uppercase tracking-wider">
                    {product.category.name}
                  </span>
                )}
                {product.badge_label && (
                  <Badge variant="warning">{product.badge_label}</Badge>
                )}
              </div>

              {/* Title */}
              <h1 className="font-heading font-extrabold text-2xl sm:text-3xl text-emerald-950 leading-tight">
                {product.name}
              </h1>

              {/* Price Box */}
              <div className="flex items-baseline gap-3 p-4 rounded-2xl bg-cream/70 border border-emerald-100">
                <MoneyDisplay amount={product.price} className="text-2xl sm:text-3xl font-extrabold text-emerald-950" />
                {product.compare_at_price && (
                  <div className="text-sm text-gray-400 line-through">
                    <MoneyDisplay amount={product.compare_at_price} />
                  </div>
                )}
                {product.compare_at_price && (
                  <span className="ml-auto text-xs font-bold text-red-600 bg-red-100 px-2 py-1 rounded-md">
                    Tiết kiệm {Math.round(((product.compare_at_price - product.price) / product.compare_at_price) * 100)}%
                  </span>
                )}
              </div>

              {/* Short Description */}
              <p className="text-sm text-gray-600 leading-relaxed">
                {product.short_description}
              </p>

              {/* Variant Selector */}
              {product.variants && product.variants.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Phân loại: <span className="text-emerald-800 font-normal">{selectedVariant?.name}</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {product.variants.map((v) => (
                      <button
                        key={v.variant_id}
                        onClick={() => setSelectedVariant(v)}
                        className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-all ${
                          selectedVariant?.variant_id === v.variant_id
                            ? "bg-soft-green border-emerald-600 text-emerald-950 shadow-xs"
                            : "bg-white border-gray-200 text-gray-700 hover:border-emerald-300"
                        }`}
                      >
                        {v.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Stock Status */}
              <div className="flex items-center gap-2 text-xs font-medium">
                <span className={`w-2.5 h-2.5 rounded-full ${currentStock > 0 ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
                <span className={currentStock > 0 ? "text-emerald-800" : "text-red-600 font-bold"}>
                  {currentStock > 0 ? `Còn hàng (Kho: ${currentStock} sản phẩm)` : "Tạm hết hàng"}
                </span>
              </div>

              {/* Quantity Stepper */}
              <div className="space-y-2 pt-2">
                <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                  Số lượng:
                </label>
                <div className="flex items-center gap-3">
                  <div className="flex items-center border border-gray-200 rounded-xl bg-gray-50 p-1">
                    <button
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-white rounded-lg font-bold transition-colors"
                      disabled={quantity <= 1}
                    >
                      -
                    </button>
                    <span className="w-10 text-center font-bold text-sm text-gray-900">
                      {quantity}
                    </span>
                    <button
                      onClick={() => setQuantity((q) => Math.min(currentStock, q + 1))}
                      className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-white rounded-lg font-bold transition-colors"
                      disabled={quantity >= currentStock}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-6 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={handleAddToCart}
                disabled={isOutOfStock}
                className="w-full py-3.5 px-6 rounded-2xl bg-cream hover:bg-emerald-50 border-2 border-emerald-600 text-emerald-950 font-bold text-sm transition-all shadow-xs active:scale-98 disabled:opacity-50"
              >
                🛒 Thêm vào giỏ
              </button>
              <button
                onClick={handleBuyNow}
                disabled={isOutOfStock}
                className="w-full py-3.5 px-6 rounded-2xl bg-emerald-900 hover:bg-emerald-950 text-white font-bold text-sm transition-all shadow-xs active:scale-98 disabled:opacity-50"
              >
                ⚡ Mua ngay
              </button>
            </div>
          </div>
        </div>

        {/* Specs & Impact Tabs */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-emerald-100 shadow-xs mb-12 space-y-6">
          <h3 className="font-heading font-bold text-xl text-emerald-950 border-b border-gray-100 pb-3">
            Thông tin chi tiết & Ý nghĩa gây quỹ
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-3">
              <h4 className="font-semibold text-emerald-900 text-sm uppercase tracking-wider">
                Mô tả sản phẩm
              </h4>
              <div className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                {product.description}
              </div>

              {product.specs && (
                <div className="pt-4 space-y-2">
                  <h4 className="font-semibold text-emerald-900 text-sm uppercase tracking-wider">
                    Quy cách / Chất liệu
                  </h4>
                  <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
                    {Object.entries(product.specs).map(([key, val]) => (
                      <div key={key} className="flex justify-between p-3 text-xs">
                        <span className="font-semibold text-gray-600">{key}</span>
                        <span className="text-gray-900 text-right">{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Impact Box */}
            <div className="p-6 rounded-2xl bg-soft-green/30 border border-soft-green/60 space-y-3">
              <div className="flex items-center gap-2 text-emerald-950 font-bold text-base">
                <span>🌱</span> Ý nghĩa từ Gieo Mơ
              </div>
              <p className="text-sm text-emerald-950/80 leading-relaxed">
                {product.impact_story ?? "100% lợi nhuận từ sản phẩm này sẽ được đóng góp trực tiếp vào quỹ các dự án thiện nguyện vì cộng đồng của Mầm Mơ."}
              </p>
              <div className="pt-2 text-xs font-semibold text-emerald-800">
                ✨ &quot;Little Pieces, Bigger Dreams&quot;
              </div>
            </div>
          </div>
        </div>

        {/* Related Products */}
        <div className="space-y-6">
          <h3 className="font-heading font-bold text-2xl text-emerald-950">
            Sản phẩm liên quan
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {relatedProducts.map((rel) => (
              <ProductCard key={rel.product_id} product={rel} />
            ))}
          </div>
        </div>
      </main>

      <Footer />

      {toastMessage && (
        <Toast type="success" message={toastMessage} onClose={() => setToastMessage(null)} />
      )}
    </div>
  );
}
