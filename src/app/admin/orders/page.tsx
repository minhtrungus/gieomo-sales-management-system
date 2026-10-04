"use client";

import { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { Badge } from "@/components/ui/Badge";
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS } from "@/lib/constants";
import {
  getStoredOrders,
  updateStoredOrderStatus,
  getStoredMembers,
  getAdminSession,
  type StoredMember,
  type AdminSession,
} from "@/lib/data/orderStore";
import type { Order, OrderStatus } from "@/types/database";
import { AdminSearchInput } from "@/components/admin/AdminSearchInput";
import {
  Plus,
  Filter,
  ArrowUpDown,
  Copy,
  Check,
  ShoppingBag,
  Users,
  UserCheck,
  ExternalLink,
  Sparkles,
  PackagePlus,
  Eye,
  Clock,
  CheckCircle2,
  ChevronRight,
  TrendingUp,
} from "lucide-react";

type OrderTab = "all" | "my_orders" | "by_btc";

function AdminOrdersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [orders, setOrders] = useState<Order[]>([]);
  const [members, setMembers] = useState<StoredMember[]>([]);
  const [session, setSession] = useState<AdminSession | null>(null);

  const queryTab = searchParams.get("tab") as OrderTab | null;
  const queryMember = searchParams.get("member") || searchParams.get("ref");

  const [activeTab, setActiveTab] = useState<OrderTab>(queryTab || "all");
  const [selectedBtcRef, setSelectedBtcRef] = useState<string | null>(queryMember || null);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [introducerFilter, setIntroducerFilter] = useState<string>("all");
  const [copiedAddressId, setCopiedAddressId] = useState<string | null>(null);
  const [copiedRefLink, setCopiedRefLink] = useState(false);

  useEffect(() => {
    if (queryTab && (queryTab === "all" || queryTab === "my_orders" || queryTab === "by_btc")) {
      setActiveTab(queryTab);
    }
    if (queryMember) {
      setSelectedBtcRef(queryMember);
      setActiveTab("by_btc");
    }
  }, [queryTab, queryMember]);

  useEffect(() => {
    setOrders(getStoredOrders());
    setMembers(getStoredMembers());
    setSession(getAdminSession());

    const handleOrdersUpdate = () => setOrders(getStoredOrders());
    const handleMembersUpdate = () => setMembers(getStoredMembers());
    const handleAuthChange = () => setSession(getAdminSession());

    window.addEventListener("gieomo_orders_updated", handleOrdersUpdate);
    window.addEventListener("gieomo_members_updated", handleMembersUpdate);
    window.addEventListener("gieomo_admin_auth_changed", handleAuthChange);

    return () => {
      window.removeEventListener("gieomo_orders_updated", handleOrdersUpdate);
      window.removeEventListener("gieomo_members_updated", handleMembersUpdate);
      window.removeEventListener("gieomo_admin_auth_changed", handleAuthChange);
    };
  }, []);

  const handleCopyAddress = (e: React.MouseEvent, ord: Order) => {
    e.stopPropagation();
    const addressParts = [
      ord.recipient_name
        ? `Người nhận: ${ord.recipient_name}`
        : ord.buyer_name
        ? `Người nhận: ${ord.buyer_name}`
        : null,
      ord.recipient_phone
        ? `SĐT: ${ord.recipient_phone}`
        : ord.buyer_phone
        ? `SĐT: ${ord.buyer_phone}`
        : null,
      ord.address_detail,
      ord.district,
      ord.province,
    ].filter(Boolean);
    const fullText = addressParts.join(" - ");
    navigator.clipboard.writeText(fullText);
    setCopiedAddressId(ord.order_id);
    setTimeout(() => setCopiedAddressId(null), 2000);
  };

  const origin = typeof window !== "undefined" ? window.location.origin : "https://gieomo.store";
  const myRefCode = session?.referralCode || "";
  const myRefUrl = myRefCode ? `${origin}/?ref=${myRefCode}` : "";

  const handleCopyMyRefLink = () => {
    if (!myRefUrl) return;
    navigator.clipboard.writeText(myRefUrl);
    setCopiedRefLink(true);
    setTimeout(() => setCopiedRefLink(false), 2000);
  };

  const [pendingStatusChange, setPendingStatusChange] = useState<{
    orderId: string;
    orderCode: string;
    newStatus: OrderStatus;
    buyerName: string;
  } | null>(null);

  const handleConfirmStatusChange = () => {
    if (!pendingStatusChange) return;
    updateStoredOrderStatus(pendingStatusChange.orderId, pendingStatusChange.newStatus);
    setOrders((prev) =>
      prev.map((o) =>
        o.order_id === pendingStatusChange.orderId
          ? {
              ...o,
              order_status: pendingStatusChange.newStatus,
              completed_at:
                pendingStatusChange.newStatus === "completed"
                  ? new Date().toISOString()
                  : o.completed_at,
            }
          : o
      )
    );
    setPendingStatusChange(null);
  };

  // Helper: Match an order with a member or current session
  const isOrderOfMember = useCallback(
    (ord: Order, mem: StoredMember | AdminSession | null) => {
      if (!mem) return false;
      const ref = mem.referralCode?.toLowerCase();
      const id = mem.memberId;
      const name = ("name" in mem ? mem.name : mem.fullName)?.toLowerCase();

      if (ref && ord.referral_code?.toLowerCase() === ref) return true;
      if (id && (ord.seller_id === id || ord.created_by_member_id === id)) return true;
      if (ref && ord.introducer_info?.toLowerCase().includes(ref)) return true;
      if (name && ord.introducer_info?.toLowerCase().includes(name)) return true;
      return false;
    },
    []
  );

  // 1. My personal orders
  const myOrders = useMemo(() => {
    if (!session) return [];
    return orders.filter((ord) => isOrderOfMember(ord, session));
  }, [orders, session, isOrderOfMember]);

  const myRevenue = useMemo(() => {
    return myOrders
      .filter((o) => o.order_status !== "cancelled")
      .reduce((sum, o) => sum + (o.final_amount || 0), 0);
  }, [myOrders]);

  const myCompletedCount = useMemo(() => {
    return myOrders.filter((o) => o.order_status === "completed").length;
  }, [myOrders]);

  const myPendingCount = useMemo(() => {
    return myOrders.filter(
      (o) => o.order_status !== "completed" && o.order_status !== "cancelled"
    ).length;
  }, [myOrders]);

  // 2. BTC members list and their individual stats
  const btcMembers = useMemo(() => {
    return members.filter(
      (m) => m.status === "active" && !m.fullName.includes("Trưởng ban cũ")
    );
  }, [members]);

  const btcStats = useMemo(() => {
    return btcMembers.map((m) => {
      const mOrders = orders.filter((ord) => isOrderOfMember(ord, m));
      const completedCount = mOrders.filter((o) => o.order_status === "completed").length;
      const pendingCount = mOrders.filter(
        (o) => o.order_status !== "completed" && o.order_status !== "cancelled"
      ).length;
      const revenue = mOrders
        .filter((o) => o.order_status !== "cancelled")
        .reduce((sum, o) => sum + (o.final_amount || 0), 0);
      return {
        member: m,
        orders: mOrders,
        totalOrders: mOrders.length,
        completedCount,
        pendingCount,
        revenue,
      };
    });
  }, [btcMembers, orders, isOrderOfMember]);

  // Base list depending on activeTab
  const baseTabOrders = useMemo(() => {
    if (activeTab === "my_orders") {
      return myOrders;
    }
    if (activeTab === "by_btc") {
      if (selectedBtcRef && selectedBtcRef !== "all") {
        const targetMember = btcMembers.find(
          (m) => m.referralCode?.toLowerCase() === selectedBtcRef.toLowerCase()
        );
        return targetMember ? orders.filter((o) => isOrderOfMember(o, targetMember)) : orders;
      }
      // If "all" in by_btc: show all orders associated with any BTC member
      return orders.filter((ord) => btcMembers.some((m) => isOrderOfMember(ord, m)));
    }
    return orders;
  }, [activeTab, myOrders, selectedBtcRef, btcMembers, orders, isOrderOfMember]);

  // Filtered by search & dropdown filters
  const filteredOrders = useMemo(() => {
    return baseTabOrders.filter((ord) => {
      if (statusFilter !== "all" && ord.order_status !== statusFilter) return false;

      // Introducer filter only active in 'all' tab
      if (activeTab === "all" && introducerFilter !== "all") {
        if (
          introducerFilter === "direct" &&
          ord.introducer_info &&
          ord.introducer_info !== "Trực tiếp (Website)"
        ) {
          return false;
        }
        if (introducerFilter !== "direct" && !ord.introducer_info?.includes(introducerFilter)) {
          return false;
        }
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchCode = ord.order_code.toLowerCase().includes(q);
        const matchName = (ord.buyer_name || "").toLowerCase().includes(q);
        const matchPhone = (ord.buyer_phone || "").includes(q);
        const matchIntro = (ord.introducer_info || "").toLowerCase().includes(q);
        if (!matchCode && !matchName && !matchPhone && !matchIntro) return false;
      }
      return true;
    });
  }, [baseTabOrders, statusFilter, introducerFilter, activeTab, searchQuery]);

  const selectedMemberObj = useMemo(() => {
    if (!selectedBtcRef || selectedBtcRef === "all") return null;
    return (
      btcMembers.find((m) => m.referralCode?.toLowerCase() === selectedBtcRef.toLowerCase()) ||
      null
    );
  }, [selectedBtcRef, btcMembers]);

  const formatDateTime = (iso: string) => {
    const d = new Date(iso);
    const time = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
    const date = d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
    return `${time} ${date}`;
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading font-extrabold text-2xl text-[#231B16]">
              Quản lý đơn hàng
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-[#BFE9C3] text-[#16381D] border border-[#9ed4a3]">
              Ban Tổ Chức
            </span>
          </div>
          <p className="text-xs text-[#7E7068] mt-0.5">
            Quản lý toàn bộ {orders.length} đơn hàng hệ thống, phân bổ theo từng thành viên BTC hoặc theo dõi đơn cá nhân.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/sale"
            className="px-4 py-2.5 rounded-full bg-[#EBF7EE] hover:bg-[#d8eedc] text-[#16381D] font-extrabold text-xs flex items-center gap-1.5 shadow-2xs transition-all border border-[#BFE9C3] active:scale-95 cursor-pointer"
            title="Mở cổng cá nhân để nhập đơn hộ hoặc lấy link giới thiệu của riêng bạn"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#2D6338]" />
            <span>🌱 Cổng cá nhân BTC</span>
          </Link>

          <Link
            href="/admin/orders/pos"
            className="px-4 py-2.5 rounded-full bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-xs flex items-center gap-1.5 shadow-xs transition-all border border-[#9ed4a3] active:scale-95 cursor-pointer"
          >
            <span>⚡ Bán tại sự kiện</span>
          </Link>

          <Link
            href="/admin/orders/create"
            className="px-4 py-2.5 rounded-full bg-white hover:bg-gray-50 text-[#5C4D44] font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-all border border-[#F0E5D8] active:scale-95 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>📝 Nhập đơn đặt hộ</span>
          </Link>
        </div>
      </div>

      {/* 3 Main Management Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#F0E5D8] pb-3">
        <button
          type="button"
          onClick={() => {
            setActiveTab("all");
            setSelectedBtcRef(null);
            router.replace("/admin/orders");
          }}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === "all"
              ? "bg-[#16381D] text-white shadow-xs"
              : "bg-white hover:bg-gray-100 text-[#5C4D44] border border-[#F0E5D8]"
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          <span>Tất cả đơn hệ thống</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
              activeTab === "all" ? "bg-[#BFE9C3] text-[#16381D]" : "bg-gray-100 text-gray-700"
            }`}
          >
            {orders.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("my_orders");
            setSelectedBtcRef(null);
            router.replace("/admin/orders?tab=my_orders");
          }}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === "my_orders"
              ? "bg-[#16381D] text-white shadow-xs"
              : "bg-white hover:bg-gray-100 text-[#5C4D44] border border-[#F0E5D8]"
          }`}
        >
          <span className="text-sm">🌱</span>
          <span>Đơn cá nhân của tôi (BTC)</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
              activeTab === "my_orders"
                ? "bg-[#BFE9C3] text-[#16381D]"
                : "bg-emerald-100 text-emerald-800"
            }`}
          >
            {myOrders.length} đơn
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("by_btc");
            if (!selectedBtcRef) setSelectedBtcRef("all");
            router.replace("/admin/orders?tab=by_btc");
          }}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === "by_btc"
              ? "bg-[#16381D] text-white shadow-xs"
              : "bg-white hover:bg-gray-100 text-[#5C4D44] border border-[#F0E5D8]"
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Quản lý theo từng thành viên BTC</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
              activeTab === "by_btc" ? "bg-[#BFE9C3] text-[#16381D]" : "bg-blue-100 text-blue-800"
            }`}
          >
            {btcMembers.length} thành viên
          </span>
        </button>
      </div>

      {/* TAB CONTENT: ĐƠN CÁ NHÂN CỦA TÔI */}
      {activeTab === "my_orders" && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Personal Banner */}
          <div className="bg-gradient-to-r from-[#16381D] via-[#1E4527] to-[#2B5435] rounded-3xl p-5 sm:p-6 text-white shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div className="space-y-1.5 max-w-xl">
              <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-white/10 text-[#BFE9C3] text-xs font-semibold">
                <UserCheck className="w-3.5 h-3.5" />
                <span>Khu Vực Cá Nhân Thành Viên BTC</span>
              </div>
              <h2 className="font-heading font-extrabold text-xl sm:text-2xl text-white">
                Đơn hàng của bạn, {session?.name || "Thành viên BTC"}! 🌱
              </h2>
              <p className="text-xs text-emerald-100/90 leading-relaxed">
                Theo dõi các đơn hàng được ghi nhận qua mã giới thiệu{" "}
                <span className="font-mono font-extrabold text-[#FFE7A8] bg-black/20 px-2 py-0.5 rounded-md">
                  {session?.referralCode || "Cá nhân"}
                </span>{" "}
                hoặc do chính bạn tạo hộ cho người quen.
              </p>
            </div>

            <div className="flex flex-wrap gap-2.5 shrink-0">
              {myRefCode && (
                <button
                  type="button"
                  onClick={handleCopyMyRefLink}
                  className="px-4 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs border border-white/20 flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  {copiedRefLink ? <Check className="w-3.5 h-3.5 text-[#BFE9C3]" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedRefLink ? "Đã sao chép link!" : "Chép link bán hàng của tôi"}</span>
                </button>
              )}

              <Link
                href="/sale"
                className="px-4 py-2.5 rounded-2xl bg-[#BFE9C3] text-[#16381D] font-extrabold text-xs hover:bg-[#aee0b3] shadow-xs flex items-center gap-1.5 transition-all"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Vào Cổng Sale cá nhân</span>
              </Link>
            </div>
          </div>

          {/* 4 Quick Stat Pills */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-xs space-y-1">
              <span className="text-[11px] font-bold text-gray-400 uppercase block">Đơn của tôi</span>
              <div className="text-2xl font-heading font-extrabold text-[#231B16]">
                {myOrders.length} <span className="text-xs font-semibold text-gray-400">đơn</span>
              </div>
            </div>

            <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-xs space-y-1">
              <span className="text-[11px] font-bold text-gray-400 uppercase block">Doanh số của tôi</span>
              <div className="text-2xl font-heading font-extrabold text-[#16381D]">
                <MoneyDisplay amount={myRevenue} />
              </div>
            </div>

            <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-xs space-y-1">
              <span className="text-[11px] font-bold text-gray-400 uppercase block">Đang xử lý / giao</span>
              <div className="text-2xl font-heading font-extrabold text-blue-700">
                {myPendingCount} <span className="text-xs font-semibold text-gray-400">đơn</span>
              </div>
            </div>

            <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-xs space-y-1">
              <span className="text-[11px] font-bold text-gray-400 uppercase block">Giao thành công</span>
              <div className="text-2xl font-heading font-extrabold text-emerald-800">
                {myCompletedCount} <span className="text-xs font-semibold text-gray-400">đơn</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: THEO TỪNG THÀNH VIÊN BTC */}
      {activeTab === "by_btc" && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="font-heading font-extrabold text-base text-[#231B16] flex items-center gap-2">
                <span>Phân Bổ Doanh Số & Đơn Hàng Từng Thành Viên BTC</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  {btcMembers.length} thành viên
                </span>
              </h2>
              <p className="text-xs text-gray-500">
                Nhấn chọn một thành viên BTC bên dưới để xem danh sách đơn hàng chi tiết của người đó.
              </p>
            </div>

            {selectedBtcRef && selectedBtcRef !== "all" && (
              <button
                type="button"
                onClick={() => setSelectedBtcRef("all")}
                className="text-xs font-bold text-emerald-800 hover:text-emerald-950 underline cursor-pointer"
              >
                ✕ Hủy chọn, xem tất cả BTC
              </button>
            )}
          </div>

          {/* BTC Member Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* Card "Tất cả BTC" */}
            <div
              onClick={() => setSelectedBtcRef("all")}
              className={`p-4 rounded-3xl border transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                selectedBtcRef === "all" || !selectedBtcRef
                  ? "bg-[#16381D] text-white border-[#16381D] shadow-md ring-2 ring-[#BFE9C3]"
                  : "bg-white text-gray-800 border-[#F0E5D8] hover:border-emerald-300 shadow-2xs"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider opacity-80">
                  Toàn bộ BTC
                </span>
                <span className="text-lg">👥</span>
              </div>
              <div>
                <div className="text-xl font-heading font-extrabold">
                  {btcStats.reduce((sum, s) => sum + s.totalOrders, 0)}{" "}
                  <span className="text-xs font-medium opacity-80">đơn</span>
                </div>
                <div className="text-xs font-bold mt-0.5 opacity-90">
                  <MoneyDisplay
                    amount={btcStats.reduce((sum, s) => sum + s.revenue, 0)}
                  />
                </div>
              </div>
              <div className="text-[11px] opacity-75 pt-2 border-t border-white/20">
                Xem toàn bộ đơn do BTC mang lại
              </div>
            </div>

            {/* Individual BTC Member Cards */}
            {btcStats.map((item) => {
              const isSelected =
                selectedBtcRef?.toLowerCase() === item.member.referralCode?.toLowerCase();
              return (
                <div
                  key={item.member.memberId}
                  onClick={() => setSelectedBtcRef(item.member.referralCode)}
                  className={`p-4 rounded-3xl border transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                    isSelected
                      ? "bg-[#EBF7EE] text-[#16381D] border-[#2D6338] shadow-md ring-2 ring-[#2D6338]"
                      : "bg-white text-gray-800 border-[#F0E5D8] hover:border-emerald-300 shadow-2xs"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-heading font-extrabold text-sm block truncate text-gray-900">
                        {item.member.fullName}
                      </span>
                      <span className="text-[10px] font-mono text-emerald-800 font-bold bg-[#EAF7ED] px-1.5 py-0.2 rounded border border-[#BFE9C3]">
                        {item.member.referralCode}
                      </span>
                    </div>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                        item.member.role === "admin"
                          ? "bg-amber-100 text-amber-900"
                          : "bg-blue-100 text-blue-900"
                      }`}
                    >
                      {item.member.role === "admin" ? "Admin" : "BTC Sale"}
                    </span>
                  </div>

                  <div>
                    <div className="text-xl font-heading font-extrabold text-gray-900">
                      {item.totalOrders}{" "}
                      <span className="text-xs font-semibold text-gray-400">đơn</span>
                    </div>
                    <div className="text-xs font-extrabold text-[#16381D]">
                      <MoneyDisplay amount={item.revenue} />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-gray-500 pt-2 border-t border-gray-100">
                    <span className="text-emerald-700 font-semibold">
                      ✓ {item.completedCount} đã giao
                    </span>
                    <span className="text-blue-700 font-semibold">
                      ⟳ {item.pendingCount} đang xử lý
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Active selection banner */}
          {selectedMemberObj && (
            <div className="p-3.5 rounded-2xl bg-[#EAF7ED] border border-[#BFE9C3] flex items-center justify-between text-xs text-[#16381D]">
              <div className="flex items-center gap-2">
                <span className="text-base">📌</span>
                <span>
                  Đang lọc danh sách đơn hàng của:{" "}
                  <strong>{selectedMemberObj.fullName}</strong> (Mã giới thiệu:{" "}
                  <code className="font-mono font-bold bg-white px-1.5 py-0.5 rounded border border-[#BFE9C3]">
                    {selectedMemberObj.referralCode}
                  </code>
                  ) — <strong>{filteredOrders.length} đơn</strong>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBtcRef("all")}
                className="font-bold underline text-xs text-[#16381D] hover:text-black cursor-pointer"
              >
                Xem tất cả BTC
              </button>
            </div>
          )}
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="bg-white rounded-3xl p-4 border border-[#F0E5D8] shadow-soft flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="w-full md:w-80">
          <AdminSearchInput
            placeholder="Tìm mã đơn, tên khách, số điện thoại..."
            onSearch={setSearchQuery}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Lọc theo Quen qua ai (chỉ hiện khi ở tab Tất cả đơn hệ thống) */}
          {activeTab === "all" && (
            <div className="flex items-center gap-1 bg-[#FFFDF9] border border-[#F0E5D8] rounded-2xl px-3 py-1.5 text-xs">
              <span className="text-[#7E7068] font-bold whitespace-nowrap">Quen qua:</span>
              <select
                value={introducerFilter}
                onChange={(e) => setIntroducerFilter(e.target.value)}
                className="bg-transparent font-extrabold text-[#1B3622] outline-none cursor-pointer"
              >
                <option value="all">Tất cả nguồn đơn</option>
                {members.map((m) => (
                  <option key={m.memberId} value={m.referralCode}>
                    {m.fullName} ({m.referralCode})
                  </option>
                ))}
                <option value="direct">Trực tiếp qua Web</option>
              </select>
            </div>
          )}

          {/* Lọc theo Trạng thái */}
          <div className="flex items-center gap-1.5 bg-[#FFFDF9] border border-[#F0E5D8] rounded-2xl px-3 py-1.5 text-xs">
            <Filter className="w-3.5 h-3.5 text-[#A89B92]" />
            <span className="text-[#7E7068] font-medium whitespace-nowrap">Trạng thái:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent font-bold text-[#342A24] outline-none cursor-pointer"
            >
              <option value="all">Tất cả trạng thái ({baseTabOrders.length})</option>
              <option value="pending">Chờ xác nhận</option>
              <option value="confirmed">Đã xác nhận</option>
              <option value="processing">Đang chuẩn bị</option>
              <option value="shipping">Đang giao</option>
              <option value="completed">Hoàn thành</option>
              <option value="cancelled">Đã hủy</option>
            </select>
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-3xl border border-[#F0E5D8] shadow-soft overflow-hidden">
        <div className="sm:hidden px-3 pt-2 text-[10px] text-[#A89B92] italic flex items-center gap-1">
          <span>↔</span> <span>Vuốt sang ngang để xem đầy đủ các cột</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-[11px]">
            <thead>
              <tr className="bg-[#FFF8EE] border-b border-[#F0E5D8] text-[#7E7068] font-bold uppercase tracking-wider text-[10px]">
                <th className="py-2.5 px-2.5 text-center w-10 whitespace-nowrap">STT</th>
                <th className="py-2.5 px-2.5 whitespace-nowrap">Mã đơn</th>
                <th className="py-2.5 px-2.5 whitespace-nowrap">Thời gian đặt</th>
                <th className="py-2.5 px-2.5 whitespace-nowrap">Khách hàng</th>
                <th className="py-2.5 px-2.5 whitespace-nowrap">Quen qua ai (BTC)</th>
                <th className="py-2.5 px-2.5 whitespace-nowrap">
                  <span className="flex items-center gap-1">
                    <span>Địa điểm nhận</span>
                    <span className="text-[9px] font-normal normal-case text-emerald-700 bg-emerald-100 px-1 rounded">
                      (Bấm chép)
                    </span>
                  </span>
                </th>
                <th className="py-2.5 px-2.5 whitespace-nowrap">Tổng tiền</th>
                <th className="py-2.5 px-2.5 whitespace-nowrap">Thanh toán</th>
                <th className="py-2.5 px-2.5 whitespace-nowrap">Trạng thái</th>
                <th className="py-2.5 px-2.5 whitespace-nowrap">Thời gian giao</th>
                <th className="py-2.5 px-2.5 text-right whitespace-nowrap">Đổi trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0E5D8]">
              {filteredOrders.length > 0 ? (
                filteredOrders.map((ord, idx) => (
                  <tr key={ord.order_id} className="hover:bg-[#FFFDF9] transition-colors">
                    <td className="py-2.5 px-2.5 text-center text-[#7E7068] font-bold text-[11px]">
                      {idx + 1}
                    </td>

                    <td className="py-2.5 px-2.5 font-mono font-bold text-[#1B3622] whitespace-nowrap">
                      <Link
                        href={`/admin/orders/${ord.order_id}`}
                        className="hover:underline flex items-center gap-1"
                      >
                        <span>{ord.order_code}</span>
                        <ChevronRight className="w-3 h-3 text-gray-400" />
                      </Link>
                    </td>

                    <td className="py-2.5 px-2.5 text-[#7E7068] font-medium whitespace-nowrap text-[10.5px]">
                      {formatDateTime(ord.created_at)}
                    </td>

                    <td className="py-2.5 px-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-gray-900 block text-xs">
                          {ord.buyer_name || "Khách tại quầy"}
                        </span>
                        {ord.source_type === "event_sale" && (
                          <span className="px-1.5 py-0.2 rounded-md bg-amber-100 text-amber-900 font-extrabold text-[9px] border border-amber-300">
                            ⚡ Sự kiện
                          </span>
                        )}
                        {ord.source_type === "admin_manual" && (
                          <span className="px-1.5 py-0.2 rounded-md bg-blue-100 text-blue-900 font-extrabold text-[9px] border border-blue-200">
                            📝 Đặt hộ
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-gray-500 font-mono">
                        {ord.buyer_phone || (ord.source_type === "event_sale" ? "Mua tại quầy" : "—")}
                      </span>
                    </td>

                    <td className="py-2.5 px-2.5 whitespace-nowrap">
                      {ord.introducer_info ? (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${
                            ord.introducer_info.includes("LAN")
                              ? "bg-[#BFE9C3]/50 text-[#16381D] border-[#9ed4a3]"
                              : ord.introducer_info.includes("QUANG")
                              ? "bg-[#CFE8FF]/60 text-[#133A63] border-[#b2d9ff]"
                              : ord.introducer_info.includes("ADMIN")
                              ? "bg-[#FFE7A8]/70 text-[#542B07] border-[#ebd089]"
                              : "bg-gray-100 text-gray-700 border-gray-200"
                          }`}
                        >
                          <span>🌱</span>
                          <span className="truncate max-w-[120px]">{ord.introducer_info}</span>
                        </span>
                      ) : (
                        <span className="text-[#A89B92] italic text-[10px]">Trực tiếp (Website)</span>
                      )}
                    </td>

                    <td className="py-2.5 px-2.5 max-w-[170px]">
                      {ord.source_type === "event_sale" ? (
                        <div className="p-1 text-[10.5px] font-semibold text-emerald-800 bg-emerald-50 rounded-lg border border-emerald-200">
                          ⚡ Giao tại chỗ (Sự kiện)
                        </div>
                      ) : (
                        <div
                          onClick={(e) => handleCopyAddress(e, ord)}
                          className="group/addr cursor-pointer p-1 -m-1 rounded-lg hover:bg-[#FFF8EE] border border-transparent hover:border-[#ebd089] transition-all"
                          title="Nhấn để sao chép thông tin người nhận & địa chỉ giao hàng"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-bold text-gray-800 text-[10px] block">
                              {ord.delivery_type === "home_delivery"
                                ? "🏠 Giao tận nơi"
                                : "📍 Điểm nhận"}
                            </span>
                            {copiedAddressId === ord.order_id ? (
                              <span className="inline-flex items-center gap-0.5 text-[9px] font-extrabold text-[#16381D] bg-[#BFE9C3] px-1 py-0.2 rounded border border-[#9ed4a3]">
                                <Check className="w-2.5 h-2.5" /> Đã chép
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-0.5 text-[9px] text-[#7E7068] group-hover/addr:text-[#2D6338] bg-gray-50 group-hover/addr:bg-emerald-50 px-1 py-0.2 rounded border border-gray-200 group-hover/addr:border-emerald-200 transition-colors">
                                <Copy className="w-2.5 h-2.5" /> Chép
                              </span>
                            )}
                          </div>
                          <span
                            className="text-[10.5px] text-gray-600 truncate block mt-0.5"
                            title={`${ord.address_detail || ""}, ${ord.province || ""}`}
                          >
                            {ord.address_detail || "—"}
                          </span>
                        </div>
                      )}
                    </td>

                    <td className="py-2.5 px-2.5 whitespace-nowrap">
                      <MoneyDisplay
                        amount={ord.final_amount}
                        className="font-bold text-[#1B3622] text-xs"
                      />
                    </td>

                    <td className="py-2.5 px-2.5 whitespace-nowrap">
                      <Badge
                        variant={ord.payment_status === "paid" ? "success" : "warning"}
                        className="text-[10px] px-2 py-0.5"
                      >
                        {PAYMENT_STATUS_LABELS[ord.payment_status]}
                      </Badge>
                    </td>

                    <td className="py-2.5 px-2.5 whitespace-nowrap">
                      <Badge
                        variant={
                          ord.order_status === "completed"
                            ? "success"
                            : ord.order_status === "cancelled"
                            ? "default"
                            : "warning"
                        }
                        className="text-[10px] px-2 py-0.5"
                      >
                        {ORDER_STATUS_LABELS[ord.order_status]}
                      </Badge>
                    </td>

                    <td className="py-2.5 px-2.5 text-[#7E7068] font-medium whitespace-nowrap text-[10.5px]">
                      {ord.completed_at ? (
                        formatDateTime(ord.completed_at)
                      ) : (
                        <span className="text-[#A89B92] italic">Chưa giao</span>
                      )}
                    </td>

                    <td className="py-2.5 px-2.5 text-right whitespace-nowrap">
                      <select
                        value={ord.order_status}
                        onChange={(e) =>
                          setPendingStatusChange({
                            orderId: ord.order_id,
                            orderCode: ord.order_code,
                            newStatus: e.target.value as OrderStatus,
                            buyerName: ord.buyer_name || "Khách",
                          })
                        }
                        className="text-[10px] font-bold py-1 px-2 rounded-xl border border-[#F0E5D8] bg-[#FFFDF9] text-[#342A24] outline-none hover:border-[#16381D] cursor-pointer"
                      >
                        <option value="pending">Chờ xác nhận</option>
                        <option value="confirmed">Đã xác nhận</option>
                        <option value="processing">Đang chuẩn bị</option>
                        <option value="shipping">Đang giao hàng</option>
                        <option value="completed">Đã hoàn thành</option>
                        <option value="cancelled">Đã hủy đơn</option>
                      </select>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-gray-500 font-medium">
                    <div className="w-12 h-12 rounded-full bg-gray-50 text-gray-400 flex items-center justify-center mx-auto text-xl mb-2">
                      📦
                    </div>
                    <span className="font-bold text-gray-700 block">
                      Không tìm thấy đơn hàng nào phù hợp.
                    </span>
                    <span className="text-xs text-gray-400 block mt-1">
                      {activeTab === "my_orders"
                        ? "Bạn chưa có đơn hàng nào được ghi nhận cho tài khoản cá nhân này."
                        : "Thử thay đổi điều kiện tìm kiếm hoặc bộ lọc trạng thái."}
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: XÁC NHẬN CHUYỂN TRẠNG THÁI ĐƠN HÀNG */}
      {pendingStatusChange && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 animate-in fade-in"
          style={{ willChange: "opacity" }}
        >
          <div
            className="w-full max-w-sm bg-white rounded-3xl p-6 border border-[#F0E5D8] shadow-2xl space-y-4 animate-in zoom-in-95 text-center"
            style={{ willChange: "transform, opacity", transform: "translateZ(0)" }}
          >
            <div className="w-12 h-12 rounded-2xl bg-[#FFE7A8] text-[#542B07] flex items-center justify-center mx-auto">
              <ArrowUpDown className="w-6 h-6 text-[#E2884E]" />
            </div>

            <div className="space-y-1.5">
              <h3 className="font-heading font-extrabold text-base text-[#231B16]">
                Xác nhận đổi trạng thái đơn hàng?
              </h3>
              <p className="text-xs text-[#7E7068] leading-relaxed">
                Chuyển đơn hàng <strong>{pendingStatusChange.orderCode}</strong> của{" "}
                <strong>{pendingStatusChange.buyerName}</strong> sang trạng thái:
              </p>
              <div className="pt-1">
                <span className="inline-block px-3 py-1 rounded-full bg-[#BFE9C3] text-[#16381D] font-extrabold text-xs">
                  {ORDER_STATUS_LABELS[pendingStatusChange.newStatus]}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2.5 pt-2">
              <button
                onClick={() => setPendingStatusChange(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleConfirmStatusChange}
                className="px-5 py-2.5 rounded-full bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-xs shadow-xs border border-[#9ed4a3] transition-all cursor-pointer"
              >
                Xác nhận đổi ➔
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminOrdersPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[50vh] flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 rounded-full border-2 border-emerald-600 border-t-transparent animate-spin" />
            <span className="text-xs font-semibold text-gray-500">Đang tải danh sách đơn hàng...</span>
          </div>
        </div>
      }
    >
      <AdminOrdersContent />
    </Suspense>
  );
}
