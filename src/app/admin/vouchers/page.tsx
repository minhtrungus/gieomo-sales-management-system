"use client";

import { useState } from "react";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { Badge } from "@/components/ui/Badge";
import { MOCK_VOUCHERS } from "@/lib/data/mockData";
import { Plus, Edit3, Trash2 } from "lucide-react";

export default function AdminVouchersPage() {
  const [vouchers] = useState(MOCK_VOUCHERS);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-emerald-950">
            Quản lý mã giảm giá (Vouchers)
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Tạo và cấu hình các chương trình ưu đãi khuyến khích chốt đơn.
          </p>
        </div>

        <button className="px-4 py-2.5 rounded-2xl bg-emerald-900 hover:bg-emerald-950 text-white font-bold text-xs flex items-center gap-2 shadow-xs transition-colors">
          <Plus className="w-4 h-4" />
          <span>+ Thêm Voucher mới</span>
        </button>
      </div>

      {/* Vouchers Table */}
      <div className="bg-white rounded-3xl border border-gray-200/80 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 font-semibold uppercase">
                <th className="py-3 px-4">Mã Voucher</th>
                <th className="py-3 px-4">Loại giảm giá</th>
                <th className="py-3 px-4">Đơn tối thiểu</th>
                <th className="py-3 px-4">Đã sử dụng</th>
                <th className="py-3 px-4">Trạng thái</th>
                <th className="py-3 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {vouchers.map((v) => (
                <tr key={v.voucher_id} className="hover:bg-emerald-50/30 transition-colors">
                  <td className="py-3.5 px-4 font-mono font-extrabold text-emerald-950 text-sm">
                    {v.code}
                  </td>
                  <td className="py-3.5 px-4 font-bold text-gray-900">
                    {v.discount_type === "percentage" ? (
                      <span className="text-emerald-800">Giảm {v.discount_value}%</span>
                    ) : (
                      <span className="text-emerald-800">Giảm <MoneyDisplay amount={v.discount_value} /></span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-gray-600">
                    <MoneyDisplay amount={v.min_order_value} />
                  </td>
                  <td className="py-3.5 px-4 text-gray-900 font-semibold">
                    {v.usage_count ?? 12} / {v.usage_limit ?? 100} lượt
                  </td>
                  <td className="py-3.5 px-4">
                    <Badge variant="success">Hoạt động</Badge>
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
