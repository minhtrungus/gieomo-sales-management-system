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
} from "@/lib/data/orderStore";
import type { Order, Voucher } from "@/types/database";
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
  const [discountType, setDiscountType] = useState<"percentage" | "fixed_amount">("fixed_amount");
  const [discountValue, setDiscountValue] = useState<number>(20000);
  const [minOrderValue, setMinOrderValue] = useState<number>(150000);
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
      discount_value: discountValue,
      min_order_value: minOrderValue,
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
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo mã voucher (VD: GIEO10, WELCOME)..."
              className="w-full pl-9 pr-4 py-2 rounded-2xl border border-[#F0E5D8] text-xs font-mono uppercase focus:border-[#FFB98A] outline-none bg-[#FFFDF9]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
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

      {/* Vouchers Table */}
      <div className="bg-white rounded-3xl border border-[#F0E5D8] shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-[#FFF8EE] border-b border-[#F0E5D8] text-[#7E7068] font-bold uppercase tracking-wider">
                <th className="py-3.5 px-5">Mã Voucher</th>
                <th className="py-3.5 px-4">Loại giảm giá</th>
                <th className="py-3.5 px-4">Đơn tối thiểu</th>
                <th className="py-3.5 px-4">Lượt sử dụng &amp; Đơn áp dụng</th>
                <th className="py-3.5 px-4">Phân loại</th>
                <th className="py-3.5 px-4">Trạng thái</th>
                <th className="py-3.5 px-5 text-right">Thao tác</th>
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
                        <span className="px-2 py-0.5 rounded-lg bg-[#EAF7ED] border border-[#BFE9C3]">
                          {v.code}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-bold text-[#342A24]">
                        {v.discount_type === "percentage" ? (
                          <span className="text-[#E2884E]">Giảm {v.discount_value}%</span>
                        ) : (
                          <span className="text-[#2D6338]">
                            Giảm <MoneyDisplay amount={v.discount_value} />
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-[#7E7068]">
                        <MoneyDisplay amount={v.min_order_value} />
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-7 border border-[#F0E5D8] shadow-2xl space-y-5 animate-in zoom-in-95">
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
                    onChange={(e) => setDiscountType(e.target.value as "percentage" | "fixed_amount")}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] bg-white font-bold text-[#342A24]"
                  >
                    <option value="fixed_amount">Giảm cố định (VNĐ)</option>
                    <option value="percentage">Giảm theo phần trăm (%)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Mức giảm *</label>
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
                  <label className="font-bold text-[#342A24] block">Giới hạn số lượt dùng</label>
                  <input
                    type="number"
                    value={usageLimit}
                    onChange={(e) => setUsageLimit(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A]"
                  />
                </div>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-7 border border-[#F0E5D8] shadow-2xl space-y-5 animate-in zoom-in-95">
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
                  <label className="font-bold text-[#342A24] block">Mức giảm *</label>
                  <input
                    type="number"
                    required
                    value={editingVoucher.discount_value}
                    onChange={(e) => setEditingVoucher({ ...editingVoucher, discount_value: Number(e.target.value) })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Đơn tối thiểu</label>
                  <input
                    type="number"
                    value={editingVoucher.min_order_value}
                    onChange={(e) => setEditingVoucher({ ...editingVoucher, min_order_value: Number(e.target.value) })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A]"
                  />
                </div>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 border border-[#F0E5D8] shadow-2xl space-y-4 text-center animate-in zoom-in-95">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-2xl bg-white rounded-3xl p-6 sm:p-7 border border-[#F0E5D8] shadow-2xl space-y-5 animate-in zoom-in-95 max-h-[85vh] flex flex-col">
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
