"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    setTimeout(() => {
      if (email.trim() && password.trim()) {
        router.push("/admin/dashboard");
      } else {
        setError("Vui lòng nhập đầy đủ Email và Mật khẩu!");
        setLoading(false);
      }
    }, 600);
  };

  return (
    <div className="w-full max-w-md bg-white rounded-3xl p-8 border border-emerald-100 shadow-lg space-y-6">
      {/* Brand */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-soft-green text-emerald-950 font-bold text-2xl shadow-sm mb-1">
          🌱
        </div>
        <h1 className="font-heading font-extrabold text-2xl text-emerald-950 tracking-tight">
          Cổng Quản Trị Gieo Mơ
        </h1>
        <p className="text-xs text-gray-500">
          Đăng nhập hệ thống quản lý bán hàng gây quỹ Mầm Mơ
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleLogin} className="space-y-4">
        <Input
          label="Email / Tài khoản *"
          type="email"
          placeholder="admin@mammo.vn"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <Input
          label="Mật khẩu *"
          type="password"
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
          className="w-full h-11 inline-flex items-center justify-center font-bold text-xs sm:text-sm text-white bg-[#342A24] hover:bg-[#231B16] rounded-full shadow-xs transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Đang xử lý..." : "Đăng nhập Quản trị"}
        </button>
      </form>

      <div className="text-center pt-2 border-t border-gray-100">
        <Link href="/" className="text-xs text-emerald-800 font-semibold hover:underline">
          ← Quay lại Trang bán hàng
        </Link>
      </div>
    </div>
  );
}
