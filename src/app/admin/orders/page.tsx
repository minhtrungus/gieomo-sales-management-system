"use client";

import { useState, useEffect, useMemo } from "react";
import { useDebounce } from "@/lib/hooks/useDebounce";
import Link from "next/link";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { Badge } from "@/components/ui/Badge";
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS } from "@/lib/constants";
import { MOCK_ORDERS } from "@/lib/data/mockData";
import { getStoredOrders, updateStoredOrderStatus } from "@/lib/data/orderStore";
import type { Order, OrderStatus } from "@/types/database";
import { Search, Plus, Filter, ArrowUpDown, Copy, Check } from "lucide-react";

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>(MOCK_ORDERS);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 250);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [introducerFilter, setIntroducerFilter] = useState<string>("all");
  const [copiedAddressId, setCopiedAddressId] = useState<string | null>(null);

  useEffect(() => {
    setOrders(getStoredOrders());
    const handleUpdate = () => {
      setOrders(getStoredOrders());
    };
    window.addEventListener("gieomo_orders_updated", handleUpdate);
    return () => window.removeEventListener("gieomo_orders_updated", handleUpdate);
  }, []);

  const handleCopyAddress = (e: React.MouseEvent, ord: Order) => {
    e.stopPropagation();
    const addressParts = [
      ord.recipient_name ? `Người nhận: ${ord.recipient_name}` : (ord.buyer_name ? `Người nhận: ${ord.buyer_name}` : null),
      ord.recipient_phone ? `SĐT: ${ord.recipient_phone}` : (ord.buyer_phone ? `SĐT: ${ord.buyer_phone}` : null),
      ord.address_detail,
      ord.district,
      ord.province,
    ].filter(Boolean);
    const fullText = addressParts.join(" - ");
    navigator.clipboard.writeText(fullText);
    setCopiedAddressId(ord.order_id);
    setTimeout(() => setCopiedAddressId(null), 2000);
  };

  const [pendingStatusChange, setPendingStatusChange] = useState<{
    orderId: string;
    orderCode: string;
    newStatus: OrderStatus;
    buyerName: string;
  } | null>(null);

  const handleConfirmStatusChange = () => {
    if (!pendingStatusChange) return;
    updateStoredOrderStatus(pendingStatusChange.orderId, pendingStatusChange.newStatus);
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

  const filteredOrders = useMemo(() => {
    return orders.filter((ord) => {
      if (statusFilter !== "all" && ord.order_status !== statusFilter) return false;
      if (introducerFilter !== "all") {
        if (introducerFilter === "direct" && ord.introducer_info && ord.introducer_info !== "Trực tiếp (Website)") return false;
        if (introducerFilter !== "direct" && !ord.introducer_info?.includes(introducerFilter)) return false;
      }
      if (
        debouncedSearch &&
        !ord.order_code.toLowerCase().includes(debouncedSearch.toLowerCase()) &&
        !ord.buyer_name?.toLowerCase().includes(debouncedSearch.toLowerCase()) &&
        !ord.buyer_phone?.includes(debouncedSearch) &&
        !ord.introducer_info?.toLowerCase().includes(debouncedSearch.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [orders, statusFilter, introducerFilter, debouncedSearch]);

  const formatDateTime = (iso: string) => {
    const d = new Date(iso);
    const time = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
    const date = d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
    return `${time} ${date}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-[#231B16]">
            Danh sách đơn hàng
          </h1>
          <p className="text-xs text-[#7E7068] mt-0.5">
            Quản lý toàn bộ {orders.length} đơn hàng, trạng thái thanh toán và người giới thiệu.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/admin/orders/pos"
            className="px-4 py-2.5 rounded-full bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-xs flex items-center gap-1.5 shadow-xs transition-all border border-[#9ed4a3] active:scale-95 cursor-pointer"
          >
            <span>⚡ Bán trực tiếp tại sự kiện</span>
          </Link>

          <Link
            href="/admin/orders/create"
            className="px-4 py-2.5 rounded-full bg-white hover:bg-gray-50 text-[#5C4D44] font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-all border border-[#F0E5D8] active:scale-95 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>📝 Nhập đơn đặt hộ</span>
          </Link>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white rounded-3xl p-4 border border-[#F0E5D8] shadow-soft flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A89B92]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm mã đơn, tên khách, số điện thoại..."
            className="w-full pl-9 pr-4 py-2 rounded-2xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] bg-[#FFFDF9]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Lọc theo Quen qua ai */}
          <div className="flex items-center gap-1 bg-[#FFFDF9] border border-[#F0E5D8] rounded-2xl px-3 py-1.5 text-xs">
            <span className="text-[#7E7068] font-bold whitespace-nowrap">Quen qua:</span>
            <select
              value={introducerFilter}
              onChange={(e) => setIntroducerFilter(e.target.value)}
              className="bg-transparent font-extrabold text-[#1B3622] outline-none cursor-pointer"
            >
              <option value="all">Tất cả nguồn đơn</option>
              <option value="LAN">Mai Lan (MAM-LAN)</option>
              <option value="QUANG">Minh Quang (MAM-QUANG)</option>
              <option value="ADMIN">BTC Mầm Mơ (MAM-ADMIN)</option>
              <option value="direct">Trực tiếp qua Web</option>
            </select>
          </div>

          {/* Lọc theo Trạng thái */}
          <div className="flex items-center gap-1.5 bg-[#FFFDF9] border border-[#F0E5D8] rounded-2xl px-3 py-1.5 text-xs">
            <Filter className="w-3.5 h-3.5 text-[#A89B92]" />
            <span className="text-[#7E7068] font-medium whitespace-nowrap">Trạng thái:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent font-bold text-[#342A24] outline-none cursor-pointer"
            >
              <option value="all">Tất cả ({orders.length})</option>
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

      {/* Orders Table - Scaled for high information density */}
      <div className="bg-white rounded-3xl border border-[#F0E5D8] shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead>
              <tr className="bg-[#FFF8EE] border-b border-[#F0E5D8] text-[#7E7068] font-bold uppercase tracking-wider text-[10px]">
                <th className="py-2.5 px-2.5 text-center w-10">STT</th>
                <th className="py-2.5 px-2.5">Mã đơn</th>
                <th className="py-2.5 px-2.5">Thời gian đặt</th>
                <th className="py-2.5 px-2.5">Khách hàng</th>
                <th className="py-2.5 px-2.5">Quen qua ai</th>
                <th className="py-2.5 px-2.5">
                  <span className="flex items-center gap-1">
                    <span>Địa điểm nhận</span>
                    <span className="text-[9px] font-normal normal-case text-emerald-700 bg-emerald-100 px-1 rounded">(Bấm để chép)</span>
                  </span>
                </th>
                <th className="py-2.5 px-2.5">Tổng tiền</th>
                <th className="py-2.5 px-2.5">Thanh toán</th>
                <th className="py-2.5 px-2.5">Trạng thái</th>
                <th className="py-2.5 px-2.5">Thời gian giao</th>
                <th className="py-2.5 px-2.5 text-right">Đổi trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0E5D8]">
              {filteredOrders.length > 0 ? (
                filteredOrders.map((ord, idx) => (
                  <tr key={ord.order_id} className="hover:bg-[#FFFDF9] transition-colors">
                    <td className="py-2.5 px-2.5 text-center text-[#7E7068] font-bold text-[11px]">
                      {idx + 1}
                    </td>

                    <td className="py-2.5 px-2.5 font-mono font-bold text-[#1B3622] whitespace-nowrap">
                      <Link href={`/admin/orders/${ord.order_id}`} className="hover:underline">
                        {ord.order_code}
                      </Link>
                    </td>

                    <td className="py-2.5 px-2.5 text-[#7E7068] font-medium whitespace-nowrap text-[10.5px]">
                      {formatDateTime(ord.created_at)}
                    </td>

                    <td className="py-2.5 px-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-gray-900 block text-xs">
                          {ord.buyer_name || "Khách tại quầy"}
                        </span>
                        {ord.source_type === "event_sale" && (
                          <span className="px-1.5 py-0.2 rounded-md bg-amber-100 text-amber-900 font-extrabold text-[9px] border border-amber-300">
                            ⚡ Sự kiện
                          </span>
                        )}
                        {ord.source_type === "admin_manual" && (
                          <span className="px-1.5 py-0.2 rounded-md bg-blue-100 text-blue-900 font-extrabold text-[9px] border border-blue-200">
                            📝 Đặt hộ
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-gray-500 font-mono">
                        {ord.buyer_phone || (ord.source_type === "event_sale" ? "Mua tại quầy" : "—")}
                      </span>
                    </td>

                    <td className="py-2.5 px-2.5 whitespace-nowrap">
                      {ord.introducer_info ? (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${
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
                          <span className="truncate max-w-[120px]">{ord.introducer_info}</span>
                        </span>
                      ) : (
                        <span className="text-[#A89B92] italic text-[10px]">Trực tiếp (Website)</span>
                      )}
                    </td>

                    <td className="py-2.5 px-2.5 max-w-[170px]">
                      {ord.source_type === "event_sale" ? (
                        <div className="p-1 text-[10.5px] font-semibold text-emerald-800 bg-emerald-50 rounded-lg border border-emerald-200">
                          ⚡ Giao tại chỗ (Sự kiện)
                        </div>
                      ) : (
                        <div
                          onClick={(e) => handleCopyAddress(e, ord)}
                          className="group/addr cursor-pointer p-1 -m-1 rounded-lg hover:bg-[#FFF8EE] border border-transparent hover:border-[#ebd089] transition-all"
                          title="Nhấn để sao chép thông tin người nhận & địa chỉ giao hàng"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-bold text-gray-800 text-[10px] block">
                              {ord.delivery_type === "home_delivery" ? "🏠 Giao tận nơi" : "📍 Điểm nhận"}
                            </span>
                            {copiedAddressId === ord.order_id ? (
                              <span className="inline-flex items-center gap-0.5 text-[9px] font-extrabold text-[#16381D] bg-[#BFE9C3] px-1 py-0.2 rounded border border-[#9ed4a3]">
                                <Check className="w-2.5 h-2.5" /> Đã chép
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-0.5 text-[9px] text-[#7E7068] group-hover/addr:text-[#2D6338] bg-gray-50 group-hover/addr:bg-emerald-50 px-1 py-0.2 rounded border border-gray-200 group-hover/addr:border-emerald-200 transition-colors">
                                <Copy className="w-2.5 h-2.5" /> Chép
                              </span>
                            )}
                          </div>
                          <span className="text-[10.5px] text-gray-600 truncate block mt-0.5" title={`${ord.address_detail || ""}, ${ord.province || ""}`}>
                            {ord.address_detail || "—"}
                          </span>
                        </div>
                      )}
                    </td>

                    <td className="py-2.5 px-2.5 whitespace-nowrap">
                      <MoneyDisplay amount={ord.final_amount} className="font-bold text-[#1B3622] text-xs" />
                    </td>

                    <td className="py-2.5 px-2.5 whitespace-nowrap">
                      <Badge variant={ord.payment_status === "paid" ? "success" : "warning"} className="text-[10px] px-2 py-0.5">
                        {PAYMENT_STATUS_LABELS[ord.payment_status]}
                      </Badge>
                    </td>

                    <td className="py-2.5 px-2.5 whitespace-nowrap">
                      <Badge variant={ord.order_status === "completed" ? "success" : "warning"} className="text-[10px] px-2 py-0.5">
                        {ORDER_STATUS_LABELS[ord.order_status]}
                      </Badge>
                    </td>

                    <td className="py-2.5 px-2.5 text-[#7E7068] font-medium whitespace-nowrap text-[10.5px]">
                      {ord.completed_at ? (
                        formatDateTime(ord.completed_at)
                      ) : (
                        <span className="text-[#A89B92] italic text-[10px]">Chưa xong</span>
                      )}
                    </td>

                    <td className="py-2.5 px-2.5 text-right whitespace-nowrap">
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
                        className="px-2 py-1 rounded-xl border border-[#F0E5D8] text-[10.5px] bg-white font-semibold outline-none cursor-pointer hover:border-[#FFB98A]"
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
                  <td colSpan={11} className="py-8 text-center text-gray-500 font-medium">
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
