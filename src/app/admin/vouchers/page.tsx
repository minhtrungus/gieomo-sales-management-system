"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { Badge } from "@/components/ui/Badge";
import { MOCK_VOUCHERS } from "@/lib/data/mockData";
import { getStoredOrders } from "@/lib/data/orderStore";
import type { Order } from "@/types/database";
import { Plus, Edit3, Trash2, X, Ticket, AlertTriangle, Filter, Eye, ShoppingBag, ArrowRight } from "lucide-react";

export default function AdminVouchersPage() {
  const [vouchers, setVouchers] = useState(MOCK_VOUCHERS);
  const [orders, setOrders] = useState<Order[]>([]);
  const [visibilityFilter, setVisibilityFilter] = useState<"all" | "public" | "private">("all");
  const [viewingOrdersVoucher, setViewingOrdersVoucher] = useState<(typeof MOCK_VOUCHERS)[0] | null>(null);

  useEffect(() => {
    setOrders(getStoredOrders());
    const handleUpdate = () => setOrders(getStoredOrders());
    window.addEventListener("gieomo_orders_updated", handleUpdate);
    return () => window.removeEventListener("gieomo_orders_updated", handleUpdate);
  }, []);

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingVoucher, setEditingVoucher] = useState<(typeof MOCK_VOUCHERS)[0] | null>(null);
  const [deletingVoucher, setDeletingVoucher] = useState<(typeof MOCK_VOUCHERS)[0] | null>(null);

  // Form states
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<"percentage" | "fixed_amount">("fixed_amount");
  const [discountValue, setDiscountValue] = useState<number>(20000);
  const [minOrderValue, setMinOrderValue] = useState<number>(150000);
  const [usageLimit, setUsageLimit] = useState<number>(50);
  const [visibility, setVisibility] = useState<"public" | "private">("public");

  const filteredVouchers = vouchers.filter((v) => {
    if (visibilityFilter === "all") return true;
    return (v as any).visibility === visibilityFilter;
  });

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

    const newVoucher = {
      voucher_id: `vouch-${Date.now()}`,
      code: code.toUpperCase().trim(),
      discount_type: discountType,
      discount_value: discountValue,
      min_order_value: minOrderValue,
      max_discount_amount: null,
      usage_limit: usageLimit,
      usage_count: 0,
      visibility: visibility,
      status: "active" as const,
      start_date: new Date().toISOString(),
      end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setVouchers([newVoucher, ...vouchers]);
    setIsAddModalOpen(false);
    setCode("");
  };

  // Save Edit Voucher
  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVoucher) return;

    setVouchers((prev) =>
      prev.map((v) => (v.voucher_id === editingVoucher.voucher_id ? editingVoucher : v))
    );
    setEditingVoucher(null);
  };

  // Confirm Delete
  const handleConfirmDelete = () => {
    if (!deletingVoucher) return;
    setVouchers((prev) => prev.filter((v) => v.voucher_id !== deletingVoucher.voucher_id));
    setDeletingVoucher(null);
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

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 bg-white p-2 rounded-2xl border border-[#F0E5D8] w-fit shadow-2xs">
        <Filter className="w-3.5 h-3.5 text-gray-400 ml-2" />
        <span className="text-[11px] font-bold text-gray-500 mr-1">Hiển thị:</span>
        {[
          { key: "all", label: "Tất cả" },
          { key: "public", label: "🌐 Công khai (Public)" },
          { key: "private", label: "🔒 Riêng tư (Private)" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setVisibilityFilter(tab.key as any)}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
              visibilityFilter === tab.key
                ? "bg-[#2D6338] text-white shadow-2xs"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
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
              {filteredVouchers.map((v) => {
                const voucherOrders = getOrdersForVoucher(v.code);
                const actualCount = voucherOrders.length > 0 ? voucherOrders.length : (v.usage_count ?? 0);

                return (
                  <tr key={v.voucher_id} className="hover:bg-[#FFFDF9] transition-colors">
                    <td className="py-3.5 px-5 font-mono font-extrabold text-[#2D6338] text-sm">
                      {v.code}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-[#342A24]">
                      {v.discount_type === "percentage" ? (
                        <span className="text-[#E2884E]">Giảm {v.discount_value}%</span>
                      ) : (
                        <span className="text-[#2D6338]">Giảm <MoneyDisplay amount={v.discount_value} /></span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-[#7E7068]">
                      <MoneyDisplay amount={v.min_order_value} />
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className="text-[#342A24] font-bold">
                          {actualCount} / {v.usage_limit ?? 100} lượt
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
                      {(v as any).visibility === "private" ? (
                        <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-[10.5px] font-bold border border-gray-200">
                          🔒 Riêng tư
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-[#EAF7ED] text-[#16381D] text-[10.5px] font-bold border border-[#BFE9C3]">
                          🌐 Công khai
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <Badge variant="brand">Hoạt động</Badge>
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
              })}
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

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-xs shadow-xs border border-[#9ed4a3]"
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

              <div className="space-y-1">
                <label className="font-bold text-[#342A24] block">Phân loại hiển thị</label>
                <select
                  value={(editingVoucher as any).visibility || "public"}
                  onChange={(e) => setEditingVoucher({ ...editingVoucher, visibility: e.target.value as any })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] bg-white font-bold"
                >
                  <option value="public">🌐 Công khai (Hiển thị gợi ý tại Giỏ hàng &amp; Checkout)</option>
                  <option value="private">🔒 Riêng tư (Chỉ áp dụng khi khách nhập đúng mã)</option>
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditingVoucher(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-xs shadow-xs border border-[#9ed4a3]"
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
                className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-xs"
              >
                Đồng ý xóa ➔
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DANH SÁCH ĐƠN HÀNG SỬ DỤNG VOUCHER */}
      {viewingOrdersVoucher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-3xl bg-white rounded-3xl border border-[#F0E5D8] shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[85vh]">
            <div className="p-5 bg-[#FFF8EE] border-b border-[#F0E5D8] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#BFE9C3] flex items-center justify-center text-[#16381D] font-mono font-bold text-sm">
                  🎟️
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-heading font-extrabold text-lg text-[#231B16]">
                      Đơn hàng áp dụng mã:
                    </h3>
                    <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-full bg-white text-[#2D6338] border border-[#9ed4a3]">
                      {viewingOrdersVoucher.code}
                    </span>
                  </div>
                  <p className="text-xs text-[#7E7068] mt-0.5">
                    {viewingOrdersVoucher.discount_type === "percentage"
                      ? `Giảm ${viewingOrdersVoucher.discount_value}%`
                      : `Giảm ${viewingOrdersVoucher.discount_value.toLocaleString("vi-VN")}đ`}{" "}
                    • Đơn tối thiểu: {viewingOrdersVoucher.min_order_value.toLocaleString("vi-VN")}đ
                  </p>
                </div>
              </div>

              <button
                onClick={() => setViewingOrdersVoucher(null)}
                className="p-1.5 rounded-full hover:bg-white text-gray-400 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 space-y-3">
              {(() => {
                const voucherOrders = getOrdersForVoucher(viewingOrdersVoucher.code);
                if (voucherOrders.length === 0) {
                  return (
                    <div className="text-center py-12 text-gray-400 text-xs">
                      Chưa có đơn hàng nào ghi nhận mã giảm giá này trong hệ thống.
                    </div>
                  );
                }

                const totalSaved = voucherOrders.reduce((sum, o) => sum + (o.discount_amount || 0), 0);

                return (
                  <>
                    <div className="p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-100 flex items-center justify-between text-xs mb-3">
                      <span className="text-emerald-950 font-bold">
                        Đã áp dụng cho {voucherOrders.length} đơn hàng
                      </span>
                      <span className="text-emerald-800 font-bold">
                        Tổng tiền đã giảm: {totalSaved.toLocaleString("vi-VN")}đ
                      </span>
                    </div>

                    <div className="divide-y divide-[#F0E5D8] border border-[#F0E5D8] rounded-2xl overflow-hidden">
                      {voucherOrders.map((ord) => (
                        <div
                          key={ord.order_id}
                          className="p-3.5 hover:bg-[#FFFDF9] flex items-center justify-between gap-3 text-xs transition-colors"
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-[#1B3622]">
                                #{ord.order_code}
                              </span>
                              <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-[10px] font-medium">
                                {new Date(ord.created_at).toLocaleDateString("vi-VN")}
                              </span>
                            </div>
                            <p className="text-gray-600 text-[11.5px]">
                              {ord.buyer_name} ({ord.buyer_phone})
                            </p>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <span className="font-bold text-[#1B3622] block">
                                {ord.final_amount.toLocaleString("vi-VN")}đ
                              </span>
                              {ord.discount_amount ? (
                                <span className="text-[10.5px] text-[#2D6338]">
                                  Đã giảm -{ord.discount_amount.toLocaleString("vi-VN")}đ
                                </span>
                              ) : null}
                            </div>

                            <Link
                              href={`/admin/orders/${ord.order_id}`}
                              className="px-2.5 py-1.5 rounded-xl bg-soft-green/60 hover:bg-soft-green text-[#16381D] font-bold text-xs inline-flex items-center gap-1 transition-colors"
                            >
                              <span>Chi tiết</span>
                              <ArrowRight className="w-3 h-3" />
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
