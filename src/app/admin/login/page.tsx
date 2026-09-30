"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import {
  verifyAdminLogin,
  getAdminSession,
  syncMembersFromServer,
  SYSTEM_MAINTENANCE_ACCOUNT,
} from "@/lib/data/orderStore";

export default function AdminLoginPage() {
  const router = useRouter();
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    syncMembersFromServer();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const cleanInput = account.trim();
    const cleanPass = password.trim();

    if (!cleanInput || !cleanPass) {
      setError("Vui lòng nhập đầy đủ Tài khoản và Mật khẩu!");
      setLoading(false);
      return;
    }

    // 1. First attempt with local cache
    let result = verifyAdminLogin(cleanPass, cleanInput);

    // 2. If failed, fetch latest members from server and retry immediately (handles new device cold-cache)
    if (!result.success) {
      try {
        const res = await fetch("/api/members");
        const data = await res.json();
        if (data?.success && Array.isArray(data.members)) {
          const mapped = data.members.map((m: any) => ({
            memberId: m.member_id,
            fullName: m.full_name,
            email: m.email || "",
            role: m.role || "btc_sale",
            referralCode: m.referral_code || "",
            phone: m.phone || "Chưa cập nhật",
            totalOrders: 0,
            totalRevenue: 0,
            status: m.status || "active",
            joinedDate: m.created_at ? new Date(m.created_at).toLocaleDateString("vi-VN") : "01/09/2026",
            password: m.password || m.password_hash || "MamMo@123",
          }));
          const finalMembers = [
            SYSTEM_MAINTENANCE_ACCOUNT,
            ...mapped.filter((m: any) => m.memberId !== "baotri-system"),
          ];
          localStorage.setItem("gieomo_members", JSON.stringify(finalMembers));
          result = verifyAdminLogin(cleanPass, cleanInput);
        }
      } catch {
        // Fall through
      }
    }

    if (result.success) {
      const session = getAdminSession();
      if (session?.role === "btc_sale") {
        router.push("/sale");
      } else {
        router.push("/admin/dashboard");
      }
    } else {
      setError(result.error || "Tài khoản hoặc mật khẩu không chính xác!");
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-white rounded-3xl p-7 sm:p-8 border border-emerald-100 shadow-xl space-y-6">
      {/* Brand */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-soft-green text-emerald-950 font-bold text-2xl shadow-sm mb-1">
          🌱
        </div>
        <h1 className="font-heading font-extrabold text-2xl text-emerald-950 tracking-tight">
          Hệ Thống Gieo Mơ
        </h1>
        <p className="text-xs text-gray-500">
          Đăng nhập Ban Tổ Chức & Thành Viên Gây Quỹ
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleLogin} className="space-y-4" autoComplete="on">
        <Input
          label="Email hoặc Số điện thoại *"
          type="text"
          name="username"
          autoComplete="username"
          placeholder="sale@gieomo.store hoặc 0888670637"
          value={account}
          onChange={(e) => setAccount(e.target.value)}
          required
        />

        <Input
          label="Mật khẩu *"
          type="password"
          name="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-xs text-red-600 font-medium text-center">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full h-11 inline-flex items-center justify-center font-bold text-xs sm:text-sm text-white bg-[#342A24] hover:bg-[#231B16] rounded-full shadow-xs transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer touch-manipulation"
        >
          {loading ? "Đang xử lý..." : "Đăng nhập"}
        </button>
      </form>

      <div className="p-3 rounded-2xl bg-[#FFF8EE] border border-[#F0E5D8] text-[11px] text-[#7E7068] space-y-1">
        <p className="font-bold text-[#231B16]">💡 Hướng dẫn đăng nhập:</p>
        <p>• Đăng nhập bằng <strong>Email</strong> hoặc <strong>Số điện thoại</strong> đã đăng ký.</p>
        <p>• Mật khẩu mặc định khởi tạo: <span className="font-mono font-bold text-[#16381D]">MamMo@123</span>.</p>
      </div>

      <div className="text-center pt-2 border-t border-gray-100">
        <Link href="/" className="text-xs text-emerald-800 font-semibold hover:underline">
          ← Quay lại Trang bán hàng
        </Link>
      </div>
    </div>
  );
}
