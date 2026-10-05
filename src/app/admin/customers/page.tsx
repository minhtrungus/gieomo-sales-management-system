"use client";

import { useState, useEffect } from "react";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { Users, Phone, Mail, ShoppingBag } from "lucide-react";
import { getStoredOrders } from "@/lib/data/orderStore";
import { AdminSearchInput } from "@/components/admin/AdminSearchInput";

interface CustomerRecord {
  customerId: string;
  fullName: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  introducerInfo?: string | null;
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

      // Map phone -> customer record & set of counted order codes
      const map = new Map<string, CustomerRecord>();
      const orderCodesByPhone = new Map<string, Set<string>>();

      // Seed customer info from localCusts (reset counters to 0 so orders are not double-counted)
      for (const lc of localCusts) {
        const cleanP = lc.phone?.replace(/\s+/g, "");
        if (cleanP) {
          map.set(cleanP, {
            ...lc,
            phone: cleanP,
            totalOrders: 0,
            totalSpent: 0,
          });
          orderCodesByPhone.set(cleanP, new Set<string>());
        }
      }

      // Aggregate dynamically from all stored orders by unique order_code
      for (const ord of orders) {
        const rawPhone = ord.buyer_phone || ord.recipient_phone;
        if (!rawPhone || rawPhone === "—") continue;
        const cleanPhone = rawPhone.replace(/\s+/g, "");
        if (!cleanPhone) continue;

        const orderCode = (ord.order_code || ord.order_id).trim().toUpperCase();
        let seen = orderCodesByPhone.get(cleanPhone);
        if (!seen) {
          seen = new Set<string>();
          orderCodesByPhone.set(cleanPhone, seen);
        }
        if (seen.has(orderCode)) continue; // skip duplicate order!
        seen.add(orderCode);

        const amount = ord.final_amount || 0;
        const intro = ord.introducer_info || (ord.referral_code ? `Mã: ${ord.referral_code}` : null);

        const existing = map.get(cleanPhone);
        if (existing) {
          existing.totalOrders += 1;
          existing.totalSpent += amount;
          if (ord.buyer_name && (!existing.fullName || existing.fullName === "Khách hàng" || existing.fullName === "Khách tại quầy")) {
            existing.fullName = ord.buyer_name;
          }
          if (ord.buyer_email && !existing.email) existing.email = ord.buyer_email;
          if (ord.address_detail && !existing.address) {
            existing.address = `${ord.address_detail}, ${ord.district || ""}, ${ord.province || ""}`;
          }
          if (intro && (!existing.introducerInfo || existing.introducerInfo === "Trực tiếp")) {
            existing.introducerInfo = intro;
          }
        } else {
          map.set(cleanPhone, {
            customerId: `cust-${cleanPhone}`,
            fullName: (ord.buyer_name && ord.buyer_name !== "Khách tại quầy") ? ord.buyer_name : (ord.recipient_name || "Khách hàng"),
            phone: cleanPhone,
            email: ord.buyer_email || "",
            address: `${ord.address_detail || ""}, ${ord.district || ""}, ${ord.province || ""}`,
            introducerInfo: intro || "Trực tiếp",
            totalOrders: 1,
            totalSpent: amount,
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
        <div className="w-full md:w-80">
          <AdminSearchInput
            placeholder="Tìm theo tên, SĐT, Email..."
            onSearch={setSearchQuery}
          />
        </div>
      </div>

      {/* MOBILE CARD VIEW (< sm) */}
      <div className="block sm:hidden space-y-3">
        {filteredCustomers.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 border border-gray-200/80 text-center text-gray-500 shadow-2xs">
            <p className="font-bold text-sm text-gray-800">Không tìm thấy khách hàng nào phù hợp.</p>
          </div>
        ) : (
          filteredCustomers.map((c, idx) => (
            <div
              key={c.customerId}
              className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-2xs space-y-3"
            >
              <div className="flex items-start justify-between gap-2 pb-2 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] flex items-center justify-center">
                    {idx + 1}
                  </span>
                  <div>
                    <h4 className="font-bold text-gray-900 text-xs">{c.fullName}</h4>
                    <span className="font-mono text-[11px] text-[#16381D] font-bold block">{c.phone}</span>
                  </div>
                </div>
                {c.introducerInfo && c.introducerInfo !== "Trực tiếp" ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-900 font-bold text-[10px] shrink-0">
                    🌱 {c.introducerInfo}
                  </span>
                ) : (
                  <span className="text-gray-400 text-[10px] italic">Trực tiếp</span>
                )}
              </div>

              {c.email && (
                <div className="text-[11px] text-gray-600 flex items-center gap-1">
                  <span className="text-gray-400">✉️</span>
                  <span className="truncate">{c.email}</span>
                </div>
              )}

              {c.address && (
                <div className="text-[11px] text-gray-600 flex items-start gap-1">
                  <span className="text-gray-400 shrink-0 mt-0.5">📍</span>
                  <span className="line-clamp-2">{c.address}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-gray-100 bg-[#FFFDF9] -mx-4 -mb-4 p-3 rounded-b-2xl">
                <div>
                  <span className="text-[10px] text-gray-500 block">Số đơn đã đặt</span>
                  <span className="font-extrabold text-xs text-gray-900">{c.totalOrders} đơn</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-gray-500 block">Tổng tiền ủng hộ</span>
                  <MoneyDisplay amount={c.totalSpent} className="font-extrabold text-emerald-950 text-sm" />
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* DESKTOP TABLE VIEW (>= sm) */}
      <div className="hidden sm:block bg-white rounded-3xl border border-gray-200/80 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-left text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 font-semibold uppercase text-[10px]">
                <th className="py-2.5 px-3 w-12 text-center whitespace-nowrap">STT</th>
                <th className="py-2.5 px-4 whitespace-nowrap">Họ tên</th>
                <th className="py-2.5 px-4 whitespace-nowrap">Số điện thoại / Email</th>
                <th className="py-2.5 px-4 whitespace-nowrap">Người quen / Giới thiệu</th>
                <th className="py-2.5 px-4 whitespace-nowrap">Địa chỉ giao hàng</th>
                <th className="py-2.5 px-4 text-center whitespace-nowrap">Số đơn đã đặt</th>
                <th className="py-2.5 px-4 text-right whitespace-nowrap">Tổng tiền ủng hộ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-gray-400">
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
                    <td className="py-3.5 px-4">
                      {c.introducerInfo && c.introducerInfo !== "Trực tiếp" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-900 font-bold text-[11px]">
                          🌱 {c.introducerInfo}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs italic">
                          Tự đặt trực tiếp
                        </span>
                      )}
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
