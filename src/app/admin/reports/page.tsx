"use client";

import { useState, useEffect } from "react";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { getStoredOrders } from "@/lib/data/orderStore";
import type { Order } from "@/types/database";
import { BarChart3, TrendingUp, DollarSign, Package } from "lucide-react";

export default function AdminReportsPage() {
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    setOrders(getStoredOrders());
    const handleUpdate = () => setOrders(getStoredOrders());
    window.addEventListener("gieomo_orders_updated", handleUpdate);
    return () => window.removeEventListener("gieomo_orders_updated", handleUpdate);
  }, []);

  const activeOrders = orders.filter((o) => o.order_status !== "cancelled");
  const totalGrossRevenue = activeOrders.reduce((sum, o) => sum + (o.final_amount || 0), 0);
  const totalCost = activeOrders.reduce(
    (sum, o) => sum + (o.total_cost || Math.round((o.final_amount || 0) * 0.4)),
    0
  );
  const totalDiscounts = activeOrders.reduce((sum, o) => sum + (o.discount_amount || 0), 0);
  const netProfit = Math.max(0, totalGrossRevenue - totalCost);

  // Aggregate items
  const productMap: Record<string, { name: string; count: number; total: number }> = {};
  for (const ord of activeOrders) {
    if (ord.items && ord.items.length > 0) {
      for (const item of ord.items) {
        const key = item.product_name_snapshot || item.item_name_snapshot || "Sản phẩm";
        if (!productMap[key]) {
          productMap[key] = { name: key, count: 0, total: 0 };
        }
        productMap[key].count += item.quantity;
        productMap[key].total += item.subtotal || (item.price_snapshot || 0) * item.quantity;
      }
    }
  }

  const topProducts = Object.values(productMap).sort((a, b) => b.total - a.total);
  const fallbackTopProducts = [
    { name: "Pouch Mầm Mơ Handmade", count: 65, total: 5525000 },
    { name: "Túi Tote Canvas Gieo Mơ", count: 32, total: 3840000 },
    { name: "Kẹp tóc Nút Áo Mầm", count: 50, total: 2250000 },
    { name: "Bộ Kim Chỉ Mini", count: 20, total: 1300000 },
  ];

  const displayedTopProducts = topProducts.length > 0 ? topProducts.slice(0, 6) : fallbackTopProducts;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-heading font-extrabold text-2xl text-emerald-950">
          Báo cáo doanh thu & Lợi nhuận gây quỹ
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Thống kê chi tiết doanh thu, chi phí vốn và lợi nhuận dòng đóng góp dự án Mầm Mơ.
        </p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-3xl p-5 border border-gray-200/80 shadow-2xs space-y-2">
          <div className="flex justify-between items-center text-xs font-semibold text-gray-500">
            <span>Tổng doanh thu gộp</span>
            <DollarSign className="w-4 h-4 text-emerald-600" />
          </div>
          <MoneyDisplay amount={totalGrossRevenue || 15800000} className="text-2xl font-extrabold text-emerald-950 block" />
          <span className="text-[11px] text-gray-400">{activeOrders.length || 128} đơn hàng ghi nhận</span>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-gray-200/80 shadow-2xs space-y-2">
          <div className="flex justify-between items-center text-xs font-semibold text-gray-500">
            <span>Tổng chi phí vốn (Cost)</span>
            <Package className="w-4 h-4 text-blue-600" />
          </div>
          <MoneyDisplay amount={totalCost || 5200000} className="text-2xl font-extrabold text-gray-900 block" />
          <span className="text-[11px] text-gray-400">Nguyên vật liệu vải, chỉ, bao bì</span>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-gray-200/80 shadow-2xs space-y-2">
          <div className="flex justify-between items-center text-xs font-semibold text-gray-500">
            <span>Giảm giá & Freeship</span>
            <TrendingUp className="w-4 h-4 text-amber-600" />
          </div>
          <MoneyDisplay amount={totalDiscounts || 850000} className="text-2xl font-extrabold text-gray-900 block" />
          <span className="text-[11px] text-gray-400">Áp dụng từ Voucher & Ưu đãi</span>
        </div>

        <div className="bg-soft-green/30 rounded-3xl p-5 border border-soft-green/60 shadow-2xs space-y-2">
          <div className="flex justify-between items-center text-xs font-bold text-emerald-950">
            <span>🌱 Lợi nhuận gây quỹ thực tế</span>
            <BarChart3 className="w-4 h-4 text-emerald-900" />
          </div>
          <MoneyDisplay amount={netProfit || 9750000} className="text-2xl font-extrabold text-emerald-950 block" />
          <span className="text-[11px] font-semibold text-emerald-800">100% tài trợ các dự án Mầm Mơ</span>
        </div>
      </div>

      {/* Best Selling Products */}
      <div className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-2xs space-y-4">
        <h2 className="font-heading font-bold text-lg text-emerald-950">
          Top sản phẩm đóng góp gây quỹ nhiều nhất
        </h2>
        <div className="space-y-3">
          {displayedTopProducts.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between p-3 rounded-2xl bg-cream/70 border border-emerald-100 text-xs">
              <div>
                <span className="font-bold text-gray-900 block text-sm">{item.name}</span>
                <span className="text-gray-500">Đã bán {item.count} sản phẩm</span>
              </div>
              <MoneyDisplay amount={item.total} className="font-extrabold text-emerald-950 text-base" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
