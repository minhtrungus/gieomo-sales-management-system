"use client";

import { useState } from "react";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { Badge } from "@/components/ui/Badge";
import { Plus, Copy, Check } from "lucide-react";

export default function AdminMembersPage() {
  const [members] = useState([
    {
      memberId: "mem-1",
      fullName: "Nguyễn Văn A",
      role: "btc_sale",
      referralCode: "MEMA01",
      phone: "0901112233",
      totalOrders: 15,
      totalRevenue: 2450000,
      status: "active",
    },
    {
      memberId: "mem-2",
      fullName: "Trần Thị B",
      role: "btc_sale",
      referralCode: "MEMB02",
      phone: "0904445566",
      totalOrders: 8,
      totalRevenue: 1120000,
      status: "active",
    },
  ]);

  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(`https://gieomo.vn/?ref=${code}`);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-emerald-950">
            Thành viên & Link giới thiệu (Referral)
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Quản lý danh sách tình nguyện viên, mã Referral chốt đơn và doanh số từng thành viên.
          </p>
        </div>

        <button className="px-4 py-2.5 rounded-2xl bg-emerald-900 hover:bg-emerald-950 text-white font-bold text-xs flex items-center gap-2 shadow-xs transition-colors">
          <Plus className="w-4 h-4" />
          <span>+ Thêm Thành viên mới</span>
        </button>
      </div>

      {/* Members Table */}
      <div className="bg-white rounded-3xl border border-gray-200/80 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 font-semibold uppercase">
                <th className="py-3 px-4">Thành viên</th>
                <th className="py-3 px-4">Vai trò</th>
                <th className="py-3 px-4">Mã giới thiệu (Referral)</th>
                <th className="py-3 px-4">Số đơn đã chốt</th>
                <th className="py-3 px-4">Tổng doanh số</th>
                <th className="py-3 px-4 text-right">Copy Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {members.map((m) => (
                <tr key={m.memberId} className="hover:bg-emerald-50/30 transition-colors">
                  <td className="py-3.5 px-4">
                    <span className="font-bold text-gray-900 block">{m.fullName}</span>
                    <span className="text-[11px] text-gray-500">{m.phone}</span>
                  </td>

                  <td className="py-3.5 px-4 font-semibold text-gray-700">
                    <Badge variant="info">BTC Sale</Badge>
                  </td>

                  <td className="py-3.5 px-4 font-mono font-bold text-emerald-950">
                    {m.referralCode}
                  </td>

                  <td className="py-3.5 px-4 font-bold text-gray-900">
                    {m.totalOrders} đơn
                  </td>

                  <td className="py-3.5 px-4">
                    <MoneyDisplay amount={m.totalRevenue} className="font-extrabold text-emerald-950" />
                  </td>

                  <td className="py-3.5 px-4 text-right">
                    <button
                      onClick={() => handleCopy(m.referralCode)}
                      className="px-3 py-1.5 rounded-xl border border-gray-200 bg-white hover:bg-emerald-50 text-gray-800 text-xs font-semibold inline-flex items-center gap-1 transition-colors"
                    >
                      {copiedCode === m.referralCode ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-700">Đã copy!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Link</span>
                        </>
                      )}
                    </button>
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
