"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/Input";

export default function AdminLoginPage() {
  const router = useRouter();
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    try {
      // Authenticate directly with the secure server-side login endpoint
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account: cleanInput, password: cleanPass }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data?.error || "Tài khoản hoặc mật khẩu không chính xác!");
        setLoading(false);
        return;
      }

      // Save local UI session for client components and dispatch auth event
      if (typeof window !== "undefined" && data.user) {
        const sessionPayload = {
          authenticated: true,
          email: data.user.email,
          name: data.user.fullName,
          role: data.user.role,
          referralCode: data.user.referralCode || "",
          memberId: data.user.memberId,
          phone: data.user.phone || "",
          loginAt: new Date().toISOString(),
        };
        localStorage.setItem("gieomo_admin_session", JSON.stringify(sessionPayload));
        if (data.token) {
          localStorage.setItem("gieomo_session_token", data.token);
        }
        window.dispatchEvent(new Event("gieomo_admin_auth_changed"));
      }

      if (data.user?.role === "btc_sale") {
        router.push("/sale");
      } else {
        router.push("/admin/dashboard");
      }
    } catch (err: any) {
      console.error("[Login] Exception:", err);
      setError("Lỗi kết nối máy chủ khi đăng nhập. Vui lòng thử lại!");
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
          <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold leading-relaxed animate-in fade-in flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 px-4 bg-emerald-700 hover:bg-emerald-800 active:scale-[0.99] text-white font-bold rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              <span>Đang kiểm tra bảo mật...</span>
            </>
          ) : (
            <span>Đăng nhập hệ thống</span>
          )}
        </button>
      </form>

      <div className="pt-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
        <Link href="/" className="hover:text-emerald-700 transition-colors">
          ← Về trang chủ Gieo Mơ
        </Link>
        <span>Gieo Mơ Admin v2.0</span>
      </div>
    </div>
  );
}
