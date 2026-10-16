"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import type { ExtendedCombo } from "@/lib/data/mockData";
import { getStoredCombos, syncCombosFromServer } from "@/lib/data/orderStore";
import { ArrowRight } from "lucide-react";

export function FeaturedCombosSection() {
  const [combos, setCombos] = useState<ExtendedCombo[]>([]);

  useEffect(() => {
    syncCombosFromServer(true);
    const update = () => {
      const active = getStoredCombos().filter((c) => c.status === "active");
      setCombos(active.filter((c) => c.featured).slice(0, 4));
    };
    update();
    window.addEventListener("gieomo_combos_updated", update);
    return () => window.removeEventListener("gieomo_combos_updated", update);
  }, []);

  if (combos.length === 0) return null;

  return (
    <section className="py-16 sm:py-20 container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-10 text-center sm:text-left">
        <div>
          <h2 className="font-heading font-extrabold text-2xl sm:text-3xl text-[#231B16] text-balance">
            Set quà nổi bật
          </h2>
          <p className="text-xs sm:text-sm text-[#7E7068] mt-1 text-balance">
            Những set quà được ghép sẵn từ sản phẩm thủ công Mầm Mơ — tiết kiệm hơn so với mua lẻ từng món.
          </p>
        </div>

        <Link
          href="/combos"
          prefetch={true}
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-[#2D6338] hover:text-[#1B3622] transition-colors group whitespace-nowrap"
        >
          <span>Xem tất cả combo</span>
          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform shrink-0" />
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
        {combos.map((combo) => {
          const thumb = combo.thumbnail || combo.images?.[0] || combo.image_url || undefined;
          return (
            <div
              key={combo.combo_id}
              className="group rounded-3xl bg-[#FFF8EE] border border-[#F0E5D8] overflow-hidden shadow-2xs hover:shadow-md transition-shadow"
            >
              <div className="aspect-square bg-white flex items-center justify-center overflow-hidden">
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumb}
                    alt={combo.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <span className="text-3xl" aria-hidden="true">
                    🎁
                  </span>
                )}
              </div>
              <div className="p-3 sm:p-4 space-y-2">
                <h3 className="font-heading font-bold text-sm sm:text-base text-[#231B16] line-clamp-2">
                  {combo.name}
                </h3>
                {combo.description && (
                  <p className="text-[11px] sm:text-xs text-[#7E7068] line-clamp-2 leading-relaxed">
                    {combo.description}
                  </p>
                )}
                <div className="flex items-center justify-between gap-2">
                  <MoneyDisplay amount={combo.price} className="font-extrabold text-sm sm:text-base text-[#2D6338]" />
                  <Link
                    href="/combos"
                    prefetch={true}
                    className="text-[11px] sm:text-xs font-bold text-[#2D6338] hover:underline whitespace-nowrap"
                  >
                    Xem chi tiết →
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
