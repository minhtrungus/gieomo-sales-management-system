"use client";

import { useState } from "react";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { Badge } from "@/components/ui/Badge";
import { MOCK_VOUCHERS } from "@/lib/data/mockData";
import { Plus, Edit3, Trash2, X, Ticket, AlertTriangle } from "lucide-react";

export default function AdminVouchersPage() {
  const [vouchers, setVouchers] = useState(MOCK_VOUCHERS);

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
            Tạo và cấu hình các chương trình ưu đãi, giảm giá tiền mặt hoặc theo % đơn hàng.
          </p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="px-5 py-2.5 rounded-full bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-xs flex items-center gap-2 shadow-xs transition-all border border-[#9ed4a3] active:scale-95 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>+ Thêm Voucher mới</span>
        </button>
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
                <th className="py-3.5 px-4">Lượt sử dụng</th>
                <th className="py-3.5 px-4">Trạng thái</th>
                <th className="py-3.5 px-5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0E5D8]">
              {vouchers.map((v) => (
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
                  <td className="py-3.5 px-4 text-[#342A24] font-semibold">
                    {v.usage_count ?? 12} / {v.usage_limit ?? 100} lượt
                  </td>
                  <td className="py-3.5 px-4">
                    <Badge variant="brand">Hoạt động</Badge>
                  </td>
                  <td className="py-3.5 px-5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
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
              ))}
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
    </div>
  );
}
