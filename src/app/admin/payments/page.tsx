"use client";

import { useState, useEffect, useMemo } from "react";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { Badge } from "@/components/ui/Badge";
import { Check, X, RefreshCw, Search, Eye, Image as ImageIcon } from "lucide-react";
import {
  getStoredPayments,
  approveStoredPayment,
  getStoredOrders,
  syncOrdersFromServer,
  type PaymentRecord,
} from "@/lib/data/orderStore";
import type { Order } from "@/types/database";

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "paid">("all");
  const [approvingPayment, setApprovingPayment] = useState<PaymentRecord | null>(null);
  const [viewingProof, setViewingProof] = useState<string | null>(null);

  const loadData = () => {
    setOrders(getStoredOrders());
    setPayments(getStoredPayments());
  };

  useEffect(() => {
    syncOrdersFromServer(true);
    loadData();

    const handleUpdate = () => {
      loadData();
    };

    window.addEventListener("gieomo_orders_updated", handleUpdate);
    return () => window.removeEventListener("gieomo_orders_updated", handleUpdate);
  }, []);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await syncOrdersFromServer(true);
    loadData();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleConfirmApprove = () => {
    if (!approvingPayment) return;
    approveStoredPayment(approvingPayment.paymentId);
    setPayments((prev) =>
      prev.map((p) => (p.paymentId === approvingPayment.paymentId ? { ...p, status: "paid" } : p))
    );
    setApprovingPayment(null);
  };

  // Map order details by order_code
  const orderMap = useMemo(() => {
    const map = new Map<string, Order>();
    orders.forEach((o) => {
      if (o.order_code) map.set(o.order_code, o);
    });
    return map;
  }, [orders]);

  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (searchQuery.trim() !== "") {
        const q = searchQuery.toLowerCase();
        const matchedCode = (p.orderCode ?? "").toLowerCase().includes(q);
        const matchedTx = (p.transactionCode ?? "").toLowerCase().includes(q);
        const orderObj = orderMap.get(p.orderCode);
        const matchedBuyer =
          (orderObj?.buyer_name ?? "").toLowerCase().includes(q) ||
          (orderObj?.buyer_phone ?? "").includes(q);
        return matchedCode || matchedTx || !!matchedBuyer;
      }
      return true;
    });
  }, [payments, statusFilter, searchQuery, orderMap]);

  const pendingCount = payments.filter((p) => p.status === "pending").length;
  const paidCount = payments.filter((p) => p.status === "paid").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading font-extrabold text-2xl text-[#231B16]">
              Xác nhận thanh toán VietQR
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold border border-emerald-300">
              {payments.length} Giao dịch
            </span>
          </div>
          <p className="text-xs text-[#7E7068] mt-0.5">
            Danh sách giao dịch ngân hàng VietQR cần BTC xác nhận khớp lệnh đối soát tài khoản.
          </p>
        </div>

        <button
          type="button"
          onClick={handleManualRefresh}
          disabled={isRefreshing}
          className="px-4 py-2.5 rounded-full bg-white hover:bg-emerald-50 text-emerald-950 font-bold text-xs flex items-center gap-2 shadow-xs transition-all border border-[#F0E5D8] active:scale-95 cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-emerald-700" : "text-gray-500"}`} />
          <span>{isRefreshing ? "Đang đồng bộ..." : "Đồng bộ giao dịch"}</span>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white rounded-3xl p-4 border border-[#F0E5D8] shadow-soft flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Tìm theo mã đơn, mã GD, tên khách..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-cream/50 rounded-xl border border-[#F0E5D8] text-xs font-medium text-[#231B16] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#BFE9C3]"
          />
        </div>

        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-cream/70 border border-[#F0E5D8] self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              statusFilter === "all" ? "bg-[#2D6338] text-white shadow-2xs" : "text-gray-600 hover:bg-white"
            }`}
          >
            Tất cả ({payments.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("pending")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              statusFilter === "pending" ? "bg-[#2D6338] text-white shadow-2xs" : "text-gray-600 hover:bg-white"
            }`}
          >
            ⏳ Chờ đối soát ({pendingCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("paid")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              statusFilter === "paid" ? "bg-[#2D6338] text-white shadow-2xs" : "text-gray-600 hover:bg-white"
            }`}
          >
            ✓ Đã xác nhận ({paidCount})
          </button>
        </div>
      </div>

      {/* MOBILE CARD VIEW (< sm) */}
      <div className="block sm:hidden space-y-3">
        {filteredPayments.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 border border-[#F0E5D8] text-center text-[#7E7068] shadow-soft">
            <p className="font-bold text-sm text-[#231B16]">Không tìm thấy giao dịch nào phù hợp.</p>
          </div>
        ) : (
          filteredPayments.map((p, idx) => {
            const orderObj = orderMap.get(p.orderCode);
            const proofImg = orderObj?.payment_proof;

            return (
              <div
                key={p.paymentId}
                className="bg-white rounded-2xl p-4 border border-[#F0E5D8] shadow-soft space-y-3"
              >
                <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-gray-100 text-[#7E7068] font-bold text-[10px] flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <span className="font-mono font-bold text-xs text-[#1B3622] bg-[#EAF7ED] px-2 py-0.5 rounded-lg border border-[#BFE9C3]">
                      {p.orderCode}
                    </span>
                  </div>
                  <Badge variant={p.status === "paid" ? "success" : "warning"} className="text-[10px] px-2 py-0.5">
                    {p.status === "paid" ? "✓ Đã xác nhận" : "⏳ Chờ đối soát"}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[10.5px] text-[#7E7068] block">Số tiền thanh toán:</span>
                    <MoneyDisplay amount={p.amount} className="font-extrabold text-[#1B3622] text-sm" />
                  </div>
                  <div>
                    <span className="text-[10.5px] text-[#7E7068] block">Mã GD / Tham chiếu:</span>
                    <span className="font-mono text-gray-800 text-[11px] block truncate font-semibold">
                      {p.transactionCode}
                    </span>
                  </div>
                  {orderObj?.buyer_name && (
                    <div className="col-span-2 text-[11px] text-gray-700 font-medium">
                      <span>Khách hàng: </span>
                      <span className="font-bold text-[#231B16]">{orderObj.buyer_name}</span>
                      {orderObj.buyer_phone && <span className="text-gray-500"> ({orderObj.buyer_phone})</span>}
                    </div>
                  )}
                  <div className="col-span-2 text-[11px] text-gray-500">
                    <span>Thời gian: </span>
                    <span className="font-medium text-gray-700">{p.createdAt}</span>
                  </div>
                </div>

                {proofImg && (
                  <button
                    type="button"
                    onClick={() => setViewingProof(proofImg)}
                    className="w-full py-1.5 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-[11px] flex items-center justify-center gap-1.5 border border-amber-200 transition-colors cursor-pointer"
                  >
                    <ImageIcon className="w-3.5 h-3.5 text-amber-700" />
                    <span>Xem ảnh biên lai khách tải lên</span>
                  </button>
                )}

                {p.status === "pending" ? (
                  <button
                    type="button"
                    onClick={() => setApprovingPayment(p)}
                    className="w-full py-2.5 rounded-xl bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-xs transition-all shadow-2xs border border-[#9ed4a3] active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5 text-emerald-800" />
                    <span>Duyệt thanh toán này</span>
                  </button>
                ) : (
                  <div className="py-1.5 rounded-xl bg-emerald-50 text-[#16381D] font-bold text-[11px] text-center border border-emerald-200">
                    ✓ Giao dịch đã được duyệt thành công
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* DESKTOP TABLE VIEW (>= sm) */}
      <div className="hidden sm:block bg-white rounded-3xl border border-[#F0E5D8] shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-[11px]">
            <thead>
              <tr className="bg-[#FFF8EE] border-b border-[#F0E5D8] text-[#7E7068] font-bold uppercase tracking-wider text-[10px]">
                <th className="py-2.5 px-2.5 text-center w-10 whitespace-nowrap">STT</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Mã đơn</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Khách hàng</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Mã GD VietQR</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Số tiền</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Thời gian GD</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Minh chứng</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Trạng thái</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Duyệt thanh toán</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0E5D8]">
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-gray-500">
                    Không tìm thấy giao dịch thanh toán nào phù hợp.
                  </td>
                </tr>
              ) : (
                filteredPayments.map((p, idx) => {
                  const orderObj = orderMap.get(p.orderCode);
                  const proofImg = orderObj?.payment_proof;

                  return (
                    <tr key={p.paymentId} className="hover:bg-[#FFFDF9] transition-colors">
                      <td className="py-2.5 px-2.5 text-center text-[#7E7068] font-bold text-[11px]">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-[#1B3622] text-xs">
                        {p.orderCode}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-[#231B16]">
                        {orderObj?.buyer_name || "Khách mua lẻ"}
                        {orderObj?.buyer_phone && (
                          <span className="block text-[10px] text-gray-500 font-mono font-normal">
                            {orderObj.buyer_phone}
                          </span>
                        )}
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
                        {proofImg ? (
                          <button
                            type="button"
                            onClick={() => setViewingProof(proofImg)}
                            className="px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 text-[10px] font-bold border border-amber-200 inline-flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <Eye className="w-3 h-3 text-amber-700" />
                            <span>Xem biên lai</span>
                          </button>
                        ) : (
                          <span className="text-[10px] text-gray-400 italic">Không có</span>
                        )}
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
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: XEM ẢNH BIÊN LAI */}
      {viewingProof && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-lg bg-white rounded-3xl p-5 border border-[#F0E5D8] shadow-2xl space-y-3 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <span className="font-heading font-extrabold text-sm text-[#231B16]">
                Ảnh minh chứng thanh toán
              </span>
              <button
                onClick={() => setViewingProof(null)}
                className="p-1 rounded-xl text-gray-500 hover:bg-gray-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-auto rounded-2xl bg-gray-50 p-2 flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={viewingProof}
                alt="Minh chứng thanh toán"
                className="max-h-[65vh] w-auto object-contain rounded-xl shadow-xs"
              />
            </div>
            <button
              onClick={() => setViewingProof(null)}
              className="w-full py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-xs cursor-pointer"
            >
              Đóng
            </button>
          </div>
        </div>
      )}

      {/* MODAL: XÁC NHẬN DUYỆT THANH TOÁN */}
      {approvingPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 animate-in fade-in">
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
