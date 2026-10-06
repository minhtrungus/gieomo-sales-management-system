"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ProductCard } from "@/components/products/ProductCard";
import { ProductReviews } from "@/components/products/ProductReviews";
import type { ExtendedProduct } from "@/lib/data/mockData";
import { getStoredProducts } from "@/lib/data/orderStore";
import { parseProductDescription, buildProductSpecRows } from "@/lib/utils/productParser";
import { BookOpen, ShieldCheck, SlidersHorizontal, Image as ImageIcon, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, X, RotateCcw } from "lucide-react";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { Badge } from "@/components/ui/Badge";
import { useCartStore } from "@/store/cart";
import { Toast } from "@/components/ui/Toast";

interface ProductDetailClientProps {
  slug: string;
  initialProduct?: ExtendedProduct | null;
  initialRelatedProducts?: ExtendedProduct[];
}

export function ProductDetailClient({
  slug,
  initialProduct,
  initialRelatedProducts = [],
}: ProductDetailClientProps) {
  const router = useRouter();

  const [product, setProduct] = useState<ExtendedProduct | null>(initialProduct ?? null);
  const [isLoading, setIsLoading] = useState<boolean>(!initialProduct);
  const [selectedVariant, setSelectedVariant] = useState<any>(initialProduct?.variants?.[0] ?? null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [customActiveImage, setCustomActiveImage] = useState<string | null>(null);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [lightboxZoom, setLightboxZoom] = useState(1);

  // Keyboard navigation for fullscreen Lightbox
  useEffect(() => {
    if (!isLightboxOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsLightboxOpen(false);
        setLightboxZoom(1);
      } else if (e.key === "ArrowLeft") {
        setCustomActiveImage(null);
        setSelectedImageIndex((prev) => (prev > 0 ? prev - 1 : (product?.images?.length || 1) - 1));
      } else if (e.key === "ArrowRight") {
        setCustomActiveImage(null);
        setSelectedImageIndex((prev) => (prev < (product?.images?.length || 1) - 1 ? prev + 1 : 0));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isLightboxOpen, product?.images?.length]);

  useEffect(() => {
    let isMounted = true;

    const resolveProduct = async () => {
      const decodedSlug = decodeURIComponent(slug);
      const list = getStoredProducts();
      let found = list.find(
        (p) =>
          p.slug === slug ||
          p.slug === decodedSlug ||
          p.product_id === slug ||
          p.product_id === decodedSlug
      ) || initialProduct;

      // If not in localStorage or initialProduct, fallback to API
      if (!found) {
        try {
          const res = await fetch("/api/products?includeDrafts=true");
          if (res.ok) {
            const data = await res.json();
            if (data.products && Array.isArray(data.products)) {
              found = data.products.find(
                (p: ExtendedProduct) =>
                  p.slug === slug ||
                  p.slug === decodedSlug ||
                  p.product_id === slug ||
                  p.product_id === decodedSlug
              );
            }
          }
        } catch (err) {
          console.warn("[ProductDetailClient] Error fetching API products:", err);
        }
      }

      if (isMounted) {
        if (found) {
          setProduct(found);
          setSelectedVariant((prev: any) => {
            const inStockVariant = found?.variants?.find((v: any) => (v.stock === undefined || v.stock === null ? true : Number(v.stock) > 0)) ?? found?.variants?.[0] ?? null;
            if (!prev) return inStockVariant;
            const matchPrev = found?.variants?.find((v: any) => v.variant_id === prev.variant_id);
            if (matchPrev && (matchPrev.stock === undefined || matchPrev.stock === null || Number(matchPrev.stock) > 0)) return matchPrev;
            return matchPrev ?? inStockVariant;
          });
        }
        setIsLoading(false);
      }
    };

    resolveProduct();

    const handleUpdated = () => {
      const decodedSlug = decodeURIComponent(slug);
      const list = getStoredProducts();
      const found = list.find(
        (p) =>
          p.slug === slug ||
          p.slug === decodedSlug ||
          p.product_id === slug ||
          p.product_id === decodedSlug
      );
      if (found) {
        setProduct(found);
        setSelectedVariant((prev: any) => {
          const inStockVariant = found.variants?.find((v: any) => (v.stock === undefined || v.stock === null ? true : Number(v.stock) > 0)) ?? found.variants?.[0] ?? null;
          if (!prev) return inStockVariant;
          const matchPrev = found.variants?.find((v: any) => v.variant_id === prev.variant_id);
          if (matchPrev && (matchPrev.stock === undefined || matchPrev.stock === null || Number(matchPrev.stock) > 0)) return matchPrev;
          return matchPrev ?? inStockVariant;
        });
      }
    };

    window.addEventListener("gieomo_products_updated", handleUpdated);
    return () => {
      isMounted = false;
      window.removeEventListener("gieomo_products_updated", handleUpdated);
    };
  }, [slug, initialProduct]);

  // Pre-fetch checkout route for instantaneous 0ms transition
  useEffect(() => {
    router.prefetch("/checkout");
  }, [router]);

  // Keep document title synchronized with product name on the client tab
  useEffect(() => {
    if (product?.name) {
      document.title = `Gieo Mơ | ${product.name}`;
    }
  }, [product?.name]);

  const [quantity, setQuantity] = useState(1);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Gallery images combined
  const displayImages = useMemo(() => {
    if (!product) return ["/images/products/pounch_1.png"];
    const base = product.images && product.images.length > 0
      ? [...product.images]
      : [product.thumbnail || "/images/products/pounch_1.png"];
    if (product.variants) {
      product.variants.forEach((v) => {
        if (v.image_url && !base.includes(v.image_url)) {
          base.push(v.image_url);
        }
      });
    }
    return base;
  }, [product]);

  // When variant changes, auto-switch to its image if available
  const handleVariantSelect = (v: any) => {
    setSelectedVariant(v);
    if (v.image_url) {
      const idx = displayImages.indexOf(v.image_url);
      if (idx >= 0) {
        setSelectedImageIndex(idx);
        setCustomActiveImage(null);
      } else {
        setCustomActiveImage(v.image_url);
      }
    }
  };

  const parsedInfo = useMemo(() => {
    return parseProductDescription(product?.description || "", product?.specs, product?.impact_story ?? undefined);
  }, [product]);

  const addItem = useCartStore((state) => state.addItem);

  const isNumberedMode = useMemo(() => {
    if (!product?.variants || product.variants.length < 5) return false;
    return product.variants.some((v) => /#?\d+/.test(v.name));
  }, [product?.variants]);

  const availableNumberedCount = useMemo(() => {
    if (!product?.variants) return 0;
    return product.variants.filter((v) => (v.stock === undefined || v.stock === null ? true : Number(v.stock) > 0)).length;
  }, [product?.variants]);

  const currentStock = useMemo(() => {
    if (!product) return 0;
    if (selectedVariant && selectedVariant.stock !== undefined && selectedVariant.stock !== null) {
      return Number(selectedVariant.stock) || 0;
    }
    if (product.variants && product.variants.length > 0) {
      return product.variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
    }
    return Number(product.stock) || 0;
  }, [product, selectedVariant]);

  const isOverallProductOutOfStock = useMemo(() => {
    if (!product) return false;
    if (product.variants && product.variants.length > 0) {
      return product.variants.every((v) => (v.stock !== undefined && v.stock !== null ? Number(v.stock) <= 0 : false));
    }
    return Number(product.stock || 0) <= 0;
  }, [product]);

  const isOutOfStock = currentStock <= 0;

  const specRows = useMemo(() => {
    if (!product) return [];
    return buildProductSpecRows(product, parsedInfo, currentStock);
  }, [product, parsedInfo, currentStock]);

  // Reset quantity when variant changes to prevent stale values exceeding stock
  useEffect(() => {
    setQuantity((prev) => Math.min(prev, currentStock || 1, 1));
  }, [selectedVariant?.variant_id, currentStock]);

  const handleAddToCart = () => {
    if (!product || isOutOfStock) return;

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

  const relatedProducts = initialRelatedProducts.length > 0
    ? initialRelatedProducts
    : getStoredProducts()
        .filter((p) => p.status === "active" && (!product || p.product_id !== product.product_id))
        .slice(0, 3);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-[#FFF8EE]">
        <Navbar />
        <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl py-16 flex flex-col items-center justify-center">
          <div className="w-10 h-10 border-4 border-[#BFE9C3] border-t-[#2D6338] rounded-full animate-spin mb-4" />
          <p className="text-xs sm:text-sm font-medium text-[#7E7068]">Đang tải thông tin sản phẩm...</p>
        </main>
        <Footer />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex flex-col bg-[#FFF8EE]">
        <Navbar />
        <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 max-w-xl py-16 text-center flex flex-col items-center justify-center">
          <div className="w-16 h-16 rounded-3xl bg-[#FFF0E6] flex items-center justify-center text-3xl mb-4 shadow-soft">
            🌱
          </div>
          <h1 className="font-heading font-extrabold text-2xl sm:text-3xl text-[#231B16] mb-3 tracking-tight">
            Không tìm thấy sản phẩm
          </h1>
          <p className="text-xs sm:text-sm text-[#7E7068] mb-8 leading-relaxed max-w-md">
            Sản phẩm bạn đang tìm kiếm có thể đã được cập nhật, tạm dừng gây quỹ hoặc đường dẫn không chính xác.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            <Link
              href="/products"
              className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-bold text-xs sm:text-sm transition-all shadow-soft text-center cursor-pointer"
            >
              Khám phá sản phẩm khác
            </Link>
            <Link
              href="/"
              className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-white border border-[#F0E5D8] hover:bg-gray-50 text-[#7E7068] font-bold text-xs sm:text-sm transition-all text-center cursor-pointer"
            >
              Về trang chủ
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-cream/60">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl py-8 pb-24 sm:pb-12">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-xs text-gray-500 mb-6">
          <Link href="/" className="hover:text-emerald-800 transition-colors">Trang chủ</Link>
          <span>/</span>
          <Link href="/products" className="hover:text-emerald-800 transition-colors">Sản phẩm</Link>
          <span>/</span>
          <span className="text-gray-900 font-semibold truncate max-w-[200px] sm:max-w-none">{product.name}</span>
        </nav>

        {/* Product Detail Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 bg-white rounded-3xl p-6 sm:p-8 border border-[#F0E5D8] shadow-soft mb-12">
          {/* Gallery - Left 6 Cols */}
          <div className="lg:col-span-6 space-y-4">
            <div 
              onClick={() => {
                setIsLightboxOpen(true);
                setLightboxZoom(1);
              }}
              className="relative aspect-4/3 sm:aspect-square w-full rounded-2xl bg-[#FFF8EE] border border-[#F0E5D8] overflow-hidden flex items-center justify-center group/gallery select-none cursor-zoom-in"
              title="Nhấp để phóng to ảnh xem chi tiết các mẫu"
            >
              {/* Ambient backdrop for non-square photos */}
              {displayImages[selectedImageIndex] && (
                <div 
                  className="absolute inset-0 opacity-20 filter blur-xl scale-110 pointer-events-none"
                  style={{
                    backgroundImage: `url(${customActiveImage || displayImages[selectedImageIndex]})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                />
              )}

              {/* Render all display images with smooth, gentle crossfade transition */}
              {displayImages.map((img, idx) => {
                const isCurrent = !customActiveImage && selectedImageIndex === idx;
                return (
                  <div
                    key={img + idx}
                    className={`absolute inset-0 flex items-center justify-center p-2 transition-all duration-500 ease-out ${
                      isCurrent
                        ? "opacity-100 scale-100 z-10"
                        : "opacity-0 scale-[1.02] pointer-events-none z-0"
                    }`}
                  >
                    <Image
                      src={img}
                      alt={`${product.name} - ${idx + 1}`}
                      fill
                      sizes="(max-width: 1024px) 100vw, 50vw"
                      className="object-contain"
                      priority={idx === 0}
                    />
                  </div>
                );
              })}

              {/* Custom Variant Active Image (if selected directly) */}
              {customActiveImage && (
                <div className="absolute inset-0 z-20 flex items-center justify-center p-2 transition-all duration-500 ease-out opacity-100 scale-100">
                  <Image
                    src={customActiveImage}
                    alt={product.name}
                    fill
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    className="object-contain"
                  />
                </div>
              )}

              {/* Hover Zoom Badge */}
              <div className="absolute top-3 right-3 z-30 px-2.5 py-1.5 rounded-full bg-black/60 hover:bg-black/80 text-white text-[11px] font-bold backdrop-blur-xs flex items-center gap-1.5 transition-all shadow-md">
                <Maximize2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Phóng to xem chi tiết</span>
              </div>

              {/* Navigation Arrows if more than 1 image */}
              {displayImages.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCustomActiveImage(null);
                      setSelectedImageIndex((prev) => (prev > 0 ? prev - 1 : displayImages.length - 1));
                    }}
                    className="absolute left-3 top-1/2 -translate-y-1/2 z-30 p-2.5 rounded-full bg-white/90 hover:bg-white text-[#342A24] shadow-soft backdrop-blur-xs opacity-0 group-hover/gallery:opacity-100 transition-all duration-300 active:scale-95 cursor-pointer"
                    aria-label="Ảnh trước"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCustomActiveImage(null);
                      setSelectedImageIndex((prev) => (prev < displayImages.length - 1 ? prev + 1 : 0));
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 z-30 p-2.5 rounded-full bg-white/90 hover:bg-white text-[#342A24] shadow-soft backdrop-blur-xs opacity-0 group-hover/gallery:opacity-100 transition-all duration-300 active:scale-95 cursor-pointer"
                    aria-label="Ảnh tiếp theo"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>

                  {/* Slide dots indicator */}
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-xs">
                    {displayImages.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedImageIndex(i);
                          setCustomActiveImage(null);
                        }}
                        className={`h-1.5 rounded-full transition-all duration-500 cursor-pointer ${
                          selectedImageIndex === i && !customActiveImage ? "w-5 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80"
                        }`}
                        aria-label={`Chuyển đến ảnh ${i + 1}`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Thumbnails */}
            {displayImages.length > 1 && (
              <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
                {displayImages.map((img, idx) => {
                  const isActive = selectedImageIndex === idx && !customActiveImage;
                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        setSelectedImageIndex(idx);
                        setCustomActiveImage(null);
                      }}
                      className={`relative w-20 h-20 rounded-2xl overflow-hidden border-2 shrink-0 transition-all duration-300 cursor-pointer bg-[#FFF8EE] ${
                        isActive
                          ? "border-[#2D6338] ring-2 ring-[#2D6338]/20 shadow-soft scale-105"
                          : "border-[#F0E5D8] opacity-60 hover:opacity-100 hover:border-[#FFB98A]"
                      }`}
                    >
                      <Image src={img} alt="" fill sizes="80px" className="object-contain transition-transform duration-500 hover:scale-105" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Details - Right 6 Cols */}
          <div className="lg:col-span-6 space-y-6 flex flex-col justify-between">
            <div className="space-y-4">
              {/* Badge */}
              {product.badge_label && (
                <div className="flex items-center gap-2">
                  <Badge variant="warning">{product.badge_label}</Badge>
                </div>
              )}

              {/* Title */}
              <h1 className="font-heading font-extrabold text-2xl sm:text-3xl text-emerald-950 leading-tight text-balance">
                {product.name}
              </h1>

              {/* Price Box */}
              <div className="flex items-baseline gap-3 p-4 rounded-2xl bg-cream/70 border border-emerald-100">
                <MoneyDisplay amount={product.price} className="text-2xl sm:text-3xl font-extrabold text-emerald-950 whitespace-nowrap" />
                {product.compare_at_price && (
                  <div className="text-sm text-gray-400 line-through whitespace-nowrap">
                    <MoneyDisplay amount={product.compare_at_price} />
                  </div>
                )}
                {product.compare_at_price && (
                  <span className="ml-auto text-xs font-bold text-red-600 bg-red-100 px-2 py-1 rounded-md whitespace-nowrap">
                    Tiết kiệm {Math.round(((product.compare_at_price - product.price) / product.compare_at_price) * 100)}%
                  </span>
                )}
              </div>

              {/* Short Description */}
              <p className="text-sm text-gray-600 leading-relaxed text-left text-pretty">
                {product.short_description}
              </p>

              {/* Variant Selector */}
              {product.variants && product.variants.length > 0 && (
                isNumberedMode ? (
                  <div className="space-y-3 p-4 rounded-2xl bg-[#FFFDF8] border border-[#F0E5D8] shadow-2xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <label className="text-xs font-bold text-gray-800 uppercase tracking-wider block">
                          🔢 Chọn mẫu theo số (Ghi trên bảng ảnh):
                        </label>
                        <span className="text-[11px] text-gray-500 font-medium">
                          Mỗi mẫu là duy nhất (1 chiếc) • Còn lại{" "}
                          <strong className="text-emerald-800 font-extrabold">{availableNumberedCount}</strong>/{product.variants.length} mẫu
                        </span>
                      </div>
                      {selectedVariant && (
                        <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-900 font-extrabold text-xs">
                          Đang chọn: {selectedVariant.name}
                        </span>
                      )}
                    </div>

                    {/* Scrollable / Responsive Matrix */}
                    <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-1.5 max-h-56 overflow-y-auto p-1.5 rounded-xl bg-white/80 border border-gray-100 scrollbar-thin">
                      {product.variants.map((v) => {
                        const isSelected = selectedVariant?.variant_id === v.variant_id;
                        const isSold = v.stock !== undefined && v.stock !== null && Number(v.stock) <= 0;

                        return (
                          <button
                            key={v.variant_id}
                            type="button"
                            disabled={isSold}
                            onClick={() => handleVariantSelect(v)}
                            title={isSold ? `${v.name} (Đã có người mua)` : `Chọn ${v.name}`}
                            className={`py-2 px-1 rounded-xl text-xs font-bold font-mono transition-all text-center relative cursor-pointer select-none ${
                              isSold
                                ? "bg-gray-100 text-gray-400 line-through border border-gray-200 cursor-not-allowed opacity-50"
                                : isSelected
                                ? "bg-emerald-800 text-white border-2 border-emerald-900 shadow-sm scale-105 z-10 ring-2 ring-emerald-600/30"
                                : "bg-white hover:bg-emerald-50 text-gray-800 border border-[#F0E5D8] hover:border-emerald-400 shadow-2xs hover:scale-102"
                            }`}
                          >
                            {v.name.replace(/^Mẫu\s*/i, "")}
                            {isSold && (
                              <span className="sr-only">(Đã bán)</span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    <p className="text-[11px] text-gray-500 italic bg-amber-50/70 text-amber-900 p-2 rounded-xl border border-amber-200/60">
                      💡 Bấm chọn số để hệ thống tự chuyển đến ảnh chụp mẫu đó. Các số bị gạch ngang là đã có người mua.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Phân loại: <span className="text-emerald-800 font-normal">{selectedVariant?.name}</span>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {product.variants.map((v) => {
                        const isSold = v.stock !== undefined && v.stock !== null && Number(v.stock) <= 0;
                        return (
                          <button
                            key={v.variant_id}
                            type="button"
                            disabled={isSold}
                            onClick={() => handleVariantSelect(v)}
                            className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-all flex items-center gap-2 cursor-pointer ${
                              isSold
                                ? "bg-gray-100 text-gray-400 line-through border-gray-200 cursor-not-allowed opacity-60"
                                : selectedVariant?.variant_id === v.variant_id
                                ? "bg-soft-green border-emerald-600 text-emerald-950 shadow-xs ring-2 ring-emerald-600/20"
                                : "bg-white border-gray-200 text-gray-700 hover:border-emerald-300"
                            }`}
                          >
                            {v.image_url && (
                              <span className="relative w-4 h-4 rounded-full overflow-hidden shrink-0 inline-block border border-gray-300">
                                <Image src={v.image_url} alt="" fill className="object-cover" />
                              </span>
                            )}
                            <span>{v.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )
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
                className={`w-full py-3.5 px-6 rounded-2xl font-bold text-sm transition-all shadow-xs flex items-center justify-center gap-1.5 ${
                  isOutOfStock
                    ? "bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed"
                    : "bg-cream hover:bg-emerald-50 border-2 border-emerald-600 text-emerald-950 active:scale-98 cursor-pointer"
                }`}
              >
                {isOverallProductOutOfStock
                  ? "Tạm hết hàng"
                  : isOutOfStock
                  ? "Mẫu này đã hết (Chọn mẫu khác)"
                  : "🛒 Thêm vào giỏ"}
              </button>
              <button
                onClick={handleBuyNow}
                onMouseEnter={() => router.prefetch("/checkout")}
                disabled={isOutOfStock}
                className={`w-full py-3.5 px-6 rounded-2xl font-bold text-sm transition-all shadow-xs flex items-center justify-center gap-1.5 ${
                  isOutOfStock
                    ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                    : "bg-emerald-900 hover:bg-emerald-950 text-white active:scale-98 cursor-pointer"
                }`}
              >
                {isOverallProductOutOfStock
                  ? "Đang chờ nhập hàng"
                  : isOutOfStock
                  ? "Vui lòng chọn mẫu còn hàng"
                  : "⚡ Mua ngay"}
              </button>
            </div>
          </div>
        </div>

        {/* Specs & Impact Unified Section */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-emerald-100 shadow-soft mb-12 space-y-6">
          <div className="border-b border-gray-100 pb-4">
            <h3 className="font-heading font-extrabold text-xl text-emerald-950 text-balance">
              Thông tin sản phẩm &amp; Ý nghĩa Mầm Mơ
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Chi tiết quy cách, chất liệu thủ công và giá trị thiện nguyện trong từng sản phẩm.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Cột chính: Mô tả chi tiết & Bảng Thông số */}
            <div className="lg:col-span-8 space-y-6">
              {/* 1. Mô tả chi tiết */}
              <div className="space-y-2">
                <h4 className="font-bold text-emerald-950 text-sm uppercase tracking-wider flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-[#2D6338]" />
                  <span>Mô tả chi tiết</span>
                </h4>
                <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-line bg-gray-50/70 p-4 sm:p-5 rounded-2xl border border-gray-100 text-left text-pretty">
                  {parsedInfo.overview || product.description}
                </div>
              </div>

              {/* 2. Thông tin bổ sung & Bảng thông số */}
              <div className="space-y-2.5">
                <h4 className="font-bold text-emerald-950 text-sm uppercase tracking-wider flex items-center gap-1.5">
                  <SlidersHorizontal className="w-4 h-4 text-[#2D6338]" />
                  <span>Thông tin bổ sung</span>
                </h4>

                <div className="rounded-2xl border border-gray-200/90 overflow-hidden bg-white shadow-2xs">
                  <div className="divide-y divide-gray-100 text-xs sm:text-sm">
                    {specRows.map((row: any, idx: number) => (
                      <div
                        key={row.label}
                        className={`flex items-start transition-colors ${
                          idx % 2 === 0 ? "bg-[#FCFAF7]/90" : "bg-white"
                        } hover:bg-emerald-50/40`}
                      >
                        <div className="w-36 sm:w-48 py-3 px-4 text-gray-500 font-medium shrink-0 border-r border-gray-100/90 flex items-center">
                          {row.label}
                        </div>
                        <div className="py-3 px-4 text-gray-900 font-semibold leading-relaxed flex-1 whitespace-pre-line text-left text-pretty">
                          {row.value}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {parsedInfo.sizeGuide && (
                  <p className="text-[11px] text-gray-400 italic px-1">
                    * Kích thước thực tế có thể có dung sai nhỏ (±0.5 - 1cm) do đặc thù cắt may thủ công từ vải mộc.
                  </p>
                )}
              </div>
            </div>

            {/* Cột phụ: Ý nghĩa gây quỹ & Cam kết chất lượng */}
            <div className="lg:col-span-4 space-y-4 flex flex-col justify-start">
              {/* Box Ý nghĩa gây quỹ */}
              <div className="p-5 sm:p-6 rounded-2xl bg-soft-green/30 border border-soft-green/60 space-y-3">
                <div className="flex items-center gap-2 text-emerald-950 font-bold text-base">
                  <span>🌱</span>
                  <span>Ý nghĩa từ Gieo Mơ</span>
                </div>
                <p className="text-xs sm:text-sm text-emerald-950/85 leading-relaxed whitespace-pre-line text-left text-pretty">
                  {parsedInfo.impactStory || product.impact_story || "100% lợi nhuận thu được từ mỗi sản phẩm bạn mua sẽ được quy đổi thành tập vở, áo ấm và học bổng cho các em nhỏ tại các điểm trường khó khăn."}
                </p>
                <div className="pt-2 border-t border-emerald-200/50 text-xs font-bold text-emerald-900 flex items-center justify-between">
                  <span>✨ &quot;Gom từng mảnh nhỏ, dệt thành giấc mơ&quot;</span>
                  <span>Mầm Mơ</span>
                </div>
              </div>

              {/* Box Cam kết chất lượng */}
              <div className="p-5 rounded-2xl bg-[#FFF8EE] border border-[#F0E5D8] space-y-2">
                <span className="text-xs font-extrabold text-[#542B07] flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#2D6338]" />
                  Cam kết chất lượng
                </span>
                <p className="text-xs text-[#7E7068] leading-relaxed text-left text-pretty">
                  Sản phẩm được tuyển chọn kỹ lưỡng, đường may tỉ mỉ và đóng gói cẩn thận.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Product Reviews & Comments */}
        <ProductReviews
          productId={product.product_id}
          productName={product.name}
          productSlug={product.slug}
        />

        {/* Related Products */}
        <div className="space-y-6">
          <h3 className="font-heading font-bold text-2xl text-emerald-950">
            Sản phẩm liên quan
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
            {relatedProducts.map((rel) => (
              <ProductCard key={rel.product_id} product={rel} />
            ))}
          </div>
        </div>
      </main>

      {/* Mobile Sticky CTA Bar */}
      <aside aria-label="Thanh mua hàng nhanh" className="sm:hidden fixed bottom-0 left-0 right-0 p-3 bg-[#FFFDF9]/95 backdrop-blur-md border-t border-[#F0E5D8] z-30 flex items-center justify-between gap-3 shadow-lg">
        <div className="flex flex-col min-w-0">
          <span className="text-[10px] text-[#7E7068] font-bold uppercase tracking-wider">Tổng tiền</span>
          <MoneyDisplay amount={product.price * quantity} className="text-base font-extrabold text-[#231B16] truncate" />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleAddToCart}
            disabled={isOutOfStock}
            className={`px-3.5 py-2.5 rounded-xl font-bold text-xs transition-all shadow-xs flex items-center gap-1 ${
              isOutOfStock
                ? "bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed"
                : "bg-cream border border-[#2D6338] text-[#1B3622] active:scale-95 cursor-pointer"
            }`}
          >
            🛒 Giỏ
          </button>
          <button
            onClick={handleBuyNow}
            disabled={isOutOfStock}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-all shadow-xs flex items-center gap-1 ${
              isOutOfStock
                ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                : "bg-[#2D6338] hover:bg-[#1B3622] text-white active:scale-95 cursor-pointer"
            }`}
          >
            ⚡ Mua ngay
          </button>
        </div>
      </aside>

      {/* FULLSCREEN LIGHTBOX MODAL */}
      {isLightboxOpen && (
        <div 
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col justify-between p-3 sm:p-6 animate-fade-in select-none"
          onClick={() => {
            setIsLightboxOpen(false);
            setLightboxZoom(1);
          }}
        >
          {/* Lightbox Top Header */}
          <div 
            className="flex items-center justify-between z-10 w-full max-w-5xl mx-auto text-white/90"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="font-heading font-extrabold text-sm sm:text-base text-white">
                {product.name}
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-white/20 text-white font-mono text-xs font-bold">
                {selectedImageIndex + 1} / {displayImages.length}
              </span>
            </div>

            {/* Zoom & Close Controls */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => setLightboxZoom((prev) => Math.max(1, prev - 0.5))}
                disabled={lightboxZoom <= 1}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/25 text-white disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
                title="Thu nhỏ"
                aria-label="Thu nhỏ ảnh"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setLightboxZoom(1)}
                className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/25 text-white text-xs font-bold transition-all cursor-pointer"
                title="Kích thước ban đầu"
              >
                {Math.round(lightboxZoom * 100)}%
              </button>
              <button
                type="button"
                onClick={() => setLightboxZoom((prev) => Math.min(3, prev + 0.5))}
                disabled={lightboxZoom >= 3}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/25 text-white disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
                title="Phóng to"
                aria-label="Phóng to ảnh"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsLightboxOpen(false);
                  setLightboxZoom(1);
                }}
                className="p-2 rounded-xl bg-white/20 hover:bg-red-500 text-white transition-all ml-2 cursor-pointer"
                title="Đóng (ESC)"
                aria-label="Đóng cửa sổ phóng to"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Lightbox Main Active Image */}
          <div 
            className="relative flex-1 w-full max-w-5xl mx-auto flex items-center justify-center overflow-hidden my-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div 
              className="relative w-full h-full flex items-center justify-center transition-transform duration-200 ease-out"
              style={{ transform: `scale(${lightboxZoom})` }}
            >
              <Image
                src={customActiveImage || displayImages[selectedImageIndex]}
                alt={`${product.name} - Phóng to`}
                fill
                sizes="100vw"
                className="object-contain"
                priority
              />
            </div>

            {/* Prev / Next Arrows */}
            {displayImages.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCustomActiveImage(null);
                    setSelectedImageIndex((prev) => (prev > 0 ? prev - 1 : displayImages.length - 1));
                  }}
                  className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full bg-black/60 hover:bg-black/90 text-white border border-white/20 shadow-lg transition-all active:scale-90 cursor-pointer"
                  aria-label="Ảnh trước"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCustomActiveImage(null);
                    setSelectedImageIndex((prev) => (prev < displayImages.length - 1 ? prev + 1 : 0));
                  }}
                  className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full bg-black/60 hover:bg-black/90 text-white border border-white/20 shadow-lg transition-all active:scale-90 cursor-pointer"
                  aria-label="Ảnh tiếp theo"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </>
            )}
          </div>

          {/* Lightbox Bottom Thumbnail Strip */}
          {displayImages.length > 1 && (
            <div 
              className="z-10 w-full max-w-2xl mx-auto flex items-center justify-center gap-2 overflow-x-auto py-2 scrollbar-none"
              onClick={(e) => e.stopPropagation()}
            >
              {displayImages.map((img, idx) => {
                const isActive = selectedImageIndex === idx && !customActiveImage;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setSelectedImageIndex(idx);
                      setCustomActiveImage(null);
                    }}
                    className={`relative w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden border-2 shrink-0 transition-all cursor-pointer bg-white/5 ${
                      isActive
                        ? "border-emerald-400 ring-2 ring-emerald-400/50 scale-105"
                        : "border-white/30 opacity-60 hover:opacity-100 hover:border-white"
                    }`}
                  >
                    <Image src={img} alt="" fill sizes="64px" className="object-contain" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <Footer />

      {toastMessage && (
        <div className="fixed bottom-16 sm:bottom-5 right-5 z-50 animate-slide-up pointer-events-auto">
          <Toast type="success" message={toastMessage} onClose={() => setToastMessage(null)} />
        </div>
      )}
    </div>
  );
}
