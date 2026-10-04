"use client";

import Link from "next/link";
import Image from "next/image";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import {
  getStoredCombos,
  getStoredProducts,
  type ExtendedCombo,
  type ExtendedProduct,
} from "@/lib/data/orderStore";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { Badge } from "@/components/ui/Badge";
import { useCartStore } from "@/store/cart";
import { useState, useEffect, useMemo } from "react";
import { Toast } from "@/components/ui/Toast";
import { Plus, Sparkles, CheckCircle2 } from "lucide-react";

interface ResolvedComboItem {
  product_id?: string;
  name: string;
  quantity: number;
  price: number;
  thumbnail?: string;
}

// Fallback pricing for signature catalog items when item snapshot or product is missing
const CATALOG_FALLBACK_PRICES: Record<string, { name: string; price: number }> = {
  pouch: { name: "Pouch Mầm Mơ", price: 85000 },
  kep: { name: "Kẹp tóc Nút Áo", price: 45000 },
  keychain: { name: "Móc khóa Keychain Gieo Mơ", price: 35000 },
  mockhoa: { name: "Móc khóa Keychain Gieo Mơ", price: 35000 },
  vo: { name: "Vở Gieo Mơ / Sổ tay", price: 30000 },
  so: { name: "Sổ tay Mầm Mơ", price: 30000 },
  sticker: { name: "Sticker Pack Mầm Mơ", price: 35000 },
  tote: { name: "Túi Tote Gieo Mơ", price: 120000 },
  kimchi: { name: "Bộ Kim Chỉ Mầm Mơ", price: 65000 },
};

function normalizeText(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .trim();
}

function resolveComboItems(
  combo: ExtendedCombo,
  availableProducts: ExtendedProduct[]
): ResolvedComboItem[] {
  // 1. If combo has explicit items defined
  if (combo.items && combo.items.length > 0) {
    return combo.items.map((it: any) => {
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
      const unitPrice =
        found?.price ??
        it.product?.price ??
        it.price ??
        (pName && getPriceFromKeywords(pName)) ??
        40000;

      return {
        product_id: found?.product_id || pId,
        name: found?.name || pName || "Sản phẩm quà ghép",
        quantity: qty,
        price: unitPrice,
        thumbnail: found?.thumbnail || it.product?.thumbnail,
      };
    });
  }

  // 2. Fallback: Parse description when items list is empty (e.g. "Gồm 1 pouch Gieo Mơ + 1 Vở Gieo Mơ")
  const desc = combo.description || "";
  const cleanedDesc = desc.replace(/^(gồm|bao gồm|set quà gồm)\s*/i, "").trim();
  if (!cleanedDesc) return [];

  const parts = cleanedDesc.split(/[+,]/);
  const parsedItems: ResolvedComboItem[] = [];

  for (const part of parts) {
    const raw = part.trim();
    if (!raw) continue;

    // Match leading quantity: e.g. "1 Pouch Gieo Mơ" or "2 Kẹp tóc"
    const match = raw.match(/^(\d+)?\s*(.+)$/);
    const qty = match && match[1] ? Math.max(1, parseInt(match[1])) : 1;
    const itemName = match && match[2] ? match[2].trim() : raw;
    const norm = normalizeText(itemName);

    // Try matching available products
    const foundProd = availableProducts.find((p) => {
      const pNorm = normalizeText(p.name);
      return norm.includes(pNorm) || pNorm.includes(norm);
    });

    let price = foundProd?.price;
    if (!price) {
      price = getPriceFromKeywords(norm);
    }

    parsedItems.push({
      product_id: foundProd?.product_id,
      name: foundProd?.name || itemName,
      quantity: qty,
      price: price || 40000,
      thumbnail: foundProd?.thumbnail || undefined,
    });
  }

  return parsedItems;
}

function getPriceFromKeywords(text: string): number {
  const norm = normalizeText(text);
  if (norm.includes("pouch") || norm.includes("tui")) return CATALOG_FALLBACK_PRICES.pouch.price;
  if (norm.includes("kep") || norm.includes("nut ao")) return CATALOG_FALLBACK_PRICES.kep.price;
  if (norm.includes("keychain") || norm.includes("moc khoa")) return CATALOG_FALLBACK_PRICES.keychain.price;
  if (norm.includes("vo") || norm.includes("so") || norm.includes("tap")) return CATALOG_FALLBACK_PRICES.vo.price;
  if (norm.includes("sticker")) return CATALOG_FALLBACK_PRICES.sticker.price;
  if (norm.includes("kim chi") || norm.includes("may va")) return CATALOG_FALLBACK_PRICES.kimchi.price;
  return 40000;
}

export default function CombosPage() {
  const addItem = useCartStore((state) => state.addItem);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [combos, setCombos] = useState<ExtendedCombo[]>([]);
  const [availableProducts, setAvailableProducts] = useState<ExtendedProduct[]>([]);

  useEffect(() => {
    setCombos(getStoredCombos().filter((c) => c.status === "active"));
    setAvailableProducts(getStoredProducts());

    const handleUpdate = () => {
      setCombos(getStoredCombos().filter((c) => c.status === "active"));
      setAvailableProducts(getStoredProducts());
    };

    window.addEventListener("gieomo_combos_updated", handleUpdate);
    window.addEventListener("gieomo_products_updated", handleUpdate);
    return () => {
      window.removeEventListener("gieomo_combos_updated", handleUpdate);
      window.removeEventListener("gieomo_products_updated", handleUpdate);
    };
  }, []);

  const handleAddCombo = (combo: ExtendedCombo) => {
    const thumb = combo.thumbnail || combo.images?.[0] || undefined;
    addItem({
      product_id: `combo-${combo.combo_id}`,
      variant_id: null,
      combo_id: combo.combo_id,
      product_name: combo.name,
      variant_name: "Set Combo",
      price: combo.price,
      quantity: 1,
      stock: 20,
      image_url: thumb ?? null,
    });

    setToastMessage(`Đã thêm "${combo.name}" vào giỏ hàng!`);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FFF8EE]">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl py-8 md:py-12">
        {/* Header */}
        <div className="max-w-2xl mb-8 space-y-2">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/95 border border-[#FFB98A] shadow-soft text-xs font-bold text-[#4A2603] animate-float whitespace-nowrap">
            <Sparkles className="w-3.5 h-3.5 text-[#FFB98A] shrink-0" />
            <span>Dự án gây quỹ thiện nguyện của Mầm Mơ</span>
          </div>
          <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-[#231B16] tracking-tight text-balance">
            Combo Gieo Mơ
          </h1>
          <p className="text-[#7E7068] text-xs sm:text-sm leading-relaxed text-left text-pretty">
            Gieo Mơ gom góp những điều nhỏ xinh thành một món quà trọn vẹn, đủ chu đáo để đồng hành cùng bạn, đủ tinh tế để dành tặng người thương.
          </p>
        </div>

        {/* Combo Grid or Empty State */}
        {combos.length === 0 ? (
          <div className="bg-white rounded-3xl p-10 sm:p-14 text-center border border-[#F0E5D8] shadow-soft max-w-xl mx-auto space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-[#FFF8EE] border border-[#F0E5D8] flex items-center justify-center text-3xl mx-auto shadow-2xs">
              🎁
            </div>
            <div className="space-y-1">
              <h3 className="font-heading font-extrabold text-lg text-[#231B16]">
                Các combo đang được chuẩn bị
              </h3>
              <p className="text-xs text-[#7E7068] leading-relaxed max-w-sm mx-auto">
                Ban tổ chức Gieo Mơ đang kết hợp các bộ quà tặng độc đáo. Bạn hãy quay lại sớm để cùng đón chờ nhé!
              </p>
            </div>
            <div className="pt-2">
              <Link
                href="/products"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-bold text-xs transition-all shadow-xs border border-[#9ed4a3]"
              >
                <span>Xem các sản phẩm lẻ ➔</span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {combos.map((combo) => {
              const resolvedItems = resolveComboItems(combo, availableProducts);
              const retailTotal = resolvedItems.reduce(
                (sum, it) => sum + it.price * it.quantity,
                0
              );
              const savings = Math.max(0, retailTotal - combo.price);
              const savingsPercent =
                retailTotal > 0 ? Math.round((savings / retailTotal) * 100) : 0;
              const thumb = combo.thumbnail || combo.images?.[0];

              return (
                <div
                  key={combo.combo_id}
                  className="bg-white rounded-3xl p-6 border border-[#F0E5D8] shadow-soft flex flex-col sm:flex-row gap-6 items-start hover:shadow-card-hover transition-all"
                >
                  {/* Thumbnail */}
                  <div className="relative w-full sm:w-48 aspect-square rounded-2xl bg-[#FFF8EE] border border-[#F0E5D8] overflow-hidden shrink-0 flex items-center justify-center text-4xl">
                    {thumb ? (
                      <Image
                        src={thumb}
                        alt={combo.name}
                        fill
                        sizes="(max-width: 640px) 100vw, 192px"
                        className="object-cover"
                      />
                    ) : (
                      <span>🎁</span>
                    )}
                    {savings > 0 && (
                      <div className="absolute top-3 left-3">
                        <Badge variant="accent" className="shadow-2xs font-extrabold text-[11px]">
                          Tiết kiệm {savingsPercent}%
                        </Badge>
                      </div>
                    )}
                  </div>

                  {/* Info Column */}
                  <div className="flex-1 space-y-3 flex flex-col justify-between h-full w-full">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-heading font-bold text-xl text-[#342A24] text-balance">
                          {combo.name}
                        </h3>
                        {savings > 0 && (
                          <span className="text-[11px] font-extrabold text-[#D97706] bg-[#FEF3C7] px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
                            -{(savings).toLocaleString("vi-VN")}đ
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-[#7E7068] leading-relaxed text-left text-pretty">
                        {combo.description}
                      </p>

                      {/* Included Items with Retail Price Breakdown */}
                      {resolvedItems.length > 0 && (
                        <div className="pt-2 space-y-1.5">
                          <div className="flex items-center justify-between text-[10.5px]">
                            <span className="font-bold text-[#A89B92] uppercase tracking-wider block whitespace-nowrap">
                              Bao gồm {resolvedItems.length} món quà ghép:
                            </span>
                            {retailTotal > 0 && (
                              <span className="text-[#8C7A70] font-semibold">
                                Mua lẻ:{" "}
                                <span className="line-through text-[#A89B92]">
                                  {retailTotal.toLocaleString("vi-VN")}đ
                                </span>
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#5C4D44]">
                            {resolvedItems.map((it, idx) => (
                              <span key={idx} className="inline-flex items-center gap-1.5">
                                <span className="px-2.5 py-1 rounded-xl bg-[#FFF8EE] border border-[#F0E5D8] font-bold text-[#342A24] text-xs whitespace-nowrap flex items-center gap-1.5">
                                  <span>{it.name}</span>
                                  <span className="text-[#2D6338] font-black">×{it.quantity}</span>
                                  <span className="text-[10px] font-normal text-[#8C7A70] bg-white px-1.5 py-0.2 rounded border border-[#F0E5D8]">
                                    {it.price.toLocaleString("vi-VN")}đ
                                  </span>
                                </span>
                                {idx < resolvedItems.length - 1 && (
                                  <span className="w-5 h-5 rounded-full bg-[#FFE7A8] text-[#542B07] font-black flex items-center justify-center text-xs shadow-2xs border border-[#ebd089] shrink-0">
                                    +
                                  </span>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Pricing and Action */}
                    <div className="pt-4 border-t border-[#F0E5D8] flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-baseline gap-2">
                          <MoneyDisplay
                            amount={combo.price}
                            className="text-xl sm:text-2xl font-extrabold text-[#1B3622]"
                          />
                          {retailTotal > combo.price && (
                            <span className="text-xs text-[#A89B92] line-through font-semibold">
                              <MoneyDisplay amount={retailTotal} />
                            </span>
                          )}
                        </div>
                        {savings > 0 && (
                          <div className="text-[11px] font-bold text-[#D97706] flex items-center gap-1 mt-0.5">
                            <Sparkles className="w-3 h-3 text-[#D97706]" />
                            <span>
                              Tiết kiệm {(savings).toLocaleString("vi-VN")}đ ({savingsPercent}%)
                            </span>
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => handleAddCombo(combo)}
                        className="px-5 py-2.5 rounded-full bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#1B3622] font-extrabold text-xs transition-all shadow-xs border border-[#9ed4a3] active:scale-95 flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                      >
                        <Plus className="w-4 h-4 shrink-0" />
                        <span>Thêm Combo</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <Footer />

      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 animate-slide-up pointer-events-auto">
          <Toast type="success" message={toastMessage} onClose={() => setToastMessage(null)} />
        </div>
      )}
    </div>
  );
}
