"use client";

import { useState } from "react";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { Search } from "lucide-react";

export default function AdminCustomersPage() {
  const [customers] = useState([
    {
      customerId: "cust-1",
      fullName: "Nguyễn Văn A",
      phone: "0901234567",
      email: "nguyenvana@example.com",
      address: "123 Nguyễn Huệ, Quận 1, TP.HCM",
      totalOrders: 3,
      totalSpent: 420000,
      createdAt: "2026-09-01",
    },
    {
      customerId: "cust-2",
      fullName: "Trần Thị C",
      phone: "0987654321",
      email: "tranthic@example.com",
      address: "45 Lê Lợi, Quận 3, TP.HCM",
      totalOrders: 1,
      totalSpent: 85000,
      createdAt: "2026-09-10",
    },
  ]);

  const [searchQuery, setSearchQuery] = useState("");

  const filteredCustomers = customers.filter(
    (c) =>
      c.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery) ||
      (c.email && c.email.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-heading font-extrabold text-2xl text-emerald-950">
          Danh sách khách hàng
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Danh sách thông tin khách hàng đã ủng hộ mua sản phẩm gây quỹ.
        </p>
      </div>

      {/* Search Bar */}
      <div className="bg-white rounded-3xl p-4 border border-gray-200/80 shadow-2xs">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tên, SĐT, Email..."
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 text-xs outline-none focus:border-soft-green"
          />
        </div>
      </div>

      {/* Customers Table */}
      <div className="bg-white rounded-3xl border border-gray-200/80 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 font-semibold uppercase">
                <th className="py-3 px-4">Họ tên</th>
                <th className="py-3 px-4">Số điện thoại / Email</th>
                <th className="py-3 px-4">Địa chỉ giao hàng</th>
                <th className="py-3 px-4">Số đơn đã đặt</th>
                <th className="py-3 px-4 text-right">Tổng tiền ủng hộ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredCustomers.map((c) => (
                <tr key={c.customerId} className="hover:bg-emerald-50/30 transition-colors">
                  <td className="py-3.5 px-4 font-bold text-gray-900">
                    {c.fullName}
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="font-mono text-gray-900 block">{c.phone}</span>
                    <span className="text-[11px] text-gray-500 block">{c.email}</span>
                  </td>
                  <td className="py-3.5 px-4 text-gray-600 max-w-[250px] truncate">
                    {c.address}
                  </td>
                  <td className="py-3.5 px-4 font-bold text-emerald-950">
                    {c.totalOrders} đơn
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <MoneyDisplay amount={c.totalSpent} className="font-extrabold text-emerald-950" />
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
