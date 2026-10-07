"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { NotificationProvider } from "@/lib/notifications/NotificationContext";
import { NotificationToastContainer } from "@/components/admin/NotificationToast";
import { isAdminAuthenticated, getAdminSession, clearAdminSession, touchMemberActive } from "@/lib/data/orderStore";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isAuthChecked, setIsAuthChecked] = useState(false);

  const isLoginPage = pathname === "/admin/login";

  // Tab title: "Gieo Mơ | Admin" or "Gieo Mơ | Thành viên" depending on user role (tuỳ cấp)
  useEffect(() => {
    const updateTitle = () => {
      if (isLoginPage) {
        document.title = "Gieo Mơ | Đăng nhập";
        return;
      }
      const session = getAdminSession();
      if (session?.role === "btc_sale") {
        document.title = "Gieo Mơ | Thành viên";
      } else {
        document.title = "Gieo Mơ | Admin";
      }
    };

    updateTitle();
    window.addEventListener("gieomo_admin_auth_changed", updateTitle);
    return () => window.removeEventListener("gieomo_admin_auth_changed", updateTitle);
  }, [pathname, isLoginPage]);

  useEffect(() => {
    let isMounted = true;

    async function verifyAuth() {
      if (isLoginPage) {
        setIsAuthChecked(true);
        return;
      }

      try {
        const res = await fetch("/api/auth/session");
        if (!res.ok) {
          clearAdminSession();
          router.replace("/admin/login");
          return;
        }

        const data = await res.json();
        if (!data?.authenticated || !data?.user) {
          clearAdminSession();
          router.replace("/admin/login");
          return;
        }

        if (data.user.role === "btc_sale") {
          router.replace("/sale");
          return;
        }

        if (isMounted) {
          touchMemberActive();
          setIsAuthChecked(true);
        }
      } catch (err) {
        console.error("[AdminLayout] Auth verification failed:", err);
        clearAdminSession();
        router.replace("/admin/login");
      }
    }

    verifyAuth();

    const heartbeatInterval = !isLoginPage ? setInterval(() => touchMemberActive(), 20000) : null;

    const onFocus = () => {
      if (!isLoginPage) {
        touchMemberActive();
      }
    };
    window.addEventListener("focus", onFocus);

    const handleAuthChange = () => {
      if (!isLoginPage) {
        verifyAuth();
      }
    };

    window.addEventListener("gieomo_admin_auth_changed", handleAuthChange);
    return () => {
      isMounted = false;
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("gieomo_admin_auth_changed", handleAuthChange);
    };
  }, [isLoginPage, router]);

  if (isLoginPage) {
    return <div className="min-h-screen bg-cream/70 flex items-center justify-center p-4">{children}</div>;
  }

  if (!isAuthChecked) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-emerald-600 border-t-transparent animate-spin" />
          <span className="text-xs text-gray-500 font-medium">Đang kiểm tra quyền quản trị...</span>
        </div>
      </div>
    );
  }

  return (
    <NotificationProvider>
      <div className="min-h-screen bg-gray-50 flex">
        {/* Sidebar */}
        <AdminSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        {/* Main Content Area */}
        <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
          <AdminHeader onOpenSidebar={() => setSidebarOpen(true)} />
          <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
        </div>

        {/* Global Realtime Notification Toast Container */}
        <NotificationToastContainer />
      </div>
    </NotificationProvider>
  );
}
