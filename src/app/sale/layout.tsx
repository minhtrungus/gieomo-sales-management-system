"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { SaleSidebar } from "@/components/sale/SaleSidebar";
import { SaleHeader } from "@/components/sale/SaleHeader";
import { isAdminAuthenticated, getAdminSession } from "@/lib/data/orderStore";

export default function SaleLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isAuthChecked, setIsAuthChecked] = useState(false);

  useEffect(() => {
    document.title = "Gieo Mơ | Cổng Thành viên Gây Quỹ";

    if (!isAdminAuthenticated()) {
      router.replace("/admin/login");
      return;
    }

    setIsAuthChecked(true);

    const handleAuthChange = () => {
      if (!isAdminAuthenticated()) {
        router.replace("/admin/login");
      }
    };

    window.addEventListener("gieomo_admin_auth_changed", handleAuthChange);
    return () => window.removeEventListener("gieomo_admin_auth_changed", handleAuthChange);
  }, [router]);

  if (!isAuthChecked) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 rounded-full border-2 border-emerald-600 border-t-transparent animate-spin" />
          <span className="text-xs font-semibold text-gray-500">Đang tải cổng thành viên...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FBF9F5] flex">
      {/* Sidebar */}
      <SaleSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        <SaleHeader onToggleSidebar={() => setSidebarOpen((prev) => !prev)} />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
