"use client";

import { useState, useEffect } from "react";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { Badge } from "@/components/ui/Badge";
import { Check, X } from "lucide-react";
import { getStoredPayments, approveStoredPayment, type PaymentRecord } from "@/lib/data/orderStore";

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);

  useEffect(() => {
    setPayments(getStoredPayments());
    const handleUpdate = () => {
      setPayments(getStoredPayments());
    };
    window.addEventListener("gieomo_orders_updated", handleUpdate);
    return () => window.removeEventListener("gieomo_orders_updated", handleUpdate);
  }, []);

  const [approvingPayment, setApprovingPayment] = useState<PaymentRecord | null>(null);

  const handleConfirmApprove = () => {
    if (!approvingPayment) return;
    approveStoredPayment(approvingPayment.paymentId);
    setPayments((prev) =>
      prev.map((p) => (p.paymentId === approvingPayment.paymentId ? { ...p, status: "paid" } : p))
    );
    setApprovingPayment(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading font-extrabold text-2xl text-[#231B16]">
          Xác nhận thanh toán VietQR
        </h1>
        <p className="text-xs text-[#7E7068] mt-0.5">
          Danh sách giao dịch ngân hàng VietQR cần BTC xác nhận khớp lệnh đối soát tài khoản.
        </p>
      </div>

      <div className="bg-white rounded-3xl border border-[#F0E5D8] shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead>
              <tr className="bg-[#FFF8EE] border-b border-[#F0E5D8] text-[#7E7068] font-bold uppercase tracking-wider text-[10px]">
                <th className="py-2.5 px-2.5 text-center w-10">STT</th>
                <th className="py-2.5 px-3">Mã đơn</th>
                <th className="py-2.5 px-3">Mã GD VietQR</th>
                <th className="py-2.5 px-3">Số tiền</th>
                <th className="py-2.5 px-3">Thời gian GD</th>
                <th className="py-2.5 px-3">Trạng thái</th>
                <th className="py-2.5 px-3 text-right">Duyệt thanh toán</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0E5D8]">
              {payments.map((p, idx) => (
                <tr key={p.paymentId} className="hover:bg-[#FFFDF9] transition-colors">
                  <td className="py-2.5 px-2.5 text-center text-[#7E7068] font-bold text-[11px]">
                    {idx + 1}
                  </td>
                  <td className="py-2.5 px-3 font-mono font-bold text-[#1B3622] text-xs">
                    {p.orderCode}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[#5C4D44] text-[10.5px]">
                    {p.transactionCode}
                  </td>
                  <td className="py-2.5 px-3 font-extrabold text-[#1B3622] text-xs">
                    <MoneyDisplay amount={p.amount} />
                  </td>
                  <td className="py-2.5 px-3 text-[#7E7068] font-medium text-[10.5px]">
                    {p.createdAt}
                  </td>
                  <td className="py-2.5 px-3">
                    <Badge variant={p.status === "paid" ? "success" : "warning"} className="text-[10px] px-2 py-0.5">
                      {p.status === "paid" ? "Đã xác nhận" : "Chờ đối soát"}
                    </Badge>
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    {p.status === "pending" ? (
                      <button
                        onClick={() => setApprovingPayment(p)}
                        className="px-2.5 py-1 rounded-xl bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-bold text-[11px] transition-all shadow-2xs border border-[#9ed4a3] active:scale-95 cursor-pointer inline-flex items-center gap-1 ml-auto"
                      >
                        <Check className="w-3 h-3" /> Duyệt
                      </button>
                    ) : (
                      <span className="text-[10px] text-[#2D6338] font-bold">✓ Đã duyệt</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: XÁC NHẬN DUYỆT THANH TOÁN */}
      {approvingPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 border border-[#F0E5D8] shadow-2xl space-y-4 animate-in zoom-in-95 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[#BFE9C3] text-[#16381D] flex items-center justify-center mx-auto">
              <Check className="w-6 h-6" />
            </div>

            <div className="space-y-1.5">
              <h3 className="font-heading font-extrabold text-base text-[#231B16]">
                Xác nhận duyệt thanh toán VietQR?
              </h3>
              <p className="text-xs text-[#7E7068] leading-relaxed">
                Khớp lệnh thanh toán cho đơn <strong>{approvingPayment.orderCode}</strong> với số tiền <strong className="text-[#1B3622]">{approvingPayment.amount.toLocaleString("vi-VN")}đ</strong> (Mã GD: {approvingPayment.transactionCode})?
              </p>
            </div>

            <div className="flex items-center justify-center gap-2.5 pt-2">
              <button
                onClick={() => setApprovingPayment(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleConfirmApprove}
                className="px-5 py-2.5 rounded-full bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-xs shadow-xs border border-[#9ed4a3] transition-all cursor-pointer"
              >
                Xác nhận đã nhận tiền ➔
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
