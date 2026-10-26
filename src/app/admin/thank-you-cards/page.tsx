"use client";

import { useEffect, useMemo, useState } from "react";
import { Printer, Search } from "lucide-react";
import { AdminOrderThankYouCardDialog } from "@/components/admin/AdminOrderThankYouCardDialog";
import { getStoredOrders, syncOrdersFromServer } from "@/lib/data/orderStore";
import type { Order } from "@/types/database";

export default function AdminThankYouCardsPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [query, setQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  useEffect(() => {
    const load = () => setOrders(getStoredOrders());
    load();
    void syncOrdersFromServer(true);
    window.addEventListener("gieomo_orders_updated", load);
    return () => window.removeEventListener("gieomo_orders_updated", load);
  }, []);

  const filteredOrders = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("vi");
    if (!normalized) return orders;
    return orders.filter((order) =>
      [order.order_code, order.buyer_name, order.buyer_phone]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("vi").includes(normalized)),
    );
  }, [orders, query]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-extrabold text-[#231B16]">Xem / in lại thiệp cảm ơn</h1>
        <p className="mt-1 text-xs text-[#7E7068]">Tìm đúng đơn rồi mở xem trước. Thiệp chỉ được tạo khi bạn yêu cầu.</p>
      </div>

      <label className="relative block max-w-xl">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <span className="sr-only">Tìm đơn để in thiệp</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Mã đơn, tên hoặc số điện thoại" className="w-full rounded-2xl border border-[#F0E5D8] bg-white py-3 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-[#BFE9C3]" />
      </label>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filteredOrders.map((order) => (
          <article key={order.order_id} className="rounded-2xl border border-[#F0E5D8] bg-white p-4 shadow-xs">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-xs font-extrabold text-[#1B3622]">{order.order_code}</p>
                <p className="mt-1 truncate text-sm font-bold text-[#231B16]">{order.buyer_name || "Chưa có tên người đặt"}</p>
                <p className="text-xs text-[#7E7068]">{order.buyer_phone || "Không có số điện thoại"}</p>
              </div>
              <button type="button" onClick={() => setSelectedOrder(order)} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#BFE9C3] px-3 py-2 text-xs font-extrabold text-[#16381D]">
                <Printer className="h-3.5 w-3.5" /> Xem / In
              </button>
            </div>
          </article>
        ))}
      </div>

      {filteredOrders.length === 0 && <p className="rounded-2xl border border-[#F0E5D8] bg-white p-8 text-center text-sm text-gray-500">Không tìm thấy đơn phù hợp.</p>}
      {selectedOrder && <AdminOrderThankYouCardDialog order={selectedOrder} onClose={() => setSelectedOrder(null)} />}
    </div>
  );
}
