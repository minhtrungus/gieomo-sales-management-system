"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Search,
  Filter,
  ShoppingBag,
  ExternalLink,
  ChevronRight,
  Package,
  Phone,
  MapPin,
  Clock,
  CheckCircle,
  XCircle,
  Eye,
  X,
  CreditCard,
} from "lucide-react";
import {
  getAdminSession,
  getStoredOrders,
  type AdminSession,
} from "@/lib/data/orderStore";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { Badge } from "@/components/ui/Badge";
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS } from "@/lib/constants";
import type { Order } from "@/types/database";

export default function SaleOrdersPage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  useEffect(() => {
    const s = getAdminSession();
    setSession(s);
    const all = getStoredOrders();

    if (s) {
      const myOrders = all.filter(
        (o) =>
          (s.referralCode && o.referral_code?.toLowerCase() === s.referralCode.toLowerCase()) ||
          (s.memberId && o.seller_id === s.memberId) ||
          (s.memberId && o.created_by_member_id === s.memberId)
      );
      setOrders(myOrders);
    }

    const handleUpdate = () => {
      const currentSession = getAdminSession();
      setSession(currentSession);
      const updated = getStoredOrders();
      if (currentSession) {
        const filtered = updated.filter(
          (o) =>
            (currentSession.referralCode &&
              o.referral_code?.toLowerCase() === currentSession.referralCode.toLowerCase()) ||
            (currentSession.memberId && o.seller_id === currentSession.memberId) ||
            (currentSession.memberId && o.created_by_member_id === currentSession.memberId)
        );
        setOrders(filtered);
      }
    };

    window.addEventListener("gieomo_orders_updated", handleUpdate);
    return () => window.removeEventListener("gieomo_orders_updated", handleUpdate);
  }, []);

  // Filter & Search
  const filteredOrders = orders.filter((o) => {
    if (statusFilter !== "all" && o.order_status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchCode = o.order_code.toLowerCase().includes(q);
      const matchName = (o.buyer_name || "").toLowerCase().includes(q);
      const matchPhone = (o.buyer_phone || "").includes(q);
      return matchCode || matchName || matchPhone;
    }
    return true;
  });

  const totalRevenue = filteredOrders
    .filter((o) => o.order_status !== "cancelled")
    .reduce((sum, o) => sum + (o.final_amount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-[#231B16]">
            Đơn Hàng Của Tôi
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Danh sách đơn hàng gắn mã giới thiệu của bạn hoặc do bạn nhập hộ.
          </p>
        </div>

        <Link
          href="/sale/create-order"
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-[#16381D] hover:bg-[#234E2B] text-white text-xs font-bold transition-all shadow-xs"
        >
          <span>+ Nhập đơn hộ mới</span>
        </Link>
      </div>

      {/* Summary Filter Bar */}
      <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Tìm theo mã đơn, tên khách, số điện thoại..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-10 pr-4 rounded-2xl border border-gray-200 bg-gray-50 text-xs text-gray-800 focus:outline-none focus:border-emerald-600 focus:bg-white"
          />
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 px-3 rounded-2xl border border-gray-200 bg-gray-50 text-xs font-semibold text-gray-700 focus:outline-none focus:border-emerald-600 cursor-pointer"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="pending">Chờ xác nhận</option>
            <option value="confirmed">Đã xác nhận</option>
            <option value="processing">Đang chuẩn bị</option>
            <option value="shipping">Đang giao</option>
            <option value="completed">Giao thành công</option>
            <option value="cancelled">Đã hủy</option>
          </select>
        </div>

        {/* Quick Stats */}
        <div className="hidden lg:flex items-center gap-4 pl-4 border-l border-gray-100 text-xs">
          <div>
            <span className="text-gray-400 block text-[10px] uppercase font-bold">Tổng đơn</span>
            <span className="font-extrabold text-[#16381D]">{filteredOrders.length}</span>
          </div>
          <div>
            <span className="text-gray-400 block text-[10px] uppercase font-bold">Doanh số lọc</span>
            <MoneyDisplay amount={totalRevenue} className="font-extrabold text-[#16381D]" />
          </div>
        </div>
      </div>

      {/* Orders List */}
      {filteredOrders.length > 0 ? (
        <div className="space-y-3">
          {filteredOrders.map((ord) => (
            <div
              key={ord.order_id}
              className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs hover:border-emerald-200 transition-all space-y-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono font-extrabold text-sm text-[#16381D] bg-[#EBF7EE] px-2.5 py-1 rounded-xl border border-[#BFE9C3]">
                    {ord.order_code}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(ord.created_at).toLocaleString("vi-VN")}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant={ord.order_status === "completed" ? "success" : ord.order_status === "cancelled" ? "default" : "warning"}>
                    {ORDER_STATUS_LABELS[ord.order_status]}
                  </Badge>
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                      ord.payment_status === "paid"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {PAYMENT_STATUS_LABELS[ord.payment_status] || "Chưa TT"}
                  </span>
                </div>
              </div>

              {/* Order Info Body */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-gray-400 text-[11px] block">Người nhận:</span>
                  <span className="font-bold text-gray-900 block">{ord.buyer_name}</span>
                  <span className="text-gray-500 font-mono text-[11px] flex items-center gap-1 mt-0.5">
                    <Phone className="w-3 h-3 text-gray-400" />
                    {ord.buyer_phone}
                  </span>
                </div>

                <div>
                  <span className="text-gray-400 text-[11px] block">Hình thức nhận hàng:</span>
                  <span className="font-semibold text-gray-800 block">
                    {ord.delivery_type === "home_delivery" ? "Giao tận nơi" : "Nhận tại điểm hẹn"}
                  </span>
                  <span className="text-gray-500 text-[11px] block truncate mt-0.5">
                    {ord.address_detail}
                  </span>
                </div>

                <div className="sm:text-right flex sm:flex-col justify-between items-center sm:items-end">
                  <div>
                    <span className="text-gray-400 text-[11px] block">Tổng thanh toán:</span>
                    <MoneyDisplay
                      amount={ord.final_amount}
                      className="font-extrabold text-base text-[#16381D]"
                    />
                  </div>
                  <button
                    onClick={() => setSelectedOrder(ord)}
                    className="inline-flex items-center gap-1 text-xs font-bold text-emerald-800 hover:text-emerald-950 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-xl transition-colors cursor-pointer mt-1"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Chi tiết đơn</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-3xl p-12 text-center border border-gray-100 shadow-xs space-y-3">
          <div className="w-12 h-12 rounded-full bg-gray-50 text-gray-400 flex items-center justify-center mx-auto text-xl">
            📦
          </div>
          <h3 className="font-bold text-sm text-gray-700">Không tìm thấy đơn hàng nào</h3>
          <p className="text-xs text-gray-400 max-w-sm mx-auto">
            {searchQuery || statusFilter !== "all"
              ? "Hãy thử thay đổi điều kiện tìm kiếm hoặc bộ lọc trạng thái."
              : "Bạn chưa có đơn hàng nào. Hãy chia sẻ link giới thiệu hoặc tạo đơn hộ cho người quen!"}
          </p>
        </div>
      )}

      {/* Order Details Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <span className="text-[10px] text-gray-400 uppercase font-bold">Chi tiết đơn hàng</span>
                <h3 className="font-mono font-extrabold text-lg text-[#16381D]">
                  {selectedOrder.order_code}
                </h3>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="p-1 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Customer Details */}
            <div className="bg-gray-50 rounded-2xl p-4 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400">Khách hàng:</span>
                <span className="font-bold text-gray-800">{selectedOrder.buyer_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Điện thoại:</span>
                <span className="font-bold text-gray-800">{selectedOrder.buyer_phone}</span>
              </div>
              {selectedOrder.buyer_email && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Email:</span>
                  <span className="text-gray-800">{selectedOrder.buyer_email}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-400">Địa chỉ:</span>
                <span className="text-gray-800 text-right max-w-[240px] font-medium">
                  {selectedOrder.address_detail}
                </span>
              </div>
              {selectedOrder.customer_note && (
                <div className="flex justify-between border-t border-gray-200/60 pt-2">
                  <span className="text-gray-400">Ghi chú:</span>
                  <span className="text-gray-700 text-right italic">{selectedOrder.customer_note}</span>
                </div>
              )}
            </div>

            {/* Items List */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-gray-700 block">Sản phẩm trong đơn:</span>
              <div className="divide-y divide-gray-100 border border-gray-100 rounded-2xl overflow-hidden">
                {selectedOrder.items?.map((it, idx) => (
                  <div key={idx} className="p-3 text-xs flex justify-between items-center bg-white">
                    <div>
                      <span className="font-bold text-gray-900 block">{it.product_name_snapshot}</span>
                      {it.variant_name_snapshot && (
                        <span className="text-[11px] text-gray-500">
                          Phân loại: {it.variant_name_snapshot}
                        </span>
                      )}
                      <span className="text-[11px] text-gray-400 block">
                        Số lượng: x{it.quantity}
                      </span>
                    </div>
                    <MoneyDisplay amount={it.subtotal} className="font-bold text-emerald-950" />
                  </div>
                ))}
              </div>
            </div>

            {/* Total Pricing */}
            <div className="bg-[#16381D] text-white p-4 rounded-2xl space-y-2 text-xs">
              <div className="flex justify-between text-emerald-100/80">
                <span>Tiền hàng:</span>
                <span>{selectedOrder.subtotal?.toLocaleString("vi-VN")}đ</span>
              </div>
              <div className="flex justify-between text-emerald-100/80">
                <span>Phí vận chuyển:</span>
                <span>{selectedOrder.shipping_fee?.toLocaleString("vi-VN")}đ</span>
              </div>
              <div className="flex justify-between text-base font-extrabold text-[#BFE9C3] pt-2 border-t border-[#264E2E]">
                <span>Tổng cộng:</span>
                <span>{selectedOrder.final_amount?.toLocaleString("vi-VN")}đ</span>
              </div>
            </div>

            <button
              onClick={() => setSelectedOrder(null)}
              className="w-full py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 font-bold text-xs text-gray-700 transition-colors cursor-pointer"
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
