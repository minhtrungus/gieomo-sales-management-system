"use client";

import { useState } from "react";
import Link from "next/link";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { Badge } from "@/components/ui/Badge";
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS } from "@/lib/constants";
import { MOCK_ORDERS } from "@/lib/data/mockData";
import type { OrderStatus } from "@/types/database";
import { Search, Plus, Filter, ArrowUpDown } from "lucide-react";

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState(MOCK_ORDERS);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [introducerFilter, setIntroducerFilter] = useState<string>("all");

  const [pendingStatusChange, setPendingStatusChange] = useState<{
    orderId: string;
    orderCode: string;
    newStatus: OrderStatus;
    buyerName: string;
  } | null>(null);

  const handleConfirmStatusChange = () => {
    if (!pendingStatusChange) return;
    setOrders((prev) =>
      prev.map((o) =>
        o.order_id === pendingStatusChange.orderId
          ? {
              ...o,
              order_status: pendingStatusChange.newStatus,
              completed_at: pendingStatusChange.newStatus === "completed" ? new Date().toISOString() : o.completed_at,
            }
          : o
      )
    );
    setPendingStatusChange(null);
  };

  const filteredOrders = orders.filter((ord) => {
    if (statusFilter !== "all" && ord.order_status !== statusFilter) return false;
    if (introducerFilter !== "all") {
      if (introducerFilter === "direct" && ord.introducer_info && ord.introducer_info !== "Trực tiếp (Website)") return false;
      if (introducerFilter !== "direct" && !ord.introducer_info?.includes(introducerFilter)) return false;
    }
    if (
      searchQuery.trim() !== "" &&
      !ord.order_code.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !ord.buyer_name?.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !ord.buyer_phone?.includes(searchQuery) &&
      !ord.introducer_info?.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const formatDateTime = (dateStr?: string | null) => {
    if (!dateStr) return "-";
    try {
      const d = new Date(dateStr);
      const hours = String(d.getHours()).padStart(2, "0");
      const minutes = String(d.getMinutes()).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = d.getFullYear();
      return `${hours}:${minutes} ${day}/${month}/${year}`;
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Title & CTA */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-[#231B16]">
            Quản lý đơn hàng
          </h1>
          <p className="text-xs text-[#7E7068] mt-0.5">
            Danh sách tất cả đơn hàng gây quỹ từ website và thành viên chốt đơn.
          </p>
        </div>

        <Link
          href="/admin/orders/create"
          className="px-5 py-2.5 rounded-full bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-xs flex items-center gap-2 shadow-xs transition-all border border-[#9ed4a3] active:scale-95 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Nhập đơn hộ</span>
        </Link>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-3xl p-4 border border-[#F0E5D8] shadow-soft space-y-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Mã đơn GM-..., SĐT, tên khách, người giới thiệu..."
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] bg-[#FFFDF9]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
            {/* Introducer / Referral Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-[#5C4D44] hidden sm:inline">Quen qua:</span>
              <select
                value={introducerFilter}
                onChange={(e) => setIntroducerFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-[#F0E5D8] bg-white text-xs font-semibold text-gray-800 outline-none hover:border-[#FFB98A]"
              >
                <option value="all">Tất cả người giới thiệu</option>
                <option value="MAM-LAN">Mai Lan (MAM-LAN)</option>
                <option value="MAM-QUANG">Trần Minh Quang (MAM-QUANG)</option>
                <option value="MAM-ADMIN">BTC Mầm Mơ (MAM-ADMIN)</option>
                <option value="direct">Trực tiếp (Website)</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <Filter className="w-4 h-4 text-gray-500" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-[#F0E5D8] bg-white text-xs font-semibold text-gray-800 outline-none hover:border-[#FFB98A]"
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="pending">Chờ xác nhận</option>
                <option value="confirmed">Đã xác nhận</option>
                <option value="processing">Đang chuẩn bị</option>
                <option value="shipping">Đang giao</option>
                <option value="completed">Hoàn thành</option>
                <option value="cancelled">Đã hủy</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-3xl border border-[#F0E5D8] shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-[#FFF8EE] border-b border-[#F0E5D8] text-[#7E7068] font-bold uppercase tracking-wider">
                <th className="py-3.5 px-4">Mã đơn</th>
                <th className="py-3.5 px-4">Thời gian đặt</th>
                <th className="py-3.5 px-4">Khách hàng</th>
                <th className="py-3.5 px-4">Quen qua ai</th>
                <th className="py-3.5 px-4">Hình thức / Địa chỉ</th>
                <th className="py-3.5 px-4">Tổng tiền</th>
                <th className="py-3.5 px-4">Thanh toán</th>
                <th className="py-3.5 px-4">Trạng thái</th>
                <th className="py-3.5 px-4">Thời gian giao</th>
                <th className="py-3.5 px-4 text-right">Đổi trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0E5D8]">
              {filteredOrders.length > 0 ? (
                filteredOrders.map((ord) => (
                  <tr key={ord.order_id} className="hover:bg-[#FFFDF9] transition-colors">
                    <td className="py-4 px-4 font-mono font-bold text-[#1B3622]">
                      <Link href={`/admin/orders/${ord.order_id}`} className="hover:underline">
                        {ord.order_code}
                      </Link>
                    </td>

                    <td className="py-4 px-4 text-[#7E7068] font-medium whitespace-nowrap">
                      {formatDateTime(ord.created_at)}
                    </td>

                    <td className="py-4 px-4">
                      <span className="font-semibold text-gray-900 block">{ord.buyer_name}</span>
                      <span className="text-[11px] text-gray-500">{ord.buyer_phone}</span>
                    </td>

                    <td className="py-4 px-4">
                      {ord.introducer_info ? (
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold border ${
                            ord.introducer_info.includes("LAN")
                              ? "bg-[#BFE9C3]/50 text-[#16381D] border-[#9ed4a3]"
                              : ord.introducer_info.includes("QUANG")
                              ? "bg-[#CFE8FF]/60 text-[#133A63] border-[#b2d9ff]"
                              : ord.introducer_info.includes("ADMIN")
                              ? "bg-[#FFE7A8]/70 text-[#542B07] border-[#ebd089]"
                              : "bg-gray-100 text-gray-700 border-gray-200"
                          }`}
                        >
                          <span>🌱</span>
                          <span className="truncate max-w-[140px]">{ord.introducer_info}</span>
                        </span>
                      ) : (
                        <span className="text-[#A89B92] italic text-[11px]">Trực tiếp (Website)</span>
                      )}
                    </td>

                    <td className="py-4 px-4 max-w-[180px] truncate">
                      <span className="font-medium text-gray-800 block">
                        {ord.delivery_type === "home_delivery" ? "Giao tận nơi" : "Nhận tại điểm"}
                      </span>
                      <span className="text-[11px] text-gray-500 truncate block">
                        {ord.address_detail}, {ord.district}
                      </span>
                    </td>

                    <td className="py-4 px-4">
                      <MoneyDisplay amount={ord.final_amount} className="font-bold text-[#1B3622]" />
                    </td>

                    <td className="py-4 px-4">
                      <Badge variant={ord.payment_status === "paid" ? "success" : "warning"}>
                        {PAYMENT_STATUS_LABELS[ord.payment_status]}
                      </Badge>
                    </td>

                    <td className="py-4 px-4">
                      <Badge variant={ord.order_status === "completed" ? "success" : "warning"}>
                        {ORDER_STATUS_LABELS[ord.order_status]}
                      </Badge>
                    </td>

                    <td className="py-4 px-4 text-[#7E7068] font-medium whitespace-nowrap">
                      {ord.completed_at ? (
                        formatDateTime(ord.completed_at)
                      ) : (
                        <span className="text-[#A89B92] italic">Chưa hoàn thành</span>
                      )}
                    </td>

                    <td className="py-4 px-4 text-right">
                      <select
                        value={ord.order_status}
                        onChange={(e) =>
                          setPendingStatusChange({
                            orderId: ord.order_id,
                            orderCode: ord.order_code,
                            newStatus: e.target.value as OrderStatus,
                            buyerName: ord.buyer_name || "Khách hàng",
                          })
                        }
                        className="px-2.5 py-1.5 rounded-xl border border-[#F0E5D8] text-xs bg-white font-semibold outline-none cursor-pointer hover:border-[#FFB98A]"
                      >
                        <option value="pending">Chờ xác nhận</option>
                        <option value="confirmed">Đã xác nhận</option>
                        <option value="processing">Đang chuẩn bị</option>
                        <option value="shipping">Đang giao</option>
                        <option value="completed">Hoàn thành</option>
                        <option value="cancelled">Hủy đơn</option>
                      </select>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-gray-500 font-medium">
                    Không tìm thấy đơn hàng phù hợp.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: XÁC NHẬN CHUYỂN TRẠNG THÁI ĐƠN HÀNG */}
      {pendingStatusChange && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 border border-[#F0E5D8] shadow-2xl space-y-4 animate-in zoom-in-95 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[#FFE7A8] text-[#542B07] flex items-center justify-center mx-auto">
              <ArrowUpDown className="w-6 h-6 text-[#E2884E]" />
            </div>

            <div className="space-y-1.5">
              <h3 className="font-heading font-extrabold text-base text-[#231B16]">
                Xác nhận đổi trạng thái đơn hàng?
              </h3>
              <p className="text-xs text-[#7E7068] leading-relaxed">
                Chuyển đơn hàng <strong>{pendingStatusChange.orderCode}</strong> của <strong>{pendingStatusChange.buyerName}</strong> sang trạng thái:
              </p>
              <div className="pt-1">
                <span className="inline-block px-3 py-1 rounded-full bg-[#BFE9C3] text-[#16381D] font-extrabold text-xs">
                  {ORDER_STATUS_LABELS[pendingStatusChange.newStatus]}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2.5 pt-2">
              <button
                onClick={() => setPendingStatusChange(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleConfirmStatusChange}
                className="px-5 py-2.5 rounded-full bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-xs shadow-xs border border-[#9ed4a3] transition-all cursor-pointer"
              >
                Xác nhận đổi ➔
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
