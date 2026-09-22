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

  const handleStatusChange = (orderId: string, newStatus: OrderStatus) => {
    setOrders((prev) =>
      prev.map((o) => (o.order_id === orderId ? { ...o, order_status: newStatus } : o))
    );
  };

  const filteredOrders = orders.filter((ord) => {
    if (statusFilter !== "all" && ord.order_status !== statusFilter) return false;
    if (
      searchQuery.trim() !== "" &&
      !ord.order_code.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !ord.buyer_name?.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !ord.buyer_phone?.includes(searchQuery)
    ) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Page Title & CTA */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-emerald-950">
            Quản lý đơn hàng
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Danh sách tất cả đơn hàng gây quỹ từ website và thành viên chốt đơn.
          </p>
        </div>

        <Link
          href="/admin/orders/create"
          className="px-4 py-2.5 rounded-2xl bg-emerald-900 hover:bg-emerald-950 text-white font-bold text-xs flex items-center gap-2 shadow-xs transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>+ Nhập đơn hộ</span>
        </Link>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-3xl p-4 border border-gray-200/80 shadow-2xs space-y-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Mã đơn GM-..., SĐT, tên khách..."
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 text-xs outline-none focus:border-soft-green"
            />
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <Filter className="w-4 h-4 text-gray-500" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-800 outline-none"
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

      {/* Orders Table */}
      <div className="bg-white rounded-3xl border border-gray-200/80 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 font-semibold uppercase">
                <th className="py-3 px-4">Mã đơn</th>
                <th className="py-3 px-4">Khách hàng</th>
                <th className="py-3 px-4">Hình thức / Địa chỉ</th>
                <th className="py-3 px-4">Tổng tiền</th>
                <th className="py-3 px-4">Thanh toán</th>
                <th className="py-3 px-4">Trạng thái</th>
                <th className="py-3 px-4 text-right">Đổi trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredOrders.length > 0 ? (
                filteredOrders.map((ord) => (
                  <tr key={ord.order_id} className="hover:bg-emerald-50/30 transition-colors">
                    <td className="py-4 px-4 font-mono font-bold text-emerald-950">
                      <Link href={`/admin/orders/${ord.order_id}`} className="hover:underline">
                        {ord.order_code}
                      </Link>
                    </td>
                    <td className="py-4 px-4">
                      <span className="font-semibold text-gray-900 block">{ord.buyer_name}</span>
                      <span className="text-[11px] text-gray-500">{ord.buyer_phone}</span>
                    </td>
                    <td className="py-4 px-4 max-w-[200px] truncate">
                      <span className="font-medium text-gray-800 block">
                        {ord.delivery_type === "home_delivery" ? "Giao tận nơi" : "Nhận tại điểm"}
                      </span>
                      <span className="text-[11px] text-gray-500 truncate block">
                        {ord.address_detail}, {ord.district}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <MoneyDisplay amount={ord.final_amount} className="font-bold text-emerald-950" />
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
                    <td className="py-4 px-4 text-right">
                      <select
                        value={ord.order_status}
                        onChange={(e) => handleStatusChange(ord.order_id, e.target.value as OrderStatus)}
                        className="px-2 py-1 rounded-lg border border-gray-200 text-xs bg-white font-semibold outline-none"
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
                  <td colSpan={7} className="py-8 text-center text-gray-500 font-medium">
                    Không tìm thấy đơn hàng phù hợp.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
