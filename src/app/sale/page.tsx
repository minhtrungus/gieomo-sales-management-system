"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ShoppingBag,
  TrendingUp,
  Clock,
  CheckCircle2,
  PackagePlus,
  Copy,
  Check,
  ExternalLink,
  ChevronRight,
  Sparkles,
  QrCode,
} from "lucide-react";
import {
  getAdminSession,
  getStoredOrders,
  touchMemberActive,
  type AdminSession,
} from "@/lib/data/orderStore";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { Badge } from "@/components/ui/Badge";
import { ORDER_STATUS_LABELS } from "@/lib/constants";
import type { Order } from "@/types/database";

export default function SaleDashboardPage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    const s = getAdminSession();
    setSession(s);
    const allOrders = getStoredOrders();

    if (s) {
      const myOrders = allOrders.filter(
        (o) =>
          (s.referralCode && o.referral_code?.toLowerCase() === s.referralCode.toLowerCase()) ||
          (s.memberId && o.seller_id === s.memberId) ||
          (s.memberId && o.created_by_member_id === s.memberId)
      );
      setOrders(myOrders);
    }

    const handleUpdate = () => {
      const currentSession = getAdminSession();
      setSession(currentSession);
      const updatedOrders = getStoredOrders();
      if (currentSession) {
        const filtered = updatedOrders.filter(
          (o) =>
            (currentSession.referralCode &&
              o.referral_code?.toLowerCase() === currentSession.referralCode.toLowerCase()) ||
            (currentSession.memberId && o.seller_id === currentSession.memberId) ||
            (currentSession.memberId && o.created_by_member_id === currentSession.memberId)
        );
        setOrders(filtered);
      }
    };

    touchMemberActive();
    const heartbeatInterval = setInterval(() => touchMemberActive(), 45000);
    const onFocus = () => touchMemberActive();
    window.addEventListener("focus", onFocus);

    window.addEventListener("gieomo_orders_updated", handleUpdate);
    window.addEventListener("gieomo_admin_auth_changed", handleUpdate);
    return () => {
      clearInterval(heartbeatInterval);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("gieomo_orders_updated", handleUpdate);
      window.removeEventListener("gieomo_admin_auth_changed", handleUpdate);
    };
  }, []);

  const origin = typeof window !== "undefined" ? window.location.origin : "https://gieomo.store";
  const refCode = session?.referralCode || "";
  const referralUrl = refCode ? `${origin}/?ref=${refCode}` : "";

  const handleCopyLink = () => {
    if (!referralUrl) return;
    navigator.clipboard.writeText(referralUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyCode = () => {
    if (!refCode) return;
    navigator.clipboard.writeText(refCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Metrics
  const totalOrdersCount = orders.length;
  const completedOrders = orders.filter((o) => o.order_status === "completed");
  const pendingOrders = orders.filter(
    (o) => o.order_status !== "completed" && o.order_status !== "cancelled"
  );
  const totalRevenue = orders
    .filter((o) => o.order_status !== "cancelled")
    .reduce((sum, o) => sum + (o.final_amount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-[#16381D] via-[#1E4527] to-[#2B5435] rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden shadow-sm">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-[#BFE9C3] text-xs font-semibold backdrop-blur-xs">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Cổng Thành Viên Gieo Mơ</span>
            </div>
            <h1 className="font-heading font-extrabold text-2xl sm:text-3xl text-white">
              Chào mừng bạn, {session?.name || "Thành viên"}! 🌱
            </h1>
            <p className="text-xs sm:text-sm text-emerald-100/90 leading-relaxed">
              Theo dõi kết quả gây quỹ cá nhân, nhập đơn hộ cho khách và chia sẻ liên kết bán hàng gắn mã giới thiệu của riêng bạn.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 shrink-0">
            <Link
              href="/sale/create-order"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-[#BFE9C3] text-[#16381D] font-bold text-xs sm:text-sm hover:bg-[#aee0b3] shadow-md transition-all active:scale-[0.98]"
            >
              <PackagePlus className="w-4 h-4" />
              <span>Nhập đơn hộ cho khách</span>
            </Link>
            <Link
              href="/sale/orders"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs sm:text-sm border border-white/20 transition-all"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Xem tất cả đơn của tôi</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Referral Link & Code Card */}
      {refCode && (
        <div className="bg-white rounded-3xl p-6 border border-emerald-100/80 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-3">
            <div>
              <h2 className="font-heading font-extrabold text-base text-[#231B16] flex items-center gap-2">
                <span>Mã & Liên Kết Giới Thiệu Của Bạn</span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  Cá nhân
                </span>
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Khách đặt mua qua link này hoặc nhập mã của bạn thì đơn sẽ tự động được ghi nhận cho bạn.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Mã referral:</span>
              <button
                onClick={handleCopyCode}
                className="font-mono text-sm font-extrabold text-[#16381D] bg-[#EBF7EE] px-3 py-1 rounded-xl border border-[#BFE9C3] hover:bg-[#d8eedc] transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                title="Bấm để sao chép mã"
              >
                <span>{refCode}</span>
                {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5 text-emerald-700" />}
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex-1 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-2.5 text-xs font-mono text-gray-700 truncate select-all">
              {referralUrl}
            </div>
            <button
              onClick={handleCopyLink}
              className={`px-5 py-2.5 rounded-2xl font-bold text-xs inline-flex items-center justify-center gap-2 transition-all cursor-pointer ${
                copiedLink
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "bg-[#16381D] hover:bg-[#234E2B] text-white shadow-xs"
              }`}
            >
              {copiedLink ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Đã sao chép link!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Sao chép liên kết bán hàng</span>
                </>
              )}
            </button>
            <Link
              href={referralUrl}
              target="_blank"
              className="p-2.5 rounded-2xl border border-gray-200 text-gray-600 hover:text-[#16381D] hover:bg-gray-50 inline-flex items-center justify-center"
              title="Mở thử trang bán hàng với mã của bạn"
            >
              <ExternalLink className="w-4 h-4" />
            </Link>
          </div>
        </div>
      )}

      {/* 4 Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Orders */}
        <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500">Đơn đã chốt</span>
            <div className="w-8 h-8 rounded-2xl bg-emerald-50 text-emerald-800 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-heading font-extrabold text-[#231B16]">
            {totalOrdersCount} <span className="text-xs font-medium text-gray-400">đơn</span>
          </div>
        </div>

        {/* Revenue */}
        <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500">Doanh số gây quỹ</span>
            <div className="w-8 h-8 rounded-2xl bg-amber-50 text-amber-800 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-heading font-extrabold text-[#16381D]">
            <MoneyDisplay amount={totalRevenue} />
          </div>
        </div>

        {/* Pending */}
        <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500">Đang xử lý / giao</span>
            <div className="w-8 h-8 rounded-2xl bg-blue-50 text-blue-800 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-heading font-extrabold text-[#231B16]">
            {pendingOrders.length} <span className="text-xs font-medium text-gray-400">đơn</span>
          </div>
        </div>

        {/* Completed */}
        <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500">Giao thành công</span>
            <div className="w-8 h-8 rounded-2xl bg-green-50 text-green-800 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-heading font-extrabold text-emerald-900">
            {completedOrders.length} <span className="text-xs font-medium text-gray-400">đơn</span>
          </div>
        </div>
      </div>

      {/* Recent Orders List */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-xs p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-heading font-extrabold text-base text-[#231B16]">
              Đơn Hàng Gần Đây Của Bạn
            </h2>
            <p className="text-xs text-gray-400">5 đơn hàng mới nhất được ghi nhận cho bạn</p>
          </div>
          <Link
            href="/sale/orders"
            className="text-xs font-bold text-emerald-800 hover:text-emerald-950 inline-flex items-center gap-1"
          >
            <span>Xem tất cả</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {orders.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-gray-100 text-gray-400 font-semibold uppercase">
                  <th className="py-3 px-3">Mã đơn</th>
                  <th className="py-3 px-3">Khách hàng</th>
                  <th className="py-3 px-3">Hình thức nhận</th>
                  <th className="py-3 px-3">Tổng tiền</th>
                  <th className="py-3 px-3">Trạng thái</th>
                  <th className="py-3 px-3">Ngày đặt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.slice(0, 5).map((ord) => (
                  <tr key={ord.order_id} className="hover:bg-emerald-50/40 transition-colors">
                    <td className="py-3.5 px-3 font-mono font-bold text-emerald-950">
                      {ord.order_code}
                    </td>
                    <td className="py-3.5 px-3">
                      <span className="font-semibold text-gray-900 block">{ord.buyer_name}</span>
                      <span className="text-[11px] text-gray-500">{ord.buyer_phone}</span>
                    </td>
                    <td className="py-3.5 px-3 font-medium text-gray-600">
                      {ord.delivery_type === "home_delivery" ? "Giao tận nơi" : "Nhận tại điểm hẹn"}
                    </td>
                    <td className="py-3.5 px-3">
                      <MoneyDisplay amount={ord.final_amount} className="font-bold text-emerald-950" />
                    </td>
                    <td className="py-3.5 px-3">
                      <Badge variant={ord.order_status === "completed" ? "success" : "warning"}>
                        {ORDER_STATUS_LABELS[ord.order_status]}
                      </Badge>
                    </td>
                    <td className="py-3.5 px-3 text-gray-400 text-[11px]">
                      {new Date(ord.created_at).toLocaleDateString("vi-VN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12 px-4 rounded-2xl bg-gray-50 border border-dashed border-gray-200 space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-800 flex items-center justify-center mx-auto text-xl">
              🌱
            </div>
            <p className="text-xs font-semibold text-gray-600">
              Bạn chưa có đơn hàng nào được ghi nhận.
            </p>
            <p className="text-[11px] text-gray-400 max-w-sm mx-auto">
              Hãy chia sẻ liên kết bán hàng hoặc dùng tính năng &quot;Nhập đơn hộ&quot; khi có người quen muốn ủng hộ dự án!
            </p>
            <Link
              href="/sale/create-order"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#16381D] text-white text-xs font-bold hover:bg-[#234E2B] transition-colors"
            >
              <PackagePlus className="w-3.5 h-3.5" />
              <span>Tạo đơn đầu tiên ngay</span>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
