"use client";

import Link from "next/link";
import Image from "next/image";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { getStoredCombos, type ExtendedCombo } from "@/lib/data/orderStore";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { Badge } from "@/components/ui/Badge";
import { useCartStore } from "@/store/cart";
import { useState, useEffect } from "react";
import { Toast } from "@/components/ui/Toast";
import { Gift, Plus, Sparkles } from "lucide-react";

export default function CombosPage() {
  const addItem = useCartStore((state) => state.addItem);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [combos, setCombos] = useState<ExtendedCombo[]>([]);

  useEffect(() => {
    setCombos(getStoredCombos().filter((c) => c.status === "active"));
    const handleUpdate = () => {
      setCombos(getStoredCombos().filter((c) => c.status === "active"));
    };
    window.addEventListener("gieomo_combos_updated", handleUpdate);
    return () => window.removeEventListener("gieomo_combos_updated", handleUpdate);
  }, []);

  const handleAddCombo = (combo: ExtendedCombo) => {
    addItem({
      product_id: `combo-${combo.combo_id}`,
      variant_id: null,
      combo_id: combo.combo_id,
      product_name: combo.name,
      variant_name: "Set Combo",
      price: combo.price,
      quantity: 1,
      stock: 20,
      image_url: combo.images?.[0] ?? null,
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
          <p className="text-[#7E7068] text-xs sm:text-sm leading-relaxed text-pretty">
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
                Các set combo đang được chuẩn bị
              </h3>
              <p className="text-xs text-[#7E7068] leading-relaxed max-w-sm mx-auto">
                Ban tổ chức Mầm Mơ đang kết hợp các bộ quà tặng độc đáo. Bạn hãy quay lại sớm để cùng đón chờ nhé!
              </p>
            </div>
            <div className="pt-2">
              <Link
                href="/products"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-bold text-xs transition-all shadow-xs border border-[#9ed4a3]"
              >
                <span>Xem danh mục sản phẩm lẻ ➔</span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {combos.map((combo) => (
              <div
                key={combo.combo_id}
                className="bg-white rounded-3xl p-6 border border-[#F0E5D8] shadow-soft flex flex-col sm:flex-row gap-6 items-start hover:shadow-card-hover transition-all"
              >
                <div className="relative w-full sm:w-48 aspect-square rounded-2xl bg-[#FFF8EE] border border-[#F0E5D8] overflow-hidden shrink-0 flex items-center justify-center text-4xl">
                  {combo.images?.[0] ? (
                    <Image
                      src={combo.images[0]}
                      alt={combo.name}
                      fill
                      sizes="(max-width: 640px) 100vw, 192px"
                      className="object-cover"
                    />
                  ) : (
                    <span>🎁</span>
                  )}
                  <div className="absolute top-3 left-3">
                    <Badge variant="accent">Tiết kiệm</Badge>
                  </div>
                </div>

                <div className="flex-1 space-y-3 flex flex-col justify-between h-full w-full">
                  <div className="space-y-2">
                    <h3 className="font-heading font-bold text-xl text-[#342A24] text-balance">
                      {combo.name}
                    </h3>
                    <p className="text-xs text-[#7E7068] leading-relaxed text-pretty">
                      {combo.description}
                    </p>

                    {/* Included Items */}
                    {combo.items && (
                      <div className="pt-2">
                        <span className="text-[10px] font-bold text-[#A89B92] uppercase tracking-wider block mb-1.5 whitespace-nowrap">
                          Bao gồm {combo.items.length} món quà ghép:
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#5C4D44]">
                          {combo.items.map((it: any, idx: number) => (
                            <span key={idx} className="inline-flex items-center gap-1.5">
                              <span className="px-2.5 py-1 rounded-xl bg-[#FFF8EE] border border-[#F0E5D8] font-bold text-[#342A24] text-xs whitespace-nowrap">
                                {it.product.name} <span className="text-[#2D6338] font-black">×{it.quantity}</span>
                              </span>
                              {idx < combo.items!.length - 1 && (
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

                  <div className="pt-4 border-t border-[#F0E5D8] flex items-center justify-between gap-3">
                    <div className="whitespace-nowrap">
                      <MoneyDisplay amount={combo.price} className="text-xl font-extrabold text-[#1B3622]" />
                    </div>
                    <button
                      onClick={() => handleAddCombo(combo)}
                      className="px-5 py-2.5 rounded-full bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#1B3622] font-bold text-xs transition-all shadow-xs border border-[#9ed4a3] active:scale-95 flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5 shrink-0" />
                      <span>Thêm Combo</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
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
