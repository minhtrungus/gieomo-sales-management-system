"use client";

import Link from "next/link";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { Badge } from "@/components/ui/Badge";
import { MOCK_ORDERS } from "@/lib/data/mockData";
import { ORDER_STATUS_LABELS } from "@/lib/constants";
import {
  DollarSign,
  ShoppingBag,
  Clock,
  CheckCircle2,
  PlusCircle,
  CreditCard,
  PackagePlus,
  Warehouse,
  ArrowUpRight,
  AlertTriangle,
} from "lucide-react";

export default function AdminDashboardPage() {
  const stats = [
    {
      label: "Tổng doanh thu",
      value: 12500000,
      icon: DollarSign,
      color: "bg-emerald-500/10 text-emerald-700",
      change: "+15% so với tuần trước",
    },
    {
      label: "Đơn hàng mới",
      value: "18 đơn",
      icon: ShoppingBag,
      color: "bg-blue-500/10 text-blue-700",
      change: "5 đơn cần xử lý ngay",
    },
    {
      label: "Đơn chờ xác nhận",
      value: "4 đơn",
      icon: Clock,
      color: "bg-amber-500/10 text-amber-700",
      change: "Cần duyệt thanh toán",
    },
    {
      label: "Thực thu đã nhận",
      value: 9800000,
      icon: CheckCircle2,
      color: "bg-purple-500/10 text-purple-700",
      change: "Đã khớp lệnh VietQR",
    },
  ];

  const quickActions = [
    { label: "Nhập đơn hộ", href: "/admin/orders/create", icon: PlusCircle, color: "bg-emerald-800 text-white" },
    { label: "Duyệt thanh toán", href: "/admin/payments", icon: CreditCard, color: "bg-soft-green text-emerald-950" },
    { label: "Thêm sản phẩm", href: "/admin/products/new", icon: PackagePlus, color: "bg-warm-orange text-orange-950" },
    { label: "Kiểm kho", href: "/admin/inventory", icon: Warehouse, color: "bg-white text-gray-800 border border-gray-200" },
  ];

  return (
    <div className="space-y-8">
      {/* Title */}
      <div>
        <h1 className="font-heading font-extrabold text-2xl text-emerald-950">
          Tổng quan chiến dịch gây quỹ Gieo Mơ
        </h1>
        <p className="text-xs text-gray-500 mt-1">
          Bảng điều khiển quản lý doanh số, đơn hàng và kho vận theo thời gian thực.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {stats.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <div
              key={idx}
              className="bg-white rounded-3xl p-5 border border-gray-200/80 shadow-2xs space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500">{stat.label}</span>
                <div className={`p-2.5 rounded-2xl ${stat.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-emerald-950">
                {typeof stat.value === "number" ? <MoneyDisplay amount={stat.value} /> : stat.value}
              </div>
              <p className="text-[11px] font-medium text-gray-500">{stat.change}</p>
            </div>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-2xs space-y-4">
        <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
          Thao tác nhanh:
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {quickActions.map((action, idx) => {
            const Icon = action.icon;
            return (
              <Link
                key={idx}
                href={action.href}
                className={`p-4 rounded-2xl font-bold text-xs flex items-center justify-between transition-all hover:scale-[1.02] shadow-2xs ${action.color}`}
              >
                <span>{action.label}</span>
                <Icon className="w-4 h-4 shrink-0" />
              </Link>
            );
          })}
        </div>
      </div>

      {/* Low Stock Warning Banner */}
      <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-amber-100 text-amber-800 shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="text-xs text-amber-950">
            <span className="font-bold block">Cảnh báo tồn kho sắp hết:</span>
            <span>Mặt hàng <strong>&quot;Pouch Mầm Mơ - Màu xanh bơ&quot;</strong> chỉ còn <strong>10 sản phẩm</strong> trong kho!</span>
          </div>
        </div>
        <Link
          href="/admin/inventory"
          className="px-3.5 py-1.5 rounded-xl bg-amber-200 hover:bg-amber-300 text-amber-950 text-xs font-bold whitespace-nowrap transition-colors"
        >
          Nhập kho ➔
        </Link>
      </div>

      {/* Recent Orders List */}
      <div className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-heading font-bold text-lg text-emerald-950">
            Đơn hàng mới nhận
          </h2>
          <Link
            href="/admin/orders"
            className="text-xs font-semibold text-emerald-800 hover:underline flex items-center gap-1"
          >
            Xem tất cả đơn <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-gray-500 font-semibold uppercase">
                <th className="py-3 px-3">Mã đơn</th>
                <th className="py-3 px-3">Khách hàng</th>
                <th className="py-3 px-3">Hình thức nhận</th>
                <th className="py-3 px-3">Tổng tiền</th>
                <th className="py-3 px-3">Trạng thái</th>
                <th className="py-3 px-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {MOCK_ORDERS.map((ord) => (
                <tr key={ord.order_id} className="hover:bg-emerald-50/40 transition-colors">
                  <td className="py-3.5 px-3 font-mono font-bold text-emerald-950">
                    {ord.order_code}
                  </td>
                  <td className="py-3.5 px-3">
                    <span className="font-semibold text-gray-900 block">{ord.buyer_name}</span>
                    <span className="text-[11px] text-gray-500">{ord.buyer_phone}</span>
                  </td>
                  <td className="py-3.5 px-3 font-medium text-gray-600">
                    {ord.delivery_type === "home_delivery" ? "Giao tận nơi" : "Nhận tại điểm"}
                  </td>
                  <td className="py-3.5 px-3">
                    <MoneyDisplay amount={ord.final_amount} className="font-bold text-emerald-950" />
                  </td>
                  <td className="py-3.5 px-3">
                    <Badge variant={ord.order_status === "completed" ? "success" : "warning"}>
                      {ORDER_STATUS_LABELS[ord.order_status]}
                    </Badge>
                  </td>
                  <td className="py-3.5 px-3 text-right">
                    <Link
                      href={`/admin/orders/${ord.order_id}`}
                      className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-emerald-100 text-gray-800 hover:text-emerald-950 font-semibold transition-colors"
                    >
                      Chi tiết
                    </Link>
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
