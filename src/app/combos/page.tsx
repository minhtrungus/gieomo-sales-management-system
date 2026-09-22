"use client";

import Link from "next/link";
import Image from "next/image";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { MOCK_COMBOS } from "@/lib/data/mockData";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { Badge } from "@/components/ui/Badge";
import { useCartStore } from "@/store/cart";
import { useState } from "react";
import { Toast } from "@/components/ui/Toast";
import { Gift, Plus } from "lucide-react";

export default function CombosPage() {
  const addItem = useCartStore((state) => state.addItem);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleAddCombo = (combo: (typeof MOCK_COMBOS)[0]) => {
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

      <main className="flex-1 container mx-auto px-4 sm:px-6 py-8 md:py-12">
        {/* Header */}
        <div className="max-w-2xl mb-8 space-y-2">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#FFE7A8] text-[#542B07] text-xs font-bold border border-[#ebd089]">
            <Gift className="w-3.5 h-3.5 text-[#E2884E]" />
            <span>Set Combo quà tặng tiết kiệm</span>
          </div>
          <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-[#231B16] tracking-tight">
            Bộ quà tặng may vá handmade
          </h1>
          <p className="text-[#7E7068] text-xs sm:text-sm leading-relaxed">
            Các món quà được ghép sẵn vừa tiện lợi vừa tiết kiệm, đóng gói trang trọng trong hộp quà Gieo Mơ kèm thiệp cảm ơn.
          </p>
        </div>

        {/* Combo Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {MOCK_COMBOS.map((combo) => (
            <div
              key={combo.combo_id}
              className="bg-white rounded-3xl p-6 border border-[#F0E5D8] shadow-soft flex flex-col sm:flex-row gap-6 items-start hover:shadow-card-hover transition-all"
            >
              <div className="relative w-full sm:w-48 aspect-square rounded-2xl bg-[#FFF8EE] border border-[#F0E5D8] overflow-hidden shrink-0 flex items-center justify-center text-4xl">
                {combo.images?.[0] ? (
                  <Image src={combo.images[0]} alt="" fill className="object-cover" />
                ) : (
                  <span>🎁</span>
                )}
                <div className="absolute top-3 left-3">
                  <Badge variant="accent">Tiết kiệm</Badge>
                </div>
              </div>

              <div className="flex-1 space-y-3 flex flex-col justify-between h-full">
                <div className="space-y-2">
                  <h3 className="font-heading font-bold text-xl text-[#342A24]">
                    {combo.name}
                  </h3>
                  <p className="text-xs text-[#7E7068] leading-relaxed">
                    {combo.description}
                  </p>

                  {/* Included Items */}
                  {combo.items && (
                    <div className="pt-2">
                      <span className="text-[10px] font-bold text-[#A89B92] uppercase tracking-wider block mb-1">
                        Bao gồm các món:
                      </span>
                      <ul className="text-xs text-[#5C4D44] space-y-1 list-disc list-inside">
                        {combo.items.map((it, idx) => (
                          <li key={idx}>
                            {it.product.name} (x{it.quantity})
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-[#F0E5D8] flex items-center justify-between">
                  <MoneyDisplay amount={combo.price} className="text-xl font-extrabold text-[#1B3622]" />
                  <button
                    onClick={() => handleAddCombo(combo)}
                    className="px-5 py-2.5 rounded-full bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#1B3622] font-bold text-xs transition-all shadow-xs border border-[#9ed4a3] active:scale-95 flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Thêm Combo</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>

      <Footer />

      {toastMessage && (
        <Toast type="success" message={toastMessage} onClose={() => setToastMessage(null)} />
      )}
    </div>
  );
}
