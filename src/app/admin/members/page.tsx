"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { Badge } from "@/components/ui/Badge";
import {
  Plus,
  Copy,
  Check,
  X,
  UserPlus,
  Shield,
  User,
  Trash2,
  AlertTriangle,
  Calendar,
  Eye,
  ExternalLink,
  ShoppingBag,
  KeyRound,
  Edit3,
} from "lucide-react";
import { MOCK_ORDERS } from "@/lib/data/mockData";
import {
  getStoredOrders,
  getStoredMembers,
  saveStoredMembers,
  type StoredMember,
} from "@/lib/data/orderStore";
import type { Order } from "@/types/database";
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS } from "@/lib/constants";

type MemberItem = StoredMember;

function generateReferralFromName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const lastName = parts[parts.length - 1] || "MAM";
  const normalized = lastName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return `MAM-${normalized || Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}

export default function AdminMembersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [viewingOrdersMember, setViewingOrdersMember] = useState<MemberItem | null>(null);
  const [members, setMembers] = useState<MemberItem[]>([]);

  useEffect(() => {
    setOrders(getStoredOrders());
    setMembers(getStoredMembers());

    const handleOrdersUpdate = () => setOrders(getStoredOrders());
    const handleMembersUpdate = () => setMembers(getStoredMembers());

    window.addEventListener("gieomo_orders_updated", handleOrdersUpdate);
    window.addEventListener("gieomo_members_updated", handleMembersUpdate);
    return () => {
      window.removeEventListener("gieomo_orders_updated", handleOrdersUpdate);
      window.removeEventListener("gieomo_members_updated", handleMembersUpdate);
    };
  }, []);

  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deletingMember, setDeletingMember] = useState<MemberItem | null>(null);
  const [passwordMember, setPasswordMember] = useState<MemberItem | null>(null);

  // Edit member modal states
  const [editingMember, setEditingMember] = useState<MemberItem | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRole, setEditRole] = useState<"admin" | "btc_sale">("btc_sale");
  const [editStatus, setEditStatus] = useState<"active" | "inactive">("active");
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);

  // Form states for new member
  const [newFullName, setNewFullName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "btc_sale">("btc_sale");
  const [newReferralCode, setNewReferralCode] = useState("");
  const [newPassword, setNewPassword] = useState("MamMo@123");
  const [formError, setFormError] = useState<string | null>(null);

  // Password modal states
  const [changePasswordInput, setChangePasswordInput] = useState("");
  const [confirmPasswordInput, setConfirmPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(`https://gieomo.vn/?ref=${code}`);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleNameChange = (name: string) => {
    setNewFullName(name);
    // Auto generate referral code if not manually set or matching previous auto format
    if (!newReferralCode || newReferralCode.startsWith("MAM-")) {
      setNewReferralCode(generateReferralFromName(name));
    }
  };

  const handleCreateMember = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!newFullName || !newEmail) return;

    const refCode = (newReferralCode.trim() || generateReferralFromName(newFullName)).toUpperCase();

    // Check duplicate referral code
    if (members.some((m) => m.referralCode.toUpperCase() === refCode)) {
      setFormError(`Mã referral "${refCode}" đã tồn tại. Vui lòng đặt mã khác.`);
      return;
    }

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
      password: newPassword,
    };

    const updated = [newMember, ...members];
    setMembers(updated);
    saveStoredMembers(updated);
    setIsModalOpen(false);

    // Reset form
    setNewFullName("");
    setNewEmail("");
    setNewPhone("");
    setNewReferralCode("");
    setNewRole("btc_sale");
    setFormError(null);
  };

  const handleOpenEdit = (m: MemberItem) => {
    setEditingMember(m);
    setEditFullName(m.fullName);
    setEditEmail(m.email);
    setEditPhone(m.phone === "Chưa cập nhật" ? "" : m.phone);
    setEditRole(m.role);
    setEditStatus(m.status || "active");
    setEditError(null);
    setEditSuccess(null);
  };

  const handleToggleStatus = (m: MemberItem) => {
    if (m.memberId === "baotri-system") {
      alert("Tài khoản Bảo trì Hệ thống luôn ở trạng thái hoạt động!");
      return;
    }
    const nextStatus: "active" | "inactive" = m.status === "active" ? "inactive" : "active";
    const updated = members.map((item) =>
      item.memberId === m.memberId ? { ...item, status: nextStatus } : item
    );
    setMembers(updated);
    saveStoredMembers(updated);
  };

  const handleSaveMemberInfo = (e: React.FormEvent) => {
    e.preventDefault();
    setEditError(null);

    if (!editingMember) return;

    const trimmedName = editFullName.trim();
    const trimmedEmail = editEmail.trim().toLowerCase();
    const trimmedPhone = editPhone.trim();

    if (!trimmedName) {
      setEditError("Vui lòng nhập họ và tên thành viên.");
      return;
    }

    if (!trimmedEmail) {
      setEditError("Vui lòng nhập email/Gmail.");
      return;
    }

    if (trimmedEmail === "admin@mammo.vn") {
      setEditError("Tài khoản admin cũ đã bị thu hồi, không thể dùng email này.");
      return;
    }

    // Check duplicate email
    const duplicate = members.find(
      (m) => m.memberId !== editingMember.memberId && m.email.toLowerCase() === trimmedEmail
    );
    if (duplicate) {
      setEditError(`Email "${trimmedEmail}" đã được sử dụng bởi ${duplicate.fullName}.`);
      return;
    }

    const updated = members.map((m) =>
      m.memberId === editingMember.memberId
        ? {
            ...m,
            fullName: trimmedName,
            email: trimmedEmail,
            phone: trimmedPhone || "Chưa cập nhật",
            role: editRole,
            status: editStatus,
          }
        : m
    );

    setMembers(updated);
    saveStoredMembers(updated);

    // Sync admin session if currently logged in user is updated
    if (typeof window !== "undefined") {
      try {
        const rawSession = localStorage.getItem("gieomo_admin_session");
        if (rawSession) {
          const session = JSON.parse(rawSession);
          if (session.email?.toLowerCase() === editingMember.email.toLowerCase() || (editingMember.memberId === "baotri-system" && session.email === "baotri@gieomo.store")) {
            session.name = trimmedName;
            session.email = trimmedEmail;
            session.role = editRole;
            localStorage.setItem("gieomo_admin_session", JSON.stringify(session));
            window.dispatchEvent(new Event("gieomo_admin_auth_changed"));
          }
        }
      } catch (err) {
        console.error(err);
      }
    }

    setEditSuccess("Đã cập nhật thông tin thành viên thành công!");
    setTimeout(() => {
      setEditSuccess(null);
      setEditingMember(null);
    }, 1200);
  };

  const handleConfirmRevoke = () => {
    if (!deletingMember) return;
    if (deletingMember.memberId === "baotri-system") {
      alert("Tài khoản bảo trì hệ thống gốc không thể thu hồi!");
      setDeletingMember(null);
      return;
    }
    const updated = members.filter((m) => m.memberId !== deletingMember.memberId);
    setMembers(updated);
    saveStoredMembers(updated);
    setDeletingMember(null);
  };

  const handleSavePassword = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);

    if (changePasswordInput.length < 6) {
      setPasswordError("Mật khẩu mới phải có tối thiểu 6 ký tự.");
      return;
    }

    if (changePasswordInput !== confirmPasswordInput) {
      setPasswordError("Mật khẩu xác nhận không khớp.");
      return;
    }

    if (!passwordMember) return;

    const updated = members.map((m) =>
      m.memberId === passwordMember.memberId ? { ...m, password: changePasswordInput } : m
    );

    setMembers(updated);
    saveStoredMembers(updated);
    setPasswordSuccess(`Đã cập nhật mật khẩu mới cho ${passwordMember.fullName}!`);
    setTimeout(() => {
      setPasswordSuccess(null);
      setPasswordMember(null);
      setChangePasswordInput("");
      setConfirmPasswordInput("");
    }, 1500);
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
          <table className="w-full text-left text-[11px]">
            <thead>
              <tr className="bg-[#FFF8EE] border-b border-[#F0E5D8] text-[#7E7068] font-bold uppercase tracking-wider text-[10px]">
                <th className="py-2.5 px-2.5 text-center w-10">STT</th>
                <th className="py-2.5 px-3">Thành viên</th>
                <th className="py-2.5 px-2.5">Trạng thái</th>
                <th className="py-2.5 px-2.5">Vai trò (Phân quyền)</th>
                <th className="py-2.5 px-2.5">Ngày tham gia</th>
                <th className="py-2.5 px-2.5">Mã Referral</th>
                <th className="py-2.5 px-2.5">Đơn đã chốt</th>
                <th className="py-2.5 px-2.5">Doanh số gây quỹ</th>
                <th className="py-2.5 px-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0E5D8]">
              {members.map((m, idx) => {
                const mOrders = (orders.length > 0 ? orders : MOCK_ORDERS).filter(
                  (o) =>
                    o.created_by_member_id === m.memberId ||
                    o.referral_code === m.referralCode ||
                    (o.introducer_info && o.introducer_info.includes(m.referralCode))
                );
                const displayOrdersCount = mOrders.length > 0 ? mOrders.length : m.totalOrders;
                const displayRevenue = mOrders.length > 0 ? mOrders.reduce((sum, o) => sum + (o.final_amount || 0), 0) : m.totalRevenue;

                const isProtected = Boolean(
                  m.isSystemProtected ||
                  m.email.toLowerCase() === "baotri@gieomo.store" ||
                  m.memberId === "baotri-system"
                );

                return (
                  <tr key={m.memberId} className="hover:bg-[#FFFDF9] transition-colors">
                    <td className="py-2.5 px-2.5 text-center text-[#7E7068] font-bold text-[11px]">
                      {idx + 1}
                    </td>

                    <td className="py-2.5 px-3">
                      <span
                        onClick={() => setViewingOrdersMember(m)}
                        className="font-bold text-[#342A24] hover:text-[#2D6338] hover:underline cursor-pointer block text-xs"
                        title="Nhấn để xem chi tiết đơn hàng giới thiệu"
                      >
                        {m.fullName}
                      </span>
                      <span className="text-[10px] text-[#7E7068] block">{m.email} • {m.phone}</span>
                    </td>

                    <td className="py-2.5 px-2.5 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(m)}
                        title="Nhấn để chuyển đổi trạng thái (Đang hoạt động ⟷ Tạm dừng)"
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border transition-all cursor-pointer hover:scale-105 active:scale-95 ${
                          m.status === "active"
                            ? "bg-[#BFE9C3]/60 text-[#16381D] border-[#9ed4a3] hover:bg-[#BFE9C3]"
                            : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${m.status === "active" ? "bg-emerald-600 animate-pulse" : "bg-red-500"}`} />
                        <span>{m.status === "active" ? "Đang hoạt động" : "Tạm dừng"}</span>
                      </button>
                    </td>

                    <td className="py-2.5 px-2.5 font-semibold whitespace-nowrap">
                      {m.role === "admin" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FFE7A8] text-[#542B07] text-[10px] font-extrabold border border-[#ebd089]">
                          <Shield className="w-2.5 h-2.5 text-[#E2884E]" />
                          <span>Quản trị viên (Admin)</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#CFE8FF] text-[#133A63] text-[10px] font-bold border border-[#b2d9ff]">
                          <User className="w-2.5 h-2.5" />
                          <span>Thành viên (BTC Sale)</span>
                        </span>
                      )}
                    </td>

                    <td className="py-2.5 px-2.5 text-[#7E7068] font-medium whitespace-nowrap text-[10.5px]">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-[#A89B92]" />
                        <span>{m.joinedDate}</span>
                      </span>
                      {m.lastLoginAt ? (
                        <span className="text-[9.5px] text-emerald-800 font-bold block mt-0.5" title={m.lastLoginAt}>
                          Online: {new Date(m.lastLoginAt).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })} {new Date(m.lastLoginAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      ) : (
                        <span className="text-[9.5px] text-gray-400 block mt-0.5">Chưa đăng nhập</span>
                      )}
                    </td>

                    <td className="py-2.5 px-2.5 font-mono font-extrabold text-[#2D6338] text-xs">
                      {m.referralCode}
                    </td>

                    <td className="py-2.5 px-2.5 font-bold text-[#342A24] whitespace-nowrap">
                      <button
                        onClick={() => setViewingOrdersMember(m)}
                        className="px-2.5 py-1 rounded-full bg-[#BFE9C3]/50 hover:bg-[#BFE9C3] text-[#16381D] font-extrabold text-[10.5px] inline-flex items-center gap-1 transition-all border border-[#9ed4a3] cursor-pointer shadow-2xs group"
                        title="Nhấn để xem danh sách đơn hàng chi tiết"
                      >
                        <span>{displayOrdersCount} đơn</span>
                        <Eye className="w-3 h-3 text-[#2D6338] group-hover:scale-110 transition-transform" />
                      </button>
                    </td>

                    <td className="py-2.5 px-2.5 whitespace-nowrap">
                      <MoneyDisplay amount={displayRevenue} className="font-extrabold text-[#1B3622] text-xs" />
                    </td>

                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setViewingOrdersMember(m)}
                          className="px-2 py-1 rounded-lg border border-[#BFE9C3] bg-[#FFF8EE] hover:bg-[#BFE9C3]/50 text-[#16381D] text-[10.5px] font-bold inline-flex items-center gap-1 transition-colors cursor-pointer"
                          title="Xem các đơn hàng đã giới thiệu"
                        >
                          <Eye className="w-3 h-3 text-[#2D6338]" />
                          <span className="hidden sm:inline">Xem đơn</span>
                        </button>

                        <button
                          onClick={() => handleCopy(m.referralCode)}
                          className="px-2.5 py-1 rounded-lg border border-[#F0E5D8] bg-[#FFFDF9] hover:bg-[#FFF4E5] text-[#4A3B32] text-[10.5px] font-bold inline-flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          {copiedCode === m.referralCode ? (
                            <>
                              <Check className="w-3 h-3 text-[#2D6338]" />
                              <span className="text-[#2D6338]">Đã chép</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3 text-[#7E7068]" />
                              <span>Link</span>
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => handleOpenEdit(m)}
                          className="px-2 py-1 rounded-lg border border-[#CFE8FF] bg-[#F0F7FF] hover:bg-[#DCEEFF] text-[#0C4A6E] text-[10.5px] font-bold inline-flex items-center gap-1 transition-colors cursor-pointer"
                          title="Chỉnh sửa thông tin thành viên (Tên, SĐT, Gmail)"
                        >
                          <Edit3 className="w-3 h-3 text-[#0284C7]" />
                          <span className="hidden sm:inline">Sửa</span>
                        </button>

                        <button
                          onClick={() => {
                            setPasswordMember(m);
                            setChangePasswordInput("");
                            setConfirmPasswordInput("");
                            setPasswordError(null);
                            setPasswordSuccess(null);
                          }}
                          className="px-2 py-1 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-900 text-[10.5px] font-bold inline-flex items-center gap-1 transition-colors cursor-pointer"
                          title="Đổi mật khẩu tài khoản"
                        >
                          <KeyRound className="w-3 h-3 text-amber-700" />
                          <span className="hidden sm:inline">Đổi pass</span>
                        </button>

                        {m.memberId !== "baotri-system" && (
                          <button
                            onClick={() => setDeletingMember(m)}
                            className="p-1 rounded-lg border border-[#FED7D7] bg-[#FFF5F5] hover:bg-[#FED7D7] text-[#E53E3E] transition-colors cursor-pointer"
                            title="Thu hồi quyền thành viên"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: CHỈNH SỬA THÔNG TIN THÀNH VIÊN */}
      {editingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-7 border border-[#F0E5D8] shadow-2xl space-y-5 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-[#F0E5D8] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-800 flex items-center justify-center">
                  <Edit3 className="w-4 h-4 text-sky-600" />
                </div>
                <div>
                  <h3 className="font-heading font-extrabold text-base text-[#231B16]">
                    Chỉnh sửa thông tin thành viên
                  </h3>
                  <p className="text-[11px] text-[#7E7068]">
                    Mã Referral: <code className="font-mono font-bold text-[#2D6338]">{editingMember.referralCode}</code>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEditingMember(null)}
                className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMemberInfo} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-[#342A24] block">Họ và tên *</label>
                <input
                  type="text"
                  required
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  placeholder="Ví dụ: Nguyễn Thị Trúc Hân"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A]"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#342A24] block">Số điện thoại *</label>
                <input
                  type="tel"
                  required
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="0888670637"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A]"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#342A24] block">Email / Gmail đăng nhập *</label>
                <input
                  type="email"
                  required
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="truchan16092005@gmail.com"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A]"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#342A24] block">Vai trò (Phân quyền)</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as "admin" | "btc_sale")}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] bg-white cursor-pointer font-semibold text-[#342A24]"
                >
                  <option value="btc_sale">Thành viên gây quỹ (BTC Sale)</option>
                  <option value="admin">Quản trị viên (Admin)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#342A24] block">Trạng thái tài khoản</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as "active" | "inactive")}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] bg-white cursor-pointer font-semibold text-[#342A24]"
                >
                  <option value="active">🟢 Đang hoạt động (Cho phép đăng nhập)</option>
                  <option value="inactive">🔴 Tạm dừng (Khóa đăng nhập)</option>
                </select>
              </div>

              {editError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-600 font-medium">
                  {editError}
                </div>
              )}

              {editSuccess && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-bold flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>{editSuccess}</span>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-[#F0E5D8]">
                <button
                  type="button"
                  onClick={() => setEditingMember(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-[#2D6338] hover:bg-[#23502D] text-white font-extrabold text-xs shadow-xs transition-colors cursor-pointer"
                >
                  Lưu thay đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CẤP TÀI KHOẢN MỚI */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 animate-in fade-in">
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
                  onChange={(e) => handleNameChange(e.target.value)}
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

              {formError && (
                <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-600 font-medium text-center">
                  {formError}
                </div>
              )}

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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 animate-in fade-in">
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

      {/* MODAL: ĐỔI MẬT KHẨU THÀNH VIÊN */}
      {passwordMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl border border-[#F0E5D8] shadow-2xl overflow-hidden animate-in zoom-in-95 p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#F0E5D8]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-heading font-extrabold text-base text-[#231B16]">
                    Đổi mật khẩu thành viên
                  </h3>
                  <p className="text-xs text-[#7E7068]">
                    {passwordMember.fullName} ({passwordMember.email})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPasswordMember(null)}
                className="p-1 rounded-xl text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePassword} className="space-y-4">
              <div className="space-y-1">
                <label className="font-bold text-xs text-[#342A24] block">Mật khẩu mới *</label>
                <input
                  type="password"
                  required
                  value={changePasswordInput}
                  onChange={(e) => setChangePasswordInput(e.target.value)}
                  placeholder="Tối thiểu 6 ký tự"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-amber-400"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-xs text-[#342A24] block">Xác nhận mật khẩu mới *</label>
                <input
                  type="password"
                  required
                  value={confirmPasswordInput}
                  onChange={(e) => setConfirmPasswordInput(e.target.value)}
                  placeholder="Nhập lại mật khẩu mới"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-amber-400"
                />
              </div>

              {passwordError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-600 font-medium">
                  {passwordError}
                </div>
              )}

              {passwordSuccess && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-bold flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>{passwordSuccess}</span>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setPasswordMember(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs shadow-xs transition-colors"
                >
                  Lưu mật khẩu mới
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CHI TIẾT CÁC ĐƠN HÀNG DO THÀNH VIÊN GIỚI THIỆU */}
      {viewingOrdersMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 animate-in fade-in">
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

            {/* Modal Body */}
            {(() => {
              const allSourceOrders = orders.length > 0 ? orders : MOCK_ORDERS;
              const memberOrders = allSourceOrders.filter(
                (o) =>
                  o.created_by_member_id === viewingOrdersMember.memberId ||
                  o.referral_code === viewingOrdersMember.referralCode ||
                  (o.introducer_info && o.introducer_info.includes(viewingOrdersMember.referralCode))
              );
              const modalOrdersCount = memberOrders.length > 0 ? memberOrders.length : viewingOrdersMember.totalOrders;
              const modalRevenue = memberOrders.length > 0 
                ? memberOrders.reduce((sum, o) => sum + (o.final_amount || 0), 0) 
                : viewingOrdersMember.totalRevenue;

              return (
                <>
                  {/* Top Summary Stats */}
                  <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-3 bg-[#FFFDF9] border-b border-[#F0E5D8]">
                    <div className="p-3.5 rounded-2xl bg-white border border-[#F0E5D8] shadow-2xs">
                      <span className="text-[11px] font-bold text-[#7E7068] block">Tổng đơn đã chốt</span>
                      <span className="text-xl font-extrabold text-[#231B16] mt-0.5 block">
                        {modalOrdersCount} đơn
                      </span>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-white border border-[#F0E5D8] shadow-2xs">
                      <span className="text-[11px] font-bold text-[#7E7068] block">Doanh số gây quỹ mang lại</span>
                      <MoneyDisplay amount={modalRevenue} className="text-xl font-extrabold text-[#2D6338] mt-0.5 block" />
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
                    {memberOrders.length === 0 ? (
                      <div className="py-12 text-center space-y-2">
                        <ShoppingBag className="w-10 h-10 text-gray-300 mx-auto" />
                        <p className="font-bold text-sm text-[#231B16]">Chưa có đơn hàng mẫu nào</p>
                        <p className="text-xs text-[#7E7068]">
                          Các đơn hàng tiếp theo được đặt với mã {viewingOrdersMember.referralCode} sẽ tự động hiển thị tại đây.
                        </p>
                      </div>
                    ) : (
                      <div className="border border-[#F0E5D8] rounded-2xl overflow-hidden shadow-2xs">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="bg-[#FFF8EE] border-b border-[#F0E5D8] text-[#7E7068] font-bold uppercase">
                              <th className="py-3 px-3 text-center w-12">STT</th>
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
                            {memberOrders.map((ord, idx) => (
                              <tr key={ord.order_id} className="hover:bg-[#FFFDF9] transition-colors">
                                <td className="py-3 px-3 text-center font-bold text-[#7E7068] text-[11px]">
                                  {idx + 1}
                                </td>
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
                                <td className="py-3 px-3.5 text-[#7E7068] max-w-[160px] truncate" title={`${ord.address_detail}, ${ord.district}, ${ord.province}`}>
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
                    )}
                  </div>
                </>
              );
            })()}

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
