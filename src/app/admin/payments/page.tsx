"use client";

import { useState } from "react";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { Badge } from "@/components/ui/Badge";
import { Check, X } from "lucide-react";

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState([
    {
      paymentId: "pay-1",
      orderCode: "GM-260901",
      amount: 145000,
      paymentMethod: "banking",
      transactionCode: "MB-8891231",
      status: "paid",
      createdAt: "2026-09-21 14:30",
    },
    {
      paymentId: "pay-2",
      orderCode: "GM-260902",
      amount: 85000,
      paymentMethod: "banking",
      transactionCode: "MB-8891235",
      status: "pending",
      createdAt: "2026-09-22 09:15",
    },
  ]);

  const handleApprove = (id: string) => {
    setPayments((prev) =>
      prev.map((p) => (p.paymentId === id ? { ...p, status: "paid" } : p))
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading font-extrabold text-2xl text-emerald-950">
          Xác nhận thanh toán
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Danh sách giao dịch ngân hàng VietQR cần BTC xác nhận khớp lệnh.
        </p>
      </div>

      <div className="bg-white rounded-3xl border border-gray-200/80 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 font-semibold uppercase">
                <th className="py-3 px-4">Mã đơn</th>
                <th className="py-3 px-4">Mã giao dịch VietQR</th>
                <th className="py-3 px-4">Số tiền</th>
                <th className="py-3 px-4">Thời gian</th>
                <th className="py-3 px-4">Trạng thái</th>
                <th className="py-3 px-4 text-right">Duyệt thanh toán</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {payments.map((p) => (
                <tr key={p.paymentId} className="hover:bg-emerald-50/30 transition-colors">
                  <td className="py-3.5 px-4 font-mono font-bold text-emerald-950">
                    {p.orderCode}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-gray-600">
                    {p.transactionCode}
                  </td>
                  <td className="py-3.5 px-4 font-extrabold text-emerald-950">
                    <MoneyDisplay amount={p.amount} />
                  </td>
                  <td className="py-3.5 px-4 text-gray-500">
                    {p.createdAt}
                  </td>
                  <td className="py-3.5 px-4">
                    <Badge variant={p.status === "paid" ? "success" : "warning"}>
                      {p.status === "paid" ? "Đã xác nhận" : "Chờ xác nhận"}
                    </Badge>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    {p.status === "pending" ? (
                      <button
                        onClick={() => handleApprove(p.paymentId)}
                        className="px-3 py-1.5 rounded-xl bg-soft-green hover:bg-emerald-300 text-emerald-950 font-bold text-xs transition-colors flex items-center gap-1 ml-auto"
                      >
                        <Check className="w-3.5 h-3.5" /> Duyệt
                      </button>
                    ) : (
                      <span className="text-[11px] text-emerald-700 font-bold">✓ Đã duyệt</span>
                    )}
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
