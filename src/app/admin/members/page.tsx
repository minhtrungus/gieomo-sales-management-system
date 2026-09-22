"use client";

import { useState } from "react";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { Badge } from "@/components/ui/Badge";
import { Plus, Copy, Check, X, UserPlus, Shield, User } from "lucide-react";

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
}

export default function AdminMembersPage() {
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
    },
  ]);

  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

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
    };

    setMembers([newMember, ...members]);
    setIsModalOpen(false);

    // Reset form
    setNewFullName("");
    setNewEmail("");
    setNewPhone("");
    setNewReferralCode("");
    setNewRole("btc_sale");

    alert(`Đã cấp tài khoản thành công cho ${newFullName}!\nEmail: ${newEmail}\nMật khẩu khởi tạo: ${newPassword}\nMã giới thiệu: ${refCode}`);
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
          <span>+ Cấp tài khoản mới</span>
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
                <th className="py-3.5 px-4">Mã giới thiệu (Referral)</th>
                <th className="py-3.5 px-4">Số đơn đã chốt</th>
                <th className="py-3.5 px-4">Doanh số gây quỹ</th>
                <th className="py-3.5 px-5 text-right">Link giới thiệu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0E5D8]">
              {members.map((m) => (
                <tr key={m.memberId} className="hover:bg-[#FFFDF9] transition-colors">
                  <td className="py-4 px-5">
                    <span className="font-bold text-[#342A24] block text-sm">{m.fullName}</span>
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

                  <td className="py-4 px-4 font-mono font-extrabold text-[#2D6338] text-sm">
                    {m.referralCode}
                  </td>

                  <td className="py-4 px-4 font-bold text-[#342A24]">
                    {m.totalOrders} đơn
                  </td>

                  <td className="py-4 px-4">
                    <MoneyDisplay amount={m.totalRevenue} className="font-extrabold text-[#1B3622]" />
                  </td>

                  <td className="py-4 px-5 text-right">
                    <button
                      onClick={() => handleCopy(m.referralCode)}
                      className="px-3 py-1.5 rounded-xl border border-[#F0E5D8] bg-[#FFFDF9] hover:bg-[#FFF4E5] text-[#4A3B32] text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      {copiedCode === m.referralCode ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-[#2D6338]" />
                          <span className="text-[#2D6338]">Đã copy link!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-[#7E7068]" />
                          <span>Copy Link</span>
                        </>
                      )}
                    </button>
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
    </div>
  );
}
