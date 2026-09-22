"use client";

import { useState } from "react";
import Image from "next/image";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { Badge } from "@/components/ui/Badge";
import { MOCK_COMBOS } from "@/lib/data/mockData";
import { Plus, Edit3, Trash2 } from "lucide-react";

export default function AdminCombosPage() {
  const [combos] = useState(MOCK_COMBOS);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-emerald-950">
            Quản lý Set Combo
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Quản lý các bộ combo quà tặng may vá ghép từ nhiều sản phẩm.
          </p>
        </div>

        <button className="px-4 py-2.5 rounded-2xl bg-emerald-900 hover:bg-emerald-950 text-white font-bold text-xs flex items-center gap-2 shadow-xs transition-colors">
          <Plus className="w-4 h-4" />
          <span>+ Thêm Set Combo mới</span>
        </button>
      </div>

      {/* Combos Table */}
      <div className="bg-white rounded-3xl border border-gray-200/80 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 font-semibold uppercase">
                <th className="py-3 px-4">Tên Combo</th>
                <th className="py-3 px-4">Sản phẩm thành phần</th>
                <th className="py-3 px-4">Giá Combo</th>
                <th className="py-3 px-4">Trạng thái</th>
                <th className="py-3 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {combos.map((cb) => (
                <tr key={cb.combo_id} className="hover:bg-emerald-50/30 transition-colors">
                  <td className="py-3.5 px-4 flex items-center gap-3">
                    <div className="relative w-12 h-12 rounded-xl bg-cream border border-emerald-100 overflow-hidden shrink-0 flex items-center justify-center text-lg">
                      {cb.images?.[0] ? (
                        <Image src={cb.images[0]} alt="" fill className="object-cover" />
                      ) : (
                        <span>🎁</span>
                      )}
                    </div>
                    <div>
                      <span className="font-bold text-gray-900 block">{cb.name}</span>
                      <span className="text-[11px] text-gray-500 font-mono">/{cb.slug}</span>
                    </div>
                  </td>

                  <td className="py-3.5 px-4">
                    <ul className="list-disc list-inside text-[11px] text-gray-600 space-y-0.5">
                      {cb.items?.map((it, idx) => (
                        <li key={idx}>
                          {it.product.name} (x{it.quantity})
                        </li>
                      ))}
                    </ul>
                  </td>

                  <td className="py-3.5 px-4">
                    <MoneyDisplay amount={cb.price} className="font-bold text-emerald-950" />
                  </td>

                  <td className="py-3.5 px-4">
                    <Badge variant="success">Đang bán</Badge>
                  </td>

                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button className="p-1.5 rounded-lg text-gray-500 hover:text-emerald-800 hover:bg-emerald-50 transition-colors">
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button className="p-1.5 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
