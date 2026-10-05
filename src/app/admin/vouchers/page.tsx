"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { Badge } from "@/components/ui/Badge";
import {
  getStoredOrders,
  getStoredVouchers,
  saveNewVoucher,
  updateStoredVoucher,
  deleteStoredVoucher,
  syncVouchersFromServer,
  syncOrdersFromServer,
} from "@/lib/data/orderStore";
import type { Order, Voucher } from "@/types/database";
import { AdminSearchInput } from "@/components/admin/AdminSearchInput";
import {
  Plus,
  Edit3,
  Trash2,
  X,
  Ticket,
  AlertTriangle,
  Filter,
  Eye,
  ShoppingBag,
  ArrowRight,
  Search,
  CheckCircle2,
  Power,
} from "lucide-react";

export default function AdminVouchersPage() {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [visibilityFilter, setVisibilityFilter] = useState<"all" | "public" | "private">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewingOrdersVoucher, setViewingOrdersVoucher] = useState<Voucher | null>(null);

  useEffect(() => {
    syncVouchersFromServer(true);
    syncOrdersFromServer(true);
    setVouchers(getStoredVouchers());
    setOrders(getStoredOrders());

    const handleVouchersUpdate = () => setVouchers(getStoredVouchers());
    const handleOrdersUpdate = () => setOrders(getStoredOrders());

    window.addEventListener("gieomo_vouchers_updated", handleVouchersUpdate);
    window.addEventListener("gieomo_orders_updated", handleOrdersUpdate);

    return () => {
      window.removeEventListener("gieomo_vouchers_updated", handleVouchersUpdate);
      window.removeEventListener("gieomo_orders_updated", handleOrdersUpdate);
    };
  }, []);

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingVoucher, setEditingVoucher] = useState<Voucher | null>(null);
  const [deletingVoucher, setDeletingVoucher] = useState<Voucher | null>(null);

  // Form states
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<"percentage" | "fixed_amount" | "freeship">("fixed_amount");
  const [discountValue, setDiscountValue] = useState<number>(20000);
  const [minOrderValue, setMinOrderValue] = useState<number>(150000);
  const [minItemsCount, setMinItemsCount] = useState<number>(0);
  const [isGiftVoucher, setIsGiftVoucher] = useState<boolean>(false);
  const [giftMinOrderValue, setGiftMinOrderValue] = useState<number>(150000);
  const [usageLimit, setUsageLimit] = useState<number>(50);
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [status, setStatus] = useState<"active" | "inactive">("active");

  const filteredVouchers = useMemo(() => {
    return vouchers.filter((v) => {
      // Visibility Filter
      const actualVis = v.visibility || "public";
      if (visibilityFilter !== "all" && actualVis !== visibilityFilter) {
        return false;
      }
      // Status Filter
      if (statusFilter !== "all" && v.status !== statusFilter) {
        return false;
      }
      // Search Filter
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        if (!v.code.toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [vouchers, visibilityFilter, statusFilter, searchQuery]);

  // Counts for filter pills
  const counts = useMemo(() => {
    const total = vouchers.length;
    const publicCount = vouchers.filter((v) => (v.visibility || "public") === "public").length;
    const privateCount = vouchers.filter((v) => (v.visibility || "public") === "private").length;
    const activeCount = vouchers.filter((v) => v.status === "active").length;
    const inactiveCount = vouchers.filter((v) => v.status !== "active").length;
    return { total, publicCount, privateCount, activeCount, inactiveCount };
  }, [vouchers]);

  // Get orders that used a specific voucher code
  const getOrdersForVoucher = (voucherCode: string) => {
    return orders.filter(
      (o) => (o.voucher_code || "").trim().toUpperCase() === voucherCode.trim().toUpperCase()
    );
  };

  // Add Voucher
  const handleCreateVoucher = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code) return;

    const newVoucher: Voucher = {
      voucher_id: `vouch-${Date.now()}`,
      code: code.toUpperCase().trim(),
      discount_type: discountType,
      discount_value: discountType === "freeship" ? 15000 : discountValue,
      min_order_value: minOrderValue,
      min_items_count: minItemsCount,
      is_gift_voucher: isGiftVoucher,
      gift_min_order_value: isGiftVoucher ? giftMinOrderValue : 0,
      usage_limit: usageLimit,
      usage_count: 0,
      times_used: 0,
      visibility: visibility,
      status: status,
      start_date: new Date().toISOString(),
      end_date: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
    };

    saveNewVoucher(newVoucher);
    setVouchers(getStoredVouchers());
    setIsAddModalOpen(false);
    setCode("");
    setMinItemsCount(0);
    setIsGiftVoucher(false);
  };

  // Save Edit Voucher
  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVoucher) return;

    updateStoredVoucher({
      ...editingVoucher,
      code: editingVoucher.code.toUpperCase().trim(),
      visibility: editingVoucher.visibility || "public",
    });
    setVouchers(getStoredVouchers());
    setEditingVoucher(null);
  };

  // Confirm Delete
  const handleConfirmDelete = () => {
    if (!deletingVoucher) return;
    deleteStoredVoucher(deletingVoucher.voucher_id);
    setVouchers(getStoredVouchers());
    setDeletingVoucher(null);
  };

  // Quick Toggle Status
  const handleToggleStatus = (v: Voucher) => {
    const updated: Voucher = {
      ...v,
      status: v.status === "active" ? "inactive" : "active",
      visibility: v.visibility || "public",
    };
    updateStoredVoucher(updated);
    setVouchers(getStoredVouchers());
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-[#231B16]">
            Quản lý mã giảm giá (Vouchers)
          </h1>
          <p className="text-xs text-[#7E7068] mt-0.5">
            Tạo và cấu hình các chương trình ưu đãi, phân loại Công khai / Riêng tư và theo dõi đơn sử dụng.
          </p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="px-5 py-2.5 rounded-full bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-xs flex items-center gap-2 shadow-xs transition-all border border-[#9ed4a3] active:scale-95 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Tạo Voucher mới</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 sm:p-4 rounded-3xl border border-[#F0E5D8] shadow-soft space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="flex-1 max-w-md">
            <AdminSearchInput
              placeholder="Tìm theo mã voucher (VD: GIEO10, WELCOME)..."
              onSearch={setSearchQuery}
            />
          </div>

          {/* Visibility Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            <span className="text-[11px] font-bold text-gray-400 mr-1 whitespace-nowrap">Hiển thị:</span>
            {[
              { key: "all", label: `Tất cả (${counts.total})` },
              { key: "public", label: `🌐 Công khai (${counts.publicCount})` },
              { key: "private", label: `🔒 Riêng tư (${counts.privateCount})` },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setVisibilityFilter(tab.key as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  visibilityFilter === tab.key
                    ? "bg-[#2D6338] text-white shadow-2xs"
                    : "text-gray-600 hover:bg-gray-100 border border-gray-200/50"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            <span className="text-[11px] font-bold text-gray-400 mr-1 whitespace-nowrap">Trạng thái:</span>
            {[
              { key: "all", label: `Tất cả` },
              { key: "active", label: `Đang chạy (${counts.activeCount})` },
              { key: "inactive", label: `Tạm dừng (${counts.inactiveCount})` },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  statusFilter === tab.key
                    ? "bg-[#E2884E] text-white shadow-2xs"
                    : "text-gray-600 hover:bg-gray-100 border border-gray-200/50"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* MOBILE CARD VIEW (< sm) */}
      <div className="block sm:hidden space-y-3">
        {filteredVouchers.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 border border-[#F0E5D8] text-center text-gray-500 shadow-soft">
            <Ticket className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="font-bold text-sm">Không tìm thấy mã giảm giá nào phù hợp bộ lọc.</p>
          </div>
        ) : (
          filteredVouchers.map((v) => {
            const voucherOrders = getOrdersForVoucher(v.code);
            const actualCount = voucherOrders.length > 0 ? voucherOrders.length : (v.usage_count ?? 0);
            const isPublic = (v.visibility || "public") === "public";
            const isActive = v.status === "active";

            return (
              <div
                key={v.voucher_id}
                className="bg-white rounded-2xl p-4 border border-[#F0E5D8] shadow-soft space-y-3"
              >
                <div className="flex items-start justify-between gap-2 pb-2 border-b border-gray-100">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono font-extrabold text-[#2D6338] text-sm bg-[#EAF7ED] px-2.5 py-0.5 rounded-lg border border-[#BFE9C3]">
                        {v.code}
                      </span>
                      {v.is_gift_voucher && (
                        <span className="px-1.5 py-0.5 rounded-md bg-purple-100 text-purple-800 text-[10px] font-bold">
                          🎁 Quà tặng
                        </span>
                      )}
                    </div>
                    <div className="font-bold text-xs text-[#342A24]">
                      {v.discount_type === "percentage" ? (
                        <span className="text-[#E2884E]">Giảm {v.discount_value}%</span>
                      ) : v.discount_type === "freeship" ? (
                        <span className="text-emerald-700">🚚 Miễn phí vận chuyển (Freeship)</span>
                      ) : (
                        <span className="text-[#2D6338]">
                          Giảm <MoneyDisplay amount={v.discount_value} />
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleToggleStatus(v)}
                    className={`px-2.5 py-1 rounded-full text-[10.5px] font-bold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                      isActive
                        ? "bg-[#BFE9C3] text-[#16381D]"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-emerald-600" : "bg-gray-400"}`} />
                    <span>{isActive ? "Đang chạy" : "Tạm dừng"}</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                  <div>
                    <span className="text-[10px] text-gray-400 block">Đơn tối thiểu:</span>
                    <span className="font-bold text-gray-800">
                      {v.min_order_value ? `${v.min_order_value.toLocaleString("vi-VN")}đ` : "0đ"}
                    </span>
                    {Boolean(v.min_items_count && v.min_items_count > 0) && (
                      <span className="text-[10px] text-amber-800 font-bold block">
                        Tối thiểu {v.min_items_count} món
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 block">Lượt đã dùng:</span>
                    <span className="font-bold text-gray-800">
                      {actualCount} / {v.usage_limit ?? "∞"} lượt
                    </span>
                    <span className="text-[10px] text-gray-500 block">
                      {isPublic ? "🌐 Công khai" : "🔒 Riêng tư"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                  {voucherOrders.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setViewingOrdersVoucher(v)}
                      className="px-2.5 py-1 rounded-xl bg-emerald-50 text-[#16381D] font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer border border-emerald-200"
                    >
                      <Eye className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Xem {voucherOrders.length} đơn</span>
                    </button>
                  ) : (
                    <span className="text-[11px] text-gray-400 italic">Chưa có đơn áp dụng</span>
                  )}

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setEditingVoucher(v)}
                      className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-600 cursor-pointer"
                      title="Sửa"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingVoucher(v)}
                      className="p-1.5 rounded-xl hover:bg-red-50 text-red-500 cursor-pointer"
                      title="Xóa"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* DESKTOP TABLE VIEW (>= sm) */}
      <div className="hidden sm:block bg-white rounded-3xl border border-[#F0E5D8] shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-left text-xs">
            <thead>
              <tr className="bg-[#FFF8EE] border-b border-[#F0E5D8] text-[#7E7068] font-bold uppercase tracking-wider text-[10px]">
                <th className="py-2.5 px-4 whitespace-nowrap">Mã Voucher</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Loại giảm giá</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Đơn tối thiểu</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Lượt dùng &amp; Đơn áp dụng</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Phân loại</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Trạng thái</th>
                <th className="py-2.5 px-4 text-right whitespace-nowrap">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0E5D8]">
              {filteredVouchers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-500">
                    <Ticket className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="font-bold text-sm">Không tìm thấy mã giảm giá nào phù hợp bộ lọc.</p>
                    <p className="text-xs text-gray-400 mt-1">Thử chọn bộ lọc &quot;Tất cả&quot; hoặc xóa từ khóa tìm kiếm.</p>
                  </td>
                </tr>
              ) : (
                filteredVouchers.map((v) => {
                  const voucherOrders = getOrdersForVoucher(v.code);
                  const actualCount = voucherOrders.length > 0 ? voucherOrders.length : (v.usage_count ?? 0);
                  const isPublic = (v.visibility || "public") === "public";
                  const isActive = v.status === "active";

                  return (
                    <tr key={v.voucher_id} className="hover:bg-[#FFFDF9] transition-colors">
                      <td className="py-3.5 px-5 font-mono font-extrabold text-[#2D6338] text-sm">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="px-2 py-0.5 rounded-lg bg-[#EAF7ED] border border-[#BFE9C3]">
                            {v.code}
                          </span>
                          {v.is_gift_voucher && (
                            <span className="px-1.5 py-0.5 rounded-md bg-purple-100 text-purple-800 text-[10px] font-bold">
                              🎁 Tặng cuối đơn
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-bold text-[#342A24]">
                        {v.discount_type === "percentage" ? (
                          <span className="text-[#E2884E]">Giảm {v.discount_value}%</span>
                        ) : v.discount_type === "freeship" ? (
                          <span className="text-emerald-700 font-extrabold">🚚 Miễn phí vận chuyển (Freeship)</span>
                        ) : (
                          <span className="text-[#2D6338]">
                            Giảm <MoneyDisplay amount={v.discount_value} />
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-[#7E7068]">
                        <div className="space-y-0.5">
                          <div>Đơn từ: <MoneyDisplay amount={v.min_order_value || 0} /></div>
                          {Boolean(v.min_items_count && v.min_items_count > 0) && (
                            <div className="text-[10.5px] text-amber-800 font-bold">
                              📦 Tối thiểu {v.min_items_count} món
                            </div>
                          )}
                          {Boolean(v.is_gift_voucher && v.gift_min_order_value) && (
                            <div className="text-[10px] text-purple-700">
                              Tặng cho đơn từ <MoneyDisplay amount={v.gift_min_order_value || 0} />
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="text-[#342A24] font-bold">
                            {actualCount} / {v.usage_limit ?? "∞"} lượt
                          </span>
                          {voucherOrders.length > 0 ? (
                            <button
                              onClick={() => setViewingOrdersVoucher(v)}
                              className="px-2 py-0.5 rounded-lg bg-[#BFE9C3]/50 hover:bg-[#BFE9C3] text-[#16381D] font-bold text-[10.5px] inline-flex items-center gap-1 cursor-pointer transition-colors"
                              title="Xem các đơn hàng dùng mã này"
                            >
                              <Eye className="w-3 h-3 text-[#2D6338]" />
                              <span>{voucherOrders.length} đơn</span>
                            </button>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        {isPublic ? (
                          <span className="px-2 py-0.5 rounded-full bg-[#EAF7ED] text-[#16381D] text-[10.5px] font-bold border border-[#BFE9C3]">
                            🌐 Công khai
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-[10.5px] font-bold border border-gray-200">
                            🔒 Riêng tư
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <button
                          onClick={() => handleToggleStatus(v)}
                          className={`px-2.5 py-1 rounded-full text-[10.5px] font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                            isActive
                              ? "bg-[#BFE9C3] text-[#16381D] hover:bg-[#aee0b3]"
                              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                          }`}
                          title="Bấm để bật / tắt voucher"
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-emerald-600" : "bg-gray-400"}`} />
                          <span>{isActive ? "Đang áp dụng" : "Đã tạm dừng"}</span>
                        </button>
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {voucherOrders.length > 0 && (
                            <button
                              onClick={() => setViewingOrdersVoucher(v)}
                              className="p-1.5 rounded-xl text-[#2D6338] hover:bg-[#BFE9C3]/40 transition-colors cursor-pointer"
                              title="Xem đơn hàng áp dụng"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => setEditingVoucher(v)}
                            className="p-1.5 rounded-xl text-[#7E7068] hover:text-[#2D6338] hover:bg-[#BFE9C3]/30 transition-colors cursor-pointer"
                            title="Sửa Voucher"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeletingVoucher(v)}
                            className="p-1.5 rounded-xl text-[#7E7068] hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                            title="Xóa Voucher"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: THÊM VOUCHER MỚI */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 animate-in fade-in" style={{ willChange: "opacity" }}>
          <div
            className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-7 border border-[#F0E5D8] shadow-2xl space-y-5 animate-in zoom-in-95 duration-200"
            style={{ willChange: "transform, opacity", transform: "translateZ(0)" }}
          >
            <div className="flex items-center justify-between border-b border-[#F0E5D8] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#BFE9C3] flex items-center justify-center text-[#16381D]">
                  <Ticket className="w-4 h-4" />
                </div>
                <h3 className="font-heading font-extrabold text-lg text-[#231B16]">
                  Tạo Voucher mới
                </h3>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateVoucher} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-[#342A24] block">Mã Voucher (Code) *</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: GIEO20K, MAMMO10"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] font-mono font-bold uppercase"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Hình thức giảm *</label>
                  <select
                    value={discountType}
                    onChange={(e) => {
                      const dt = e.target.value as "percentage" | "fixed_amount" | "freeship";
                      setDiscountType(dt);
                      if (dt === "freeship") setDiscountValue(15000);
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] bg-white font-bold text-[#342A24]"
                  >
                    <option value="fixed_amount">Giảm cố định (VNĐ)</option>
                    <option value="percentage">Giảm theo phần trăm (%)</option>
                    <option value="freeship">🚚 Miễn phí vận chuyển (Freeship)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">
                    {discountType === "freeship" ? "Giá trị Freeship (VNĐ)" : discountType === "percentage" ? "Mức giảm (%) *" : "Mức giảm (VNĐ) *"}
                  </label>
                  <input
                    type="number"
                    required
                    value={discountValue}
                    onChange={(e) => setDiscountValue(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Đơn tối thiểu (VNĐ)</label>
                  <input
                    type="number"
                    value={minOrderValue}
                    onChange={(e) => setMinOrderValue(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Số món tối thiểu (món)</label>
                  <input
                    type="number"
                    placeholder="0 (không yêu cầu)"
                    value={minItemsCount}
                    onChange={(e) => setMinItemsCount(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A]"
                  />
                </div>
              </div>

              {/* Gift Voucher Option */}
              <div className="p-3 rounded-2xl bg-purple-50/70 border border-purple-200 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isGiftVoucher}
                    onChange={(e) => setIsGiftVoucher(e.target.checked)}
                    className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-purple-950">
                    🎁 Làm Voucher Quà Tặng sau khi khách thanh toán thành công
                  </span>
                </label>
                {isGiftVoucher && (
                  <div className="pt-1 space-y-1">
                    <label className="text-[11px] font-bold text-purple-900 block">
                      Đơn hàng đạt từ bao nhiêu tiền thì được tặng voucher này? (VNĐ)
                    </label>
                    <input
                      type="number"
                      value={giftMinOrderValue}
                      onChange={(e) => setGiftMinOrderValue(Number(e.target.value))}
                      className="w-full px-3 py-1.5 rounded-xl border border-purple-300 text-xs font-bold bg-white outline-none"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Phân loại hiển thị</label>
                  <select
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value as "public" | "private")}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] bg-white font-bold"
                  >
                    <option value="public">🌐 Công khai (Gợi ý cho khách)</option>
                    <option value="private">🔒 Riêng tư (Nhập tay mới dùng được)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Trạng thái khởi tạo</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as "active" | "inactive")}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] bg-white font-bold"
                  >
                    <option value="active">✓ Đang áp dụng</option>
                    <option value="inactive">⏸ Tạm dừng</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-xs shadow-xs border border-[#9ed4a3] cursor-pointer"
                >
                  Tạo Voucher ➔
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SỬA VOUCHER */}
      {editingVoucher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 animate-in fade-in" style={{ willChange: "opacity" }}>
          <div
            className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-7 border border-[#F0E5D8] shadow-2xl space-y-5 animate-in zoom-in-95 duration-200"
            style={{ willChange: "transform, opacity", transform: "translateZ(0)" }}
          >
            <div className="flex items-center justify-between border-b border-[#F0E5D8] pb-3">
              <h3 className="font-heading font-extrabold text-lg text-[#231B16]">
                Chỉnh sửa Voucher
              </h3>
              <button
                onClick={() => setEditingVoucher(null)}
                className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-[#342A24] block">Mã Voucher *</label>
                <input
                  type="text"
                  required
                  value={editingVoucher.code}
                  onChange={(e) => setEditingVoucher({ ...editingVoucher, code: e.target.value.toUpperCase() })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] font-mono font-bold uppercase"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Hình thức giảm *</label>
                  <select
                    value={editingVoucher.discount_type || "fixed_amount"}
                    onChange={(e) => {
                      const dt = e.target.value as "percentage" | "fixed_amount" | "freeship";
                      setEditingVoucher({
                        ...editingVoucher,
                        discount_type: dt,
                        discount_value: dt === "freeship" ? 15000 : editingVoucher.discount_value,
                      });
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] bg-white font-bold text-[#342A24]"
                  >
                    <option value="fixed_amount">Giảm cố định (VNĐ)</option>
                    <option value="percentage">Giảm theo phần trăm (%)</option>
                    <option value="freeship">🚚 Miễn phí vận chuyển (Freeship)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Mức giảm *</label>
                  <input
                    type="number"
                    required
                    value={editingVoucher.discount_value}
                    onChange={(e) => setEditingVoucher({ ...editingVoucher, discount_value: Number(e.target.value) })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Đơn tối thiểu (VNĐ)</label>
                  <input
                    type="number"
                    value={editingVoucher.min_order_value}
                    onChange={(e) => setEditingVoucher({ ...editingVoucher, min_order_value: Number(e.target.value) })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Số món tối thiểu (món)</label>
                  <input
                    type="number"
                    value={editingVoucher.min_items_count ?? 0}
                    onChange={(e) => setEditingVoucher({ ...editingVoucher, min_items_count: Number(e.target.value) })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A]"
                  />
                </div>
              </div>

              {/* Gift Voucher Option */}
              <div className="p-3 rounded-2xl bg-purple-50/70 border border-purple-200 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(editingVoucher.is_gift_voucher)}
                    onChange={(e) => setEditingVoucher({ ...editingVoucher, is_gift_voucher: e.target.checked })}
                    className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-purple-950">
                    🎁 Làm Voucher Quà Tặng sau khi khách thanh toán thành công
                  </span>
                </label>
                {editingVoucher.is_gift_voucher && (
                  <div className="pt-1 space-y-1">
                    <label className="text-[11px] font-bold text-purple-900 block">
                      Đơn hàng đạt từ bao nhiêu tiền thì được tặng voucher này? (VNĐ)
                    </label>
                    <input
                      type="number"
                      value={editingVoucher.gift_min_order_value ?? 150000}
                      onChange={(e) => setEditingVoucher({ ...editingVoucher, gift_min_order_value: Number(e.target.value) })}
                      className="w-full px-3 py-1.5 rounded-xl border border-purple-300 text-xs font-bold bg-white outline-none"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Phân loại hiển thị</label>
                  <select
                    value={editingVoucher.visibility || "public"}
                    onChange={(e) => setEditingVoucher({ ...editingVoucher, visibility: e.target.value as any })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] bg-white font-bold"
                  >
                    <option value="public">🌐 Công khai</option>
                    <option value="private">🔒 Riêng tư</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Trạng thái</label>
                  <select
                    value={editingVoucher.status}
                    onChange={(e) => setEditingVoucher({ ...editingVoucher, status: e.target.value as any })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] bg-white font-bold"
                  >
                    <option value="active">✓ Đang áp dụng</option>
                    <option value="inactive">⏸ Tạm dừng</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditingVoucher(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-xs shadow-xs border border-[#9ed4a3] cursor-pointer"
                >
                  Lưu thay đổi ➔
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: XÓA VOUCHER */}
      {deletingVoucher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 animate-in fade-in" style={{ willChange: "opacity" }}>
          <div
            className="w-full max-w-sm bg-white rounded-3xl p-6 border border-[#F0E5D8] shadow-2xl space-y-4 text-center animate-in zoom-in-95 duration-200"
            style={{ willChange: "transform, opacity", transform: "translateZ(0)" }}
          >
            <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="font-heading font-extrabold text-lg text-[#231B16]">
              Xác nhận xóa Voucher?
            </h3>
            <p className="text-xs text-[#7E7068] leading-relaxed">
              Bạn có chắc muốn xóa mã <strong>&quot;{deletingVoucher.code}&quot;</strong>? Khách hàng sẽ không thể áp dụng mã này khi thanh toán nữa.
            </p>

            <div className="flex items-center justify-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeletingVoucher(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-xs cursor-pointer"
              >
                Xóa vĩnh viễn
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: XEM ĐƠN HÀNG DÙNG MÃ NÀY */}
      {viewingOrdersVoucher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 animate-in fade-in" style={{ willChange: "opacity" }}>
          <div
            className="w-full max-w-2xl bg-white rounded-3xl p-6 sm:p-7 border border-[#F0E5D8] shadow-2xl space-y-5 animate-in zoom-in-95 duration-200 max-h-[85vh] flex flex-col"
            style={{ willChange: "transform, opacity", transform: "translateZ(0)" }}
          >
            <div className="flex items-center justify-between border-b border-[#F0E5D8] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-2xl bg-[#EAF7ED] flex items-center justify-center text-[#2D6338]">
                  <ShoppingBag className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-heading font-extrabold text-base text-[#231B16] flex items-center gap-2">
                    <span>Đơn hàng áp dụng mã</span>
                    <span className="px-2 py-0.5 rounded-lg bg-[#BFE9C3] text-[#16381D] font-mono text-xs">
                      {viewingOrdersVoucher.code}
                    </span>
                  </h3>
                  <p className="text-[11px] text-[#7E7068]">
                    Tổng cộng {getOrdersForVoucher(viewingOrdersVoucher.code).length} đơn hàng đã sử dụng mã này
                  </p>
                </div>
              </div>
              <button
                onClick={() => setViewingOrdersVoucher(null)}
                className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 divide-y divide-[#F0E5D8] pr-1">
              {getOrdersForVoucher(viewingOrdersVoucher.code).map((ord) => (
                <div key={ord.order_id} className="py-3 flex items-center justify-between gap-4 hover:bg-[#FFFDF9] px-2 rounded-xl transition-colors">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs text-[#2D6338]">
                        #{ord.order_code}
                      </span>
                      <span className="text-xs text-[#231B16] font-semibold">
                        {ord.receiver_name || ord.buyer_name}
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-400 mt-0.5">
                      {ord.receiver_phone || ord.buyer_phone} • {ord.province || ord.district || "Giao tận nơi"}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-xs font-bold text-[#231B16]">
                        <MoneyDisplay amount={ord.final_amount} />
                      </div>
                      <div className="text-[10px] text-emerald-600 font-semibold">
                        -Giảm <MoneyDisplay amount={ord.voucher_discount || ord.discount_amount || 0} />
                      </div>
                    </div>

                    <Link
                      href={`/admin/orders/${ord.order_code}`}
                      className="p-1.5 rounded-xl bg-gray-100 hover:bg-[#BFE9C3]/50 text-gray-600 hover:text-[#16381D] transition-colors"
                      title="Xem chi tiết đơn"
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-[#F0E5D8] flex items-center justify-end">
              <button
                onClick={() => setViewingOrdersVoucher(null)}
                className="px-5 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
