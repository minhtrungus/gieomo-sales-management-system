"use client";

import { useState } from "react";
import Link from "next/link";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { Badge } from "@/components/ui/Badge";
import { Plus, Copy, Check, X, UserPlus, Shield, User, Trash2, AlertTriangle, Calendar, Eye, ExternalLink, ShoppingBag } from "lucide-react";
import { MOCK_ORDERS } from "@/lib/data/mockData";
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS } from "@/lib/constants";

interface MemberItem {
  memberId: string;
  fullName: string;
  email: string;
  role: "admin" | "btc_sale";
  referralCode: string;
  phone: string;
  totalOrders: number;
  totalRevenue: number;
  status: "active" | "inactive";
  joinedDate: string; // DD/MM/YYYY
}

export default function AdminMembersPage() {
  const [viewingOrdersMember, setViewingOrdersMember] = useState<MemberItem | null>(null);
  const [members, setMembers] = useState<MemberItem[]>([
    {
      memberId: "mem-0",
      fullName: "BTC Mầm Mơ (Trưởng ban)",
      email: "admin@mammo.vn",
      role: "admin",
      referralCode: "MAM-ADMIN",
      phone: "0123456789",
      totalOrders: 28,
      totalRevenue: 4850000,
      status: "active",
      joinedDate: "15/08/2026",
    },
    {
      memberId: "mem-1",
      fullName: "Nguyễn Thị Mai Lan",
      email: "mailan@mammo.vn",
      role: "btc_sale",
      referralCode: "MAM-LAN",
      phone: "0901112233",
      totalOrders: 15,
      totalRevenue: 2450000,
      status: "active",
      joinedDate: "20/08/2026",
    },
    {
      memberId: "mem-2",
      fullName: "Trần Minh Quang",
      email: "minhquang@mammo.vn",
      role: "btc_sale",
      referralCode: "MAM-QUANG",
      phone: "0904445566",
      totalOrders: 8,
      totalRevenue: 1120000,
      status: "active",
      joinedDate: "01/09/2026",
    },
  ]);

  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deletingMember, setDeletingMember] = useState<MemberItem | null>(null);

  // Form states for new member
  const [newFullName, setNewFullName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "btc_sale">("btc_sale");
  const [newReferralCode, setNewReferralCode] = useState("");
  const [newPassword, setNewPassword] = useState("MamMo@2026");

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(`https://gieomo.vn/?ref=${code}`);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleCreateMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFullName || !newEmail) return;

    const refCode = newReferralCode.trim() || `MAM-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const today = new Date();
    const joinedDateStr = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;

    const newMember: MemberItem = {
      memberId: `mem-${Date.now()}`,
      fullName: newFullName,
      email: newEmail,
      phone: newPhone || "Chưa cập nhật",
      role: newRole,
      referralCode: refCode,
      totalOrders: 0,
      totalRevenue: 0,
      status: "active",
      joinedDate: joinedDateStr,
    };

    setMembers([newMember, ...members]);
    setIsModalOpen(false);

    // Reset form
    setNewFullName("");
    setNewEmail("");
    setNewPhone("");
    setNewReferralCode("");
    setNewRole("btc_sale");
  };

  const handleConfirmRevoke = () => {
    if (!deletingMember) return;
    setMembers((prev) => prev.filter((m) => m.memberId !== deletingMember.memberId));
    setDeletingMember(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-[#231B16]">
            Thành viên, Quản trị & Mã Referral
          </h1>
          <p className="text-xs text-[#7E7068] mt-0.5">
            Quản trị viên có thể cấp tài khoản cho Quản trị viên phụ (Admin) hoặc Thành viên gây quỹ (BTC Sale).
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="px-5 py-2.5 rounded-full bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-xs flex items-center gap-2 shadow-xs transition-all border border-[#9ed4a3] active:scale-95 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Cấp tài khoản mới</span>
        </button>
      </div>

      {/* Members Table */}
      <div className="bg-white rounded-3xl border border-[#F0E5D8] shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-[#FFF8EE] border-b border-[#F0E5D8] text-[#7E7068] font-bold uppercase tracking-wider">
                <th className="py-3.5 px-5">Thành viên</th>
                <th className="py-3.5 px-4">Vai trò (Phân quyền)</th>
                <th className="py-3.5 px-4">Ngày tham gia BTC</th>
                <th className="py-3.5 px-4">Mã Referral</th>
                <th className="py-3.5 px-4">Đơn đã chốt</th>
                <th className="py-3.5 px-4">Doanh số gây quỹ</th>
                <th className="py-3.5 px-5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0E5D8]">
              {members.map((m) => (
                <tr key={m.memberId} className="hover:bg-[#FFFDF9] transition-colors">
                  <td className="py-4 px-5">
                    <span
                      onClick={() => setViewingOrdersMember(m)}
                      className="font-bold text-[#342A24] hover:text-[#2D6338] hover:underline cursor-pointer block text-sm"
                      title="Nhấn để xem chi tiết đơn hàng giới thiệu"
                    >
                      {m.fullName}
                    </span>
                    <span className="text-[11px] text-[#7E7068] block">{m.email} • {m.phone}</span>
                  </td>

                  <td className="py-4 px-4 font-semibold">
                    {m.role === "admin" ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#FFE7A8] text-[#542B07] text-[11px] font-extrabold border border-[#ebd089]">
                        <Shield className="w-3 h-3 text-[#E2884E]" />
                        <span>Quản trị viên (Admin)</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#CFE8FF] text-[#133A63] text-[11px] font-bold border border-[#b2d9ff]">
                        <User className="w-3 h-3" />
                        <span>Thành viên (BTC Sale)</span>
                      </span>
                    )}
                  </td>

                  <td className="py-4 px-4 text-[#7E7068] font-medium whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-[#A89B92]" />
                      <span>{m.joinedDate}</span>
                    </span>
                  </td>

                  <td className="py-4 px-4 font-mono font-extrabold text-[#2D6338] text-sm">
                    {m.referralCode}
                  </td>

                  <td className="py-4 px-4 font-bold text-[#342A24]">
                    <button
                      onClick={() => setViewingOrdersMember(m)}
                      className="px-3 py-1.5 rounded-full bg-[#BFE9C3]/50 hover:bg-[#BFE9C3] text-[#16381D] font-extrabold text-xs inline-flex items-center gap-1.5 transition-all border border-[#9ed4a3] cursor-pointer shadow-2xs group"
                      title="Nhấn để xem danh sách đơn hàng chi tiết"
                    >
                      <span>{m.totalOrders} đơn</span>
                      <Eye className="w-3.5 h-3.5 text-[#2D6338] group-hover:scale-110 transition-transform" />
                    </button>
                  </td>

                  <td className="py-4 px-4">
                    <MoneyDisplay amount={m.totalRevenue} className="font-extrabold text-[#1B3622]" />
                  </td>

                  <td className="py-4 px-5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setViewingOrdersMember(m)}
                        className="px-2.5 py-1.5 rounded-xl border border-[#BFE9C3] bg-[#FFF8EE] hover:bg-[#BFE9C3]/50 text-[#16381D] text-xs font-bold inline-flex items-center gap-1 transition-colors cursor-pointer"
                        title="Xem các đơn hàng đã giới thiệu"
                      >
                        <Eye className="w-3.5 h-3.5 text-[#2D6338]" />
                        <span className="hidden sm:inline">Xem đơn</span>
                      </button>

                      <button
                        onClick={() => handleCopy(m.referralCode)}
                        className="px-3 py-1.5 rounded-xl border border-[#F0E5D8] bg-[#FFFDF9] hover:bg-[#FFF4E5] text-[#4A3B32] text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        {copiedCode === m.referralCode ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-[#2D6338]" />
                            <span className="text-[#2D6338]">Đã copy</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-[#7E7068]" />
                            <span>Copy Link</span>
                          </>
                        )}
                      </button>

                      {m.memberId !== "mem-0" && (
                        <button
                          onClick={() => setDeletingMember(m)}
                          className="p-1.5 rounded-xl border border-[#FED7D7] bg-[#FFF5F5] hover:bg-[#FED7D7] text-[#E53E3E] transition-colors cursor-pointer"
                          title="Thu hồi quyền thành viên"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: CẤP TÀI KHOẢN MỚI */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-7 border border-[#F0E5D8] shadow-2xl space-y-5 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-[#F0E5D8] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#BFE9C3] flex items-center justify-center text-[#16381D]">
                  <UserPlus className="w-4 h-4" />
                </div>
                <h3 className="font-heading font-extrabold text-lg text-[#231B16]">
                  Cấp tài khoản mới
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateMember} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-[#342A24] block">Họ và tên *</label>
                <input
                  type="text"
                  required
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  placeholder="Ví dụ: Lê Thị Thanh"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A]"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#342A24] block">Email đăng nhập *</label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="thanhle@mammo.vn"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Số điện thoại</label>
                  <input
                    type="tel"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="0912345678"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Vai trò (Role) *</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as "admin" | "btc_sale")}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] bg-white font-bold text-[#342A24]"
                  >
                    <option value="btc_sale">Thành viên (BTC Sale)</option>
                    <option value="admin">Quản trị viên (Admin)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Mã giới thiệu (Referral)</label>
                  <input
                    type="text"
                    value={newReferralCode}
                    onChange={(e) => setNewReferralCode(e.target.value.toUpperCase())}
                    placeholder="Tự sinh nếu để trống"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] font-mono uppercase"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[#342A24] block">Mật khẩu khởi tạo</label>
                  <input
                    type="text"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] font-mono bg-[#FFFDF9]"
                  />
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-[#FFF8EE] border border-[#F0E5D8] text-[11px] text-[#7E7068] leading-relaxed">
                💡 <strong>Lưu ý:</strong> Quản trị viên (Admin) có toàn quyền cấu hình và tài chính. Thành viên (BTC Sale) chỉ có thể xem số liệu của bản thân và dùng tính năng Nhập đơn hộ.
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-xs shadow-xs border border-[#9ed4a3]"
                >
                  Xác nhận cấp tài khoản ➔
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: XÁC NHẬN THU HỒI TÀI KHOẢN */}
      {deletingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 border border-[#FED7D7] shadow-2xl space-y-4 animate-in zoom-in-95 text-center">
            <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="space-y-1.5">
              <h3 className="font-heading font-extrabold text-base text-[#231B16]">
                Xác nhận thu hồi quyền thành viên?
              </h3>
              <p className="text-xs text-[#7E7068] leading-relaxed">
                Bạn có chắc chắn muốn hủy quyền của <strong>{deletingMember.fullName}</strong> ({deletingMember.email})? Mã giới thiệu <code>{deletingMember.referralCode}</code> sẽ không còn ghi nhận doanh số mới.
              </p>
            </div>

            <div className="flex items-center justify-center gap-2.5 pt-2">
              <button
                onClick={() => setDeletingMember(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleConfirmRevoke}
                className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs shadow-xs transition-colors cursor-pointer"
              >
                Xác nhận thu hồi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CHI TIẾT CÁC ĐƠN HÀNG DO THÀNH VIÊN GIỚI THIỆU */}
      {viewingOrdersMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-4xl bg-white rounded-3xl border border-[#F0E5D8] shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-5 bg-[#FFF8EE] border-b border-[#F0E5D8] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#BFE9C3] flex items-center justify-center text-[#16381D] font-extrabold text-base shadow-xs">
                  🌱
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-heading font-extrabold text-lg text-[#231B16]">
                      Đơn hàng do {viewingOrdersMember.fullName} giới thiệu
                    </h3>
                    <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-full bg-white text-[#2D6338] border border-[#9ed4a3]">
                      {viewingOrdersMember.referralCode}
                    </span>
                  </div>
                  <p className="text-xs text-[#7E7068] mt-0.5">
                    {viewingOrdersMember.email} • {viewingOrdersMember.phone} • Tham gia từ {viewingOrdersMember.joinedDate}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setViewingOrdersMember(null)}
                className="p-2 rounded-full hover:bg-white text-gray-400 hover:text-gray-700 cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Top Summary Stats */}
            <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-3 bg-[#FFFDF9] border-b border-[#F0E5D8]">
              <div className="p-3.5 rounded-2xl bg-white border border-[#F0E5D8] shadow-2xs">
                <span className="text-[11px] font-bold text-[#7E7068] block">Tổng đơn đã chốt</span>
                <span className="text-xl font-extrabold text-[#231B16] mt-0.5 block">
                  {viewingOrdersMember.totalOrders} đơn
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-white border border-[#F0E5D8] shadow-2xs">
                <span className="text-[11px] font-bold text-[#7E7068] block">Doanh số gây quỹ mang lại</span>
                <MoneyDisplay amount={viewingOrdersMember.totalRevenue} className="text-xl font-extrabold text-[#2D6338] mt-0.5 block" />
              </div>
              <div className="p-3.5 rounded-2xl bg-white border border-[#F0E5D8] shadow-2xs">
                <span className="text-[11px] font-bold text-[#7E7068] block">Tình trạng ghi nhận</span>
                <span className="text-xs font-bold text-[#2D6338] mt-1.5 inline-flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  <span>Đã ghi nhận đủ vào quỹ Mầm Mơ</span>
                </span>
              </div>
            </div>

            {/* Orders Table */}
            <div className="flex-1 overflow-y-auto p-5">
              {(() => {
                const memberOrders = MOCK_ORDERS.filter(
                  (o) =>
                    o.created_by_member_id === viewingOrdersMember.memberId ||
                    o.referral_code === viewingOrdersMember.referralCode ||
                    (o.introducer_info && o.introducer_info.includes(viewingOrdersMember.referralCode))
                );

                if (memberOrders.length === 0) {
                  return (
                    <div className="py-12 text-center space-y-2">
                      <ShoppingBag className="w-10 h-10 text-gray-300 mx-auto" />
                      <p className="font-bold text-sm text-[#231B16]">Chưa có đơn hàng mẫu nào</p>
                      <p className="text-xs text-[#7E7068]">
                        Các đơn hàng tiếp theo được đặt với mã {viewingOrdersMember.referralCode} sẽ tự động hiển thị tại đây.
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="border border-[#F0E5D8] rounded-2xl overflow-hidden shadow-2xs">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="bg-[#FFF8EE] border-b border-[#F0E5D8] text-[#7E7068] font-bold uppercase">
                          <th className="py-3 px-3.5">Mã đơn</th>
                          <th className="py-3 px-3.5">Thời gian đặt</th>
                          <th className="py-3 px-3.5">Khách hàng</th>
                          <th className="py-3 px-3.5">Địa chỉ nhận</th>
                          <th className="py-3 px-3.5">Tổng tiền</th>
                          <th className="py-3 px-3.5">Thanh toán</th>
                          <th className="py-3 px-3.5">Trạng thái</th>
                          <th className="py-3 px-3.5 text-right">Chi tiết</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F0E5D8]">
                        {memberOrders.map((ord) => (
                          <tr key={ord.order_id} className="hover:bg-[#FFFDF9] transition-colors">
                            <td className="py-3 px-3.5 font-mono font-bold text-[#1B3622]">
                              {ord.order_code}
                            </td>
                            <td className="py-3 px-3.5 text-[#7E7068] whitespace-nowrap">
                              {new Date(ord.created_at).toLocaleDateString("vi-VN", {
                                hour: "2-digit",
                                minute: "2-digit",
                                day: "2-digit",
                                month: "2-digit",
                              })}
                            </td>
                            <td className="py-3 px-3.5">
                              <span className="font-bold text-[#231B16] block">{ord.buyer_name}</span>
                              <span className="text-[10px] text-gray-500">{ord.buyer_phone}</span>
                            </td>
                            <td className="py-3 px-3.5 text-[#7E7068] max-w-[150px] truncate">
                              {ord.address_detail}, {ord.district}
                            </td>
                            <td className="py-3 px-3.5">
                              <MoneyDisplay amount={ord.final_amount} className="font-extrabold text-[#1B3622]" />
                            </td>
                            <td className="py-3 px-3.5">
                              <Badge variant={ord.payment_status === "paid" ? "success" : "warning"}>
                                {PAYMENT_STATUS_LABELS[ord.payment_status]}
                              </Badge>
                            </td>
                            <td className="py-3 px-3.5">
                              <Badge variant={ord.order_status === "completed" ? "success" : "warning"}>
                                {ORDER_STATUS_LABELS[ord.order_status]}
                              </Badge>
                            </td>
                            <td className="py-3 px-3.5 text-right">
                              <Link
                                href={`/admin/orders/${ord.order_id}`}
                                className="px-2.5 py-1 rounded-lg bg-[#FFF8EE] hover:bg-[#BFE9C3]/50 text-[#16381D] text-[11px] font-bold border border-[#F0E5D8] inline-flex items-center gap-1 transition-colors"
                              >
                                <span>Xem</span>
                                <ExternalLink className="w-3 h-3" />
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="p-4 bg-[#FFF8EE] border-t border-[#F0E5D8] flex items-center justify-between">
              <Link
                href="/admin/orders"
                className="text-xs font-bold text-[#2D6338] hover:underline inline-flex items-center gap-1"
              >
                <span>Chuyển đến trang Tất cả đơn hàng</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
              <button
                onClick={() => setViewingOrdersMember(null)}
                className="px-5 py-2 rounded-full bg-white border border-[#F0E5D8] text-xs font-bold text-[#5C4D44] hover:bg-gray-100 cursor-pointer shadow-2xs transition-colors"
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
