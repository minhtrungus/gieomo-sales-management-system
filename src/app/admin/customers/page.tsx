"use client";

import { useState, useEffect } from "react";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { Search, Users, Phone, Mail, ShoppingBag } from "lucide-react";
import { getStoredOrders } from "@/lib/data/orderStore";

interface CustomerRecord {
  customerId: string;
  fullName: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  totalOrders: number;
  totalSpent: number;
  createdAt: string;
}

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const loadCustomers = () => {
    try {
      const orders = getStoredOrders();
      const custRaw = typeof window !== "undefined" ? localStorage.getItem("gieomo_customers") : null;
      const localCusts: CustomerRecord[] = custRaw ? JSON.parse(custRaw) : [];

      // Map phone -> customer record
      const map = new Map<string, CustomerRecord>();

      // Seed baseline customers
      map.set("0901234567", {
        customerId: "cust-1",
        fullName: "Nguyễn Văn A",
        phone: "0901234567",
        email: "nguyenvana@example.com",
        address: "123 Nguyễn Huệ, Quận 1, TP.HCM",
        totalOrders: 3,
        totalSpent: 420000,
        createdAt: "2026-09-01",
      });

      map.set("0987654321", {
        customerId: "cust-2",
        fullName: "Trần Thị C",
        phone: "0987654321",
        email: "tranthic@example.com",
        address: "45 Lê Lợi, Quận 3, TP.HCM",
        totalOrders: 1,
        totalSpent: 85000,
        createdAt: "2026-09-10",
      });

      // Merge local saved customers
      for (const lc of localCusts) {
        const cleanP = lc.phone?.replace(/\s+/g, "");
        if (cleanP) {
          map.set(cleanP, {
            ...lc,
            phone: cleanP,
          });
        }
      }

      // Aggregate dynamically from all stored orders (#24)
      for (const ord of orders) {
        const rawPhone = ord.buyer_phone || ord.recipient_phone;
        if (!rawPhone) continue;
        const cleanPhone = rawPhone.replace(/\s+/g, "");

        const existing = map.get(cleanPhone);
        if (existing) {
          existing.totalOrders = Math.max(existing.totalOrders, orders.filter((o) => (o.buyer_phone || o.recipient_phone)?.replace(/\s+/g, "") === cleanPhone).length);
          existing.totalSpent = orders.filter((o) => (o.buyer_phone || o.recipient_phone)?.replace(/\s+/g, "") === cleanPhone).reduce((sum, o) => sum + (o.final_amount || 0), 0);
          if (ord.buyer_name && !existing.fullName) existing.fullName = ord.buyer_name;
          if (ord.buyer_email && !existing.email) existing.email = ord.buyer_email;
          if (ord.address_detail && !existing.address) existing.address = `${ord.address_detail}, ${ord.district || ""}, ${ord.province || ""}`;
        } else {
          const matchingOrders = orders.filter((o) => (o.buyer_phone || o.recipient_phone)?.replace(/\s+/g, "") === cleanPhone);
          map.set(cleanPhone, {
            customerId: `cust-${cleanPhone}`,
            fullName: ord.buyer_name || ord.recipient_name || "Khách hàng",
            phone: cleanPhone,
            email: ord.buyer_email || "",
            address: `${ord.address_detail || ""}, ${ord.district || ""}, ${ord.province || ""}`,
            totalOrders: matchingOrders.length,
            totalSpent: matchingOrders.reduce((sum, o) => sum + (o.final_amount || 0), 0),
            createdAt: ord.created_at,
          });
        }
      }

      const list = Array.from(map.values()).sort((a, b) => b.totalSpent - a.totalSpent);
      setCustomers(list);
    } catch (e) {
      console.error("Error loading customers", e);
    }
  };

  useEffect(() => {
    loadCustomers();
    window.addEventListener("gieomo_orders_updated", loadCustomers);
    return () => window.removeEventListener("gieomo_orders_updated", loadCustomers);
  }, []);

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
                <th className="py-3 px-3 w-12 text-center">STT</th>
                <th className="py-3 px-4">Họ tên</th>
                <th className="py-3 px-4">Số điện thoại / Email</th>
                <th className="py-3 px-4">Địa chỉ giao hàng</th>
                <th className="py-3 px-4 text-center">Số đơn đã đặt</th>
                <th className="py-3 px-4 text-right">Tổng tiền ủng hộ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-gray-400">
                    Không tìm thấy khách hàng nào phù hợp.
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((c, idx) => (
                  <tr key={c.customerId} className="hover:bg-emerald-50/30 transition-colors">
                    <td className="py-3.5 px-3 text-center text-gray-400 font-semibold">
                      {idx + 1}
                    </td>
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
                    <td className="py-3.5 px-4 text-center font-bold text-emerald-950">
                      {c.totalOrders} đơn
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <MoneyDisplay amount={c.totalSpent} className="font-extrabold text-emerald-950" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
