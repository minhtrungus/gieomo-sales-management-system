"use client";

import { useState, useEffect } from "react";
import {
  UserCheck,
  KeyRound,
  ShieldCheck,
  Phone,
  Mail,
  Copy,
  Check,
  AlertCircle,
  Eye,
  EyeOff,
  ExternalLink,
} from "lucide-react";
import {
  getAdminSession,
  getStoredMembers,
  updateMemberPassword,
  type AdminSession,
  type StoredMember,
} from "@/lib/data/orderStore";
import { Input } from "@/components/ui/Input";

export default function SaleProfilePage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [member, setMember] = useState<StoredMember | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Change password states
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const s = getAdminSession();
    setSession(s);
    if (s?.email) {
      const allMembers = getStoredMembers();
      const matched = allMembers.find((m) => m.email.toLowerCase() === s.email.toLowerCase());
      if (matched) setMember(matched);
    }
  }, []);

  const handleCopyCode = () => {
    if (!session?.referralCode) return;
    navigator.clipboard.writeText(session.referralCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLink = () => {
    const code = session?.referralCode || member?.referralCode;
    if (!code) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "https://gieomo.store";
    navigator.clipboard.writeText(`${origin}/?ref=${code}`);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (newPassword.length < 6) {
      setPasswordError("Mật khẩu mới phải có tối thiểu 6 ký tự!");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("Mật khẩu xác nhận không khớp!");
      return;
    }

    if (!session?.email) {
      setPasswordError("Không tìm thấy thông tin tài khoản đang đăng nhập.");
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      const ok = updateMemberPassword(session.email, newPassword);
      if (ok) {
        setPasswordSuccess("Đổi mật khẩu thành công! Bạn có thể sử dụng mật khẩu mới này cho lần đăng nhập tới.");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        setPasswordError("Không thể cập nhật mật khẩu, vui lòng liên hệ Ban Tổ Chức.");
      }
      setIsSubmitting(false);
    }, 400);
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="font-heading font-extrabold text-2xl text-[#231B16]">
          Tài Khoản Cá Nhân
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Thông tin thành viên gây quỹ và đổi mật khẩu đăng nhập cá nhân.
        </p>
      </div>

      {/* Profile Info Card */}
      <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-xs space-y-5">
        <div className="flex items-center gap-4 border-b border-gray-100 pb-5">
          <div className="w-16 h-16 rounded-3xl bg-[#EBF7EE] text-[#16381D] font-heading font-extrabold text-2xl flex items-center justify-center border border-[#BFE9C3]">
            🌱
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-heading font-extrabold text-lg text-gray-900">
                {session?.name || member?.fullName || "Thành viên"}
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#EBF7EE] text-[#16381D] border border-[#BFE9C3]">
                Thành viên (BTC Sale)
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              Tài khoản thành viên tham gia chiến dịch bán hàng gây quỹ Mầm Mơ
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-100 space-y-1">
            <span className="text-gray-400 flex items-center gap-1.5 font-semibold text-[11px]">
              <Mail className="w-3.5 h-3.5" />
              Email đăng nhập:
            </span>
            <span className="font-bold text-gray-800 block text-sm">
              {session?.email || member?.email || "Chưa cập nhật"}
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-100 space-y-1">
            <span className="text-gray-400 flex items-center gap-1.5 font-semibold text-[11px]">
              <Phone className="w-3.5 h-3.5" />
              Số điện thoại:
            </span>
            <span className="font-bold text-gray-800 block text-sm">
              {session?.phone || member?.phone || "Chưa cập nhật"}
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-100 space-y-1 sm:col-span-2 flex items-center justify-between">
            <div>
              <span className="text-emerald-800 flex items-center gap-1.5 font-semibold text-[11px]">
                <ShieldCheck className="w-3.5 h-3.5" />
                Mã giới thiệu bán hàng (Referral Code):
              </span>
              <span className="font-mono font-extrabold text-emerald-950 text-base mt-0.5 block">
                {session?.referralCode || member?.referralCode || "N/A"}
              </span>
            </div>

            {(session?.referralCode || member?.referralCode) && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="px-4 py-2 rounded-xl bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 transition-colors inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5" /> : <ExternalLink className="w-3.5 h-3.5" />}
                  <span>{copiedLink ? "Đã chép link!" : "Sao chép link web"}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Change Password Card */}
      <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-xs space-y-5">
        <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-800 flex items-center justify-center">
            <KeyRound className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-heading font-extrabold text-base text-[#231B16]">
              Đổi Mật Khẩu Cá Nhân
            </h2>
            <p className="text-xs text-gray-400">
              Cập nhật mật khẩu mới để bảo mật tài khoản thành viên của bạn.
            </p>
          </div>
        </div>

        {passwordSuccess && (
          <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-semibold flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{passwordSuccess}</span>
          </div>
        )}

        {passwordError && (
          <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-700 font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{passwordError}</span>
          </div>
        )}

        <form onSubmit={handleChangePassword} className="space-y-4">
          <div className="relative">
            <Input
              label="Mật khẩu mới (tối thiểu 6 ký tự) *"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-3.5 top-9 text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <Input
            label="Xác nhận lại mật khẩu mới *"
            type={showPassword ? "text" : "password"}
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-11 bg-[#16381D] hover:bg-[#234E2B] text-white rounded-2xl font-bold text-xs sm:text-sm transition-all shadow-xs disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting ? "Đang lưu mật khẩu mới..." : "Lưu mật khẩu mới"}
          </button>
        </form>
      </div>
    </div>
  );
}
