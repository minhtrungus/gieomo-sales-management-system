"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Scale,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  PackageCheck,
  PackageX,
  CreditCard,
  ShoppingBag,
  Boxes,
  HelpCircle,
  Eye,
  X,
  Download,
  Filter,
} from "lucide-react";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { Badge } from "@/components/ui/Badge";
import type {
  ReconciliationRecord,
  ReconciliationSummary,
  ReconciliationStatus,
} from "@/lib/services/reconciliationService";

export default function AdminReconciliationPage() {
  const [records, setRecords] = useState<ReconciliationRecord[]>([]);
  const [summary, setSummary] = useState<ReconciliationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "action_required" | ReconciliationStatus>("all");
  const [selectedRecord, setSelectedRecord] = useState<ReconciliationRecord | null>(null);
  const [dateRange, setDateRange] = useState({ start: "", end: "" });

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      if (activeTab === "action_required") {
        params.set("action_required", "true");
      } else if (activeTab !== "all") {
        params.set("reconciliation_status", activeTab);
      }
      if (dateRange.start) params.set("start_date", dateRange.start);
      if (dateRange.end) params.set("end_date", dateRange.end);

      const res = await fetch(`/api/admin/reconciliation?${params.toString()}`);
      if (res.status === 401) {
        throw new Error("Phiên làm việc đã hết hạn hoặc chưa đăng nhập. Vui lòng đăng nhập lại!");
      }
      if (res.status === 403) {
        throw new Error("Bạn không có quyền truy cập dữ liệu đối soát (Yêu cầu tài khoản Quản trị viên).");
      }
      if (!res.ok) {
        throw new Error(`Lỗi máy chủ (${res.status}) khi tải dữ liệu đối soát.`);
      }
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Không thể tải dữ liệu đối soát");
      }

      setRecords(Array.isArray(data?.records) ? data.records : []);
      setSummary(data?.summary || null);
    } catch (err: any) {
      console.error("[Reconciliation UI] Fetch error:", err);
      setError(err?.message || "Lỗi tải dữ liệu");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [searchQuery, activeTab, dateRange]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    fetchData();
  };

  const getStatusBadge = (status: ReconciliationStatus) => {
    switch (status) {
      case "OK":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Khớp chuẩn (OK)
          </span>
        );
      case "UNPAID":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-700 border border-gray-300">
            <Clock className="w-3.5 h-3.5 text-gray-500" />
            Chưa thanh toán
          </span>
        );
      case "UNDERPAID":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
            <TrendingDown className="w-3.5 h-3.5 text-rose-600" />
            Thiếu tiền
          </span>
        );
      case "OVERPAID":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
            <TrendingUp className="w-3.5 h-3.5 text-amber-600" />
            Dư tiền
          </span>
        );
      case "PAYMENT_MISMATCH":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-300">
            <AlertTriangle className="w-3.5 h-3.5 text-purple-600" />
            Lệch giao dịch
          </span>
        );
      case "INVENTORY_MISMATCH":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-300">
            <PackageX className="w-3.5 h-3.5 text-red-600" />
            Lệch tồn kho
          </span>
        );
      case "NEEDS_REVIEW":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-800 border border-yellow-300">
            <HelpCircle className="w-3.5 h-3.5 text-yellow-600" />
            Cần xem xét
          </span>
        );
      default:
        return <Badge variant="default">{status}</Badge>;
    }
  };

  const getInventoryBadge = (status: "OK" | "MISMATCH" | "UNVERIFIED") => {
    switch (status) {
      case "OK":
        return (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
            <PackageCheck className="w-3.5 h-3.5 text-emerald-600" /> Khớp kho
          </span>
        );
      case "MISMATCH":
        return (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded">
            <PackageX className="w-3.5 h-3.5 text-red-600" /> Lệch kho
          </span>
        );
      case "UNVERIFIED":
        return (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Chưa đối chiếu
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-50 rounded-xl text-emerald-700">
              <Scale className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold font-heading text-gray-900 tracking-tight">
                Đối Soát 3 Chiều (Orders ↔ Payments ↔ Inventory)
              </h1>
              <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
                Kiểm chứng tính toàn vẹn và khớp lệnh giữa Đơn hàng, Giao dịch VietQR SePay và Trừ tồn kho.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 transition active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Orders */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Tổng đơn hàng
              </span>
              <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                <ShoppingBag className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-2xl font-bold text-gray-900 font-heading">
                {summary.total_orders.toLocaleString("vi-VN")}
              </span>
              <span className="text-xs text-gray-500 font-medium">đơn ghi nhận</span>
            </div>
          </div>

          {/* Card 2: Expected Revenue */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Doanh thu kỳ vọng
              </span>
              <div className="p-2 rounded-xl bg-purple-50 text-purple-600">
                <CreditCard className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-2xl font-bold text-gray-900 font-heading">
                {summary.total_expected_revenue.toLocaleString("vi-VN")}đ
              </span>
            </div>
          </div>

          {/* Card 3: Paid Revenue */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Thực nhận ngân hàng
              </span>
              <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-2xl font-bold text-emerald-700 font-heading">
                {summary.total_paid_revenue.toLocaleString("vi-VN")}đ
              </span>
            </div>
          </div>

          {/* Card 4: Action Required */}
          <div className="bg-white p-5 rounded-2xl border border-rose-200 shadow-xs bg-rose-50/20">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-rose-700">
                Cần xử lý ngay
              </span>
              <div className="p-2 rounded-xl bg-rose-100 text-rose-600">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-2xl font-bold text-rose-700 font-heading">
                {summary.status_counts.action_required_total.toLocaleString("vi-VN")}
              </span>
              <span className="text-xs text-rose-600 font-semibold">
                {summary.status_counts.underpaid} thiếu / {summary.status_counts.overpaid} dư
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Filter Tabs & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs space-y-4">
        {/* Status Tab Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          <button
            onClick={() => setActiveTab("all")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              activeTab === "all"
                ? "bg-gray-900 text-white shadow-xs"
                : "bg-gray-100 hover:bg-gray-200 text-gray-700"
            }`}
          >
            Tất cả ({summary?.total_orders || 0})
          </button>

          <button
            onClick={() => setActiveTab("action_required")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              activeTab === "action_required"
                ? "bg-rose-700 text-white shadow-xs"
                : "bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200"
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Cần xử lý ({summary?.status_counts.action_required_total || 0})
          </button>

          <button
            onClick={() => setActiveTab("OK")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              activeTab === "OK"
                ? "bg-emerald-700 text-white shadow-xs"
                : "bg-emerald-50 hover:bg-emerald-100 text-emerald-800"
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Khớp chuẩn ({summary?.status_counts.ok || 0})
          </button>

          <button
            onClick={() => setActiveTab("UNPAID")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              activeTab === "UNPAID"
                ? "bg-gray-700 text-white shadow-xs"
                : "bg-gray-100 hover:bg-gray-200 text-gray-700"
            }`}
          >
            Chưa thanh toán ({summary?.status_counts.unpaid || 0})
          </button>

          <button
            onClick={() => setActiveTab("UNDERPAID")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              activeTab === "UNDERPAID"
                ? "bg-rose-700 text-white shadow-xs"
                : "bg-rose-50 hover:bg-rose-100 text-rose-800"
            }`}
          >
            Thiếu tiền ({summary?.status_counts.underpaid || 0})
          </button>

          <button
            onClick={() => setActiveTab("OVERPAID")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              activeTab === "OVERPAID"
                ? "bg-amber-700 text-white shadow-xs"
                : "bg-amber-50 hover:bg-amber-100 text-amber-800"
            }`}
          >
            Dư tiền ({summary?.status_counts.overpaid || 0})
          </button>

          <button
            onClick={() => setActiveTab("PAYMENT_MISMATCH")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              activeTab === "PAYMENT_MISMATCH"
                ? "bg-purple-700 text-white shadow-xs"
                : "bg-purple-50 hover:bg-purple-100 text-purple-800"
            }`}
          >
            Lệch giao dịch ({summary?.status_counts.payment_mismatch || 0})
          </button>

          <button
            onClick={() => setActiveTab("INVENTORY_MISMATCH")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              activeTab === "INVENTORY_MISMATCH"
                ? "bg-red-700 text-white shadow-xs"
                : "bg-red-50 hover:bg-red-100 text-red-800"
            }`}
          >
            Lệch tồn kho ({summary?.status_counts.inventory_mismatch || 0})
          </button>

          <button
            onClick={() => setActiveTab("NEEDS_REVIEW")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              activeTab === "NEEDS_REVIEW"
                ? "bg-yellow-700 text-white shadow-xs"
                : "bg-yellow-50 hover:bg-yellow-100 text-yellow-800"
            }`}
          >
            Cần xem xét ({summary?.status_counts.needs_review || 0})
          </button>
        </div>

        {/* Search Input */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Tìm theo Mã đơn (GM-...), Mã GD ngân hàng, Tên khách hoặc SĐT..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Reconciliation Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="inline-block w-8 h-8 rounded-full border-2 border-emerald-600 border-t-transparent animate-spin mb-3" />
            <p className="text-sm font-medium text-gray-500">Đang đối soát dữ liệu 3 chiều...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-rose-600">
            <AlertTriangle className="w-8 h-8 mx-auto mb-2" />
            <p className="font-semibold">{error}</p>
          </div>
        ) : records.length === 0 ? (
          <div className="p-12 text-center">
            <Scale className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-gray-700">Không tìm thấy đơn hàng phù hợp</h3>
            <p className="text-xs text-gray-500 mt-1">Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50/80 text-gray-600 text-xs font-semibold uppercase tracking-wider border-b border-gray-200">
                <tr>
                  <th className="px-5 py-3.5">Mã đơn & Ngày tạo</th>
                  <th className="px-4 py-3.5">Khách hàng</th>
                  <th className="px-4 py-3.5 text-right">Tiền đơn</th>
                  <th className="px-4 py-3.5 text-right">Đã thanh toán</th>
                  <th className="px-4 py-3.5 text-right">Chênh lệch</th>
                  <th className="px-4 py-3.5 text-center">Tồn kho</th>
                  <th className="px-5 py-3.5">Kết quả Đối soát 3 Chiều</th>
                  <th className="px-4 py-3.5 text-center">Chi tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {records.map((r) => {
                  const hasProblem = r.reconciliation_status !== "OK";
                  return (
                    <tr
                      key={r.order_id}
                      onClick={() => setSelectedRecord(r)}
                      className={`hover:bg-gray-50/80 transition cursor-pointer ${
                        hasProblem ? "bg-rose-50/10" : ""
                      }`}
                    >
                      {/* Column 1: Order Code */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="font-bold text-gray-900 font-mono tracking-tight text-sm">
                          #{r.order_code}
                        </div>
                        <div className="text-[11px] text-gray-400 mt-0.5">
                          {new Date(r.created_at).toLocaleString("vi-VN", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </td>

                      {/* Column 2: Customer */}
                      <td className="px-4 py-4">
                        <div className="font-semibold text-gray-900 truncate max-w-[140px]">
                          {r.receiver_name}
                        </div>
                        <div className="text-xs text-gray-500 font-mono">{r.receiver_phone}</div>
                      </td>

                      {/* Column 3: Expected Amount */}
                      <td className="px-4 py-4 text-right font-medium text-gray-900 whitespace-nowrap">
                        {r.expected_amount.toLocaleString("vi-VN")}đ
                      </td>

                      {/* Column 4: Paid Amount */}
                      <td className="px-4 py-4 text-right whitespace-nowrap">
                        <span
                          className={`font-bold ${
                            r.paid_amount >= r.expected_amount
                              ? "text-emerald-700"
                              : r.paid_amount > 0
                              ? "text-rose-600"
                              : "text-gray-400"
                          }`}
                        >
                          {r.paid_amount.toLocaleString("vi-VN")}đ
                        </span>
                        {r.payments_count > 1 && (
                          <span className="block text-[10px] text-gray-400 font-medium">
                            ({r.payments_count} GD)
                          </span>
                        )}
                      </td>

                      {/* Column 5: Difference */}
                      <td className="px-4 py-4 text-right whitespace-nowrap">
                        {r.payment_difference === 0 ? (
                          <span className="text-xs text-gray-400 font-mono">0đ</span>
                        ) : r.payment_difference > 0 ? (
                          <span className="text-xs font-bold text-amber-700 font-mono bg-amber-50 px-2 py-0.5 rounded">
                            +{r.payment_difference.toLocaleString("vi-VN")}đ
                          </span>
                        ) : (
                          <span className="text-xs font-bold text-rose-700 font-mono bg-rose-50 px-2 py-0.5 rounded">
                            {r.payment_difference.toLocaleString("vi-VN")}đ
                          </span>
                        )}
                      </td>

                      {/* Column 6: Inventory Status */}
                      <td className="px-4 py-4 text-center whitespace-nowrap">
                        {getInventoryBadge(r.inventory_status)}
                      </td>

                      {/* Column 7: 3-Way Reconciliation Status */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        {getStatusBadge(r.reconciliation_status)}
                      </td>

                      {/* Column 8: Action button */}
                      <td className="px-4 py-4 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRecord(r);
                          }}
                          className="p-1.5 hover:bg-emerald-50 text-gray-400 hover:text-emerald-700 rounded-lg transition cursor-pointer"
                          title="Xem chi tiết đối soát"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Breakdown Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-gray-200">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-200 flex items-center justify-between bg-gray-50/80">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
                  <Scale className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-gray-900 font-heading">
                      Chi Tiết Đối Soát Đơn #{selectedRecord.order_code}
                    </h3>
                    {getStatusBadge(selectedRecord.reconciliation_status)}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Tạo lúc {new Date(selectedRecord.created_at).toLocaleString("vi-VN")}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedRecord(null)}
                className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded-full transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body - 3 Column Layout */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Verdict Banner */}
              <div
                className={`p-4 rounded-2xl border ${
                  selectedRecord.reconciliation_status === "OK"
                    ? "bg-emerald-50/60 border-emerald-200 text-emerald-900"
                    : selectedRecord.reconciliation_status === "UNDERPAID"
                    ? "bg-rose-50 border-rose-200 text-rose-900"
                    : selectedRecord.reconciliation_status === "OVERPAID"
                    ? "bg-amber-50 border-amber-200 text-amber-900"
                    : "bg-purple-50 border-purple-200 text-purple-900"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="shrink-0 mt-0.5">
                    {selectedRecord.reconciliation_status === "OK" ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-rose-600" />
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm font-bold">
                      {selectedRecord.reconciliation_reason}
                    </div>
                    {selectedRecord.action_recommended && (
                      <div className="text-xs font-medium opacity-90">
                        👉 <strong>Khuyến nghị xử lý:</strong> {selectedRecord.action_recommended}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 3 Pillars of Reconciliation */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* Pillar 1: ORDER */}
                <div className="p-4 rounded-2xl border border-gray-200 bg-gray-50/50 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-600 pb-2 border-b border-gray-200">
                    <ShoppingBag className="w-4 h-4 text-blue-600" />
                    1. Đơn Hàng (Order)
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Khách hàng:</span>
                      <span className="font-bold text-gray-900">{selectedRecord.receiver_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Số điện thoại:</span>
                      <span className="font-mono text-gray-900">{selectedRecord.receiver_phone}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Trạng thái đơn:</span>
                      <Badge variant="default">{selectedRecord.order_status}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Trạng thái thanh toán:</span>
                      <Badge
                        variant={selectedRecord.payment_status === "paid" ? "success" : "warning"}
                      >
                        {selectedRecord.payment_status}
                      </Badge>
                    </div>

                    <div className="pt-2 border-t border-gray-200 space-y-1">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Tạm tính:</span>
                        <span>{selectedRecord.subtotal.toLocaleString("vi-VN")}đ</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Giảm giá:</span>
                        <span className="text-rose-600">
                          -{selectedRecord.voucher_discount.toLocaleString("vi-VN")}đ
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Phí vận chuyển:</span>
                        <span>+{selectedRecord.shipping_fee.toLocaleString("vi-VN")}đ</span>
                      </div>
                      <div className="flex justify-between text-sm font-bold text-gray-900 pt-1 border-t border-gray-200">
                        <span>Tổng tiền đơn:</span>
                        <span className="text-blue-700">
                          {selectedRecord.expected_amount.toLocaleString("vi-VN")}đ
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Pillar 2: PAYMENT */}
                <div className="p-4 rounded-2xl border border-gray-200 bg-gray-50/50 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-600 pb-2 border-b border-gray-200">
                    <CreditCard className="w-4 h-4 text-emerald-600" />
                    2. Thanh Toán (Payment)
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Tổng tiền đã nhận:</span>
                      <span className="font-bold text-emerald-700 text-sm">
                        {selectedRecord.paid_amount.toLocaleString("vi-VN")}đ
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-gray-500">Chênh lệch:</span>
                      <span
                        className={`font-bold font-mono ${
                          selectedRecord.payment_difference === 0
                            ? "text-gray-700"
                            : selectedRecord.payment_difference > 0
                            ? "text-amber-700"
                            : "text-rose-700"
                        }`}
                      >
                        {selectedRecord.payment_difference > 0 ? "+" : ""}
                        {selectedRecord.payment_difference.toLocaleString("vi-VN")}đ
                      </span>
                    </div>

                    <div className="pt-2 border-t border-gray-200 space-y-2">
                      <span className="text-[11px] font-bold text-gray-500 block uppercase">
                        Lịch sử giao dịch ({selectedRecord.payments.length}):
                      </span>

                      {selectedRecord.payments.length === 0 ? (
                        <p className="text-[11px] text-gray-400 italic">Chưa có giao dịch nào được ghi nhận.</p>
                      ) : (
                        selectedRecord.payments.map((p, idx) => (
                          <div
                            key={p.payment_id || idx}
                            className="p-2 bg-white rounded-xl border border-gray-200 space-y-0.5 text-[11px]"
                          >
                            <div className="flex justify-between font-bold text-gray-900">
                              <span>Mã GD: {p.transaction_code || "N/A"}</span>
                              <span className="text-emerald-700">
                                {p.amount.toLocaleString("vi-VN")}đ
                              </span>
                            </div>
                            <div className="flex justify-between text-gray-400 text-[10px]">
                              <span>{p.payment_method}</span>
                              <span>{new Date(p.created_at).toLocaleTimeString("vi-VN")}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* Pillar 3: INVENTORY */}
                <div className="p-4 rounded-2xl border border-gray-200 bg-gray-50/50 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-600 pb-2 border-b border-gray-200">
                    <Boxes className="w-4 h-4 text-purple-600" />
                    3. Tồn Kho (Inventory)
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500">Đánh giá chung:</span>
                      {getInventoryBadge(selectedRecord.inventory_status)}
                    </div>

                    <div className="pt-2 border-t border-gray-200 space-y-2">
                      <span className="text-[11px] font-bold text-gray-500 block uppercase">
                        Sản phẩm đã đặt ({selectedRecord.items.length}):
                      </span>

                      {selectedRecord.items.map((it) => (
                        <div
                          key={it.order_item_id}
                          className="p-2 bg-white rounded-xl border border-gray-200 space-y-1 text-[11px]"
                        >
                          <div className="font-bold text-gray-900">{it.item_name}</div>
                          {it.variant_name && (
                            <div className="text-[10px] text-gray-500">Phân loại: {it.variant_name}</div>
                          )}
                          <div className="flex justify-between text-gray-600">
                            <span>SL mua: <strong>{it.quantity_ordered}</strong></span>
                            <span>{it.inventory_note}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {(selectedRecord.customer_note || selectedRecord.internal_note) && (
                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200 space-y-2 text-xs">
                  {selectedRecord.customer_note && (
                    <div>
                      <span className="font-bold text-gray-700">Ghi chú của khách:</span>{" "}
                      <span className="text-gray-600">{selectedRecord.customer_note}</span>
                    </div>
                  )}
                  {selectedRecord.internal_note && (
                    <div>
                      <span className="font-bold text-gray-700">Ghi chú nội bộ:</span>{" "}
                      <span className="text-gray-600 font-mono">{selectedRecord.internal_note}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => setSelectedRecord(null)}
                className="px-5 py-2 text-sm font-semibold rounded-xl bg-gray-900 text-white hover:bg-gray-800 transition active:scale-95 cursor-pointer"
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
