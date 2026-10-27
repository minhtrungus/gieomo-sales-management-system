"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { Badge } from "@/components/ui/Badge";
import { DoubleConfirmDialog } from "@/components/ui/DoubleConfirmDialog";
import { X, RefreshCw, Search, Eye, Image as ImageIcon } from "lucide-react";
import {
  getStoredOrders,
  syncOrdersFromServer,
  type PaymentRecord,
} from "@/lib/data/orderStore";
import type { Order } from "@/types/database";
import { PaymentRefreshCoordinator, shouldRefreshPayments } from "@/lib/admin/paymentRefreshCoordinator";

interface PaymentFeedRow {
  payment_id: string;
  amount: number;
  payment_method?: string | null;
  status?: string | null;
  transaction_code?: string | null;
  created_at: string;
}

interface PaymentFeedRecord {
  order_code: string;
  created_at: string;
  payment_status?: string | null;
  expected_amount?: number | null;
  receiver_name?: string | null;
  receiver_phone?: string | null;
  payments?: PaymentFeedRow[];
}

interface MissingPaymentLedgerRow {
  orderCode: string;
  amount: number;
  customerName: string;
  customerPhone: string;
  createdAt: string;
}

interface PaymentPageData {
  payments: PaymentRecord[];
  missingLedger: MissingPaymentLedgerRow[];
  orders?: Order[];
}

async function fetchRecordedPayments(): Promise<PaymentPageData> {
  const response = await fetch("/api/admin/payments", {
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok || data?.success !== true || !Array.isArray(data.records)) {
    throw new Error(data?.error || "Không thể tải sổ giao dịch thanh toán.");
  }

  const records = data.records as PaymentFeedRecord[];
  const payments: PaymentRecord[] = records.flatMap((record) =>
    (record.payments || []).map((payment) => ({
      paymentId: payment.payment_id,
      orderCode: record.order_code,
      amount: Number(payment.amount) || 0,
      paymentMethod: payment.payment_method || "banking",
      transactionCode: payment.transaction_code || "",
      status:
        payment.status === "paid"
          ? "paid"
          : payment.status === "failed"
            ? "failed"
            : "pending",
      createdAt: payment.created_at,
    })),
  );
  const missingLedger = records
    .filter(
      (record) =>
        record.payment_status === "paid" &&
        (record.payments?.length || 0) === 0,
    )
    .map((record) => ({
      orderCode: record.order_code,
      amount: Number(record.expected_amount) || 0,
      customerName: record.receiver_name || "Khách mua lẻ",
      customerPhone: record.receiver_phone || "",
      createdAt: record.created_at,
    }));

  return { payments, missingLedger };
}

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [missingLedger, setMissingLedger] = useState<MissingPaymentLedgerRow[]>([]);
  const [orders, setOrders] = useState<Order[]>(() => getStoredOrders());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "paid">("all");
  const [confirmingPayment, setConfirmingPayment] = useState<PaymentRecord | null>(null);
  const [bankReference, setBankReference] = useState("");
  const [rejectingPayment, setRejectingPayment] = useState<PaymentRecord | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [viewingProof, setViewingProof] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [paymentReadError, setPaymentReadError] = useState<string | null>(null);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [refreshCoordinator] = useState(() =>
    new PaymentRefreshCoordinator<PaymentPageData>(
      async () => {
        await syncOrdersFromServer(true);
        const result = await fetchRecordedPayments();
        return { ...result, orders: getStoredOrders() };
      },
      (result) => {
        setOrders(result.orders || []); setPayments(result.payments); setMissingLedger(result.missingLedger);
        setPaymentReadError(null); setHasLoaded(true);
      },
      (_error, reportError) => {
        setHasLoaded(true);
        if (reportError) setPaymentReadError("Không thể tải sổ giao dịch thực từ database. Dữ liệu đang hiển thị được giữ nguyên.");
      },
    ),
  );

  const refreshAuthoritativeData = useCallback((showError = true, force = false) =>
    refreshCoordinator.refresh({ force, reportError: showError }), [refreshCoordinator]);

  useEffect(() => {
    refreshCoordinator.start();
    void refreshAuthoritativeData();

    const handleUpdate = () => setOrders(getStoredOrders());
    const refreshWhenVisible = () => {
      if (shouldRefreshPayments(document.visibilityState)) void refreshAuthoritativeData(false);
    };
    const interval = window.setInterval(refreshWhenVisible, 30_000);

    window.addEventListener("gieomo_orders_updated", handleUpdate);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      refreshCoordinator.stop();
      window.clearInterval(interval);
      window.removeEventListener("gieomo_orders_updated", handleUpdate);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refreshAuthoritativeData, refreshCoordinator]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    setRefreshMessage(null);
    try {
      const refreshed = await refreshAuthoritativeData(true, true);
      setRefreshMessage(refreshed ? "Đã tải lại trạng thái đơn và sổ giao dịch từ database của hệ thống." : null);
    } catch {
      setPaymentReadError("Không thể tải sổ giao dịch thực từ database.");
      setRefreshMessage(null);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleApprove = async () => {
    if (!confirmingPayment) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/orders/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderCode: confirmingPayment.orderCode,
          action: "confirm",
          amount: confirmingPayment.amount,
          paymentMethod: confirmingPayment.paymentMethod,
          referenceNumber: bankReference.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setConfirmingPayment(null);
        setBankReference("");
        try {
          const refreshed = await refreshAuthoritativeData(true, true);
          if (!refreshed) throw new Error("authoritative refresh failed");
          setActionMessage("Đã xác nhận thanh toán và tải lại dữ liệu từ database.");
        } catch {
          setActionMessage("Thanh toán đã được xác nhận nhưng chưa tải lại được danh sách. Không xác nhận lần nữa; hãy thử tải lại dữ liệu.");
        }
      } else {
        if (res.status === 409) {
          await refreshAuthoritativeData(true, true);
        }
        setActionMessage(data.error || "Không thể xác nhận thanh toán.");
      }
    } catch (err) {
      setActionMessage("Lỗi kết nối: " + (err as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectingPayment) return;
    if (!rejectReason.trim()) {
      setActionMessage("Vui lòng nhập lý do hủy thanh toán.");
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch("/api/orders/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderCode: rejectingPayment.orderCode,
          action: "cancel",
          reason: rejectReason.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setRejectingPayment(null);
        setRejectReason("");
        try {
          const refreshed = await refreshAuthoritativeData(true, true);
          if (!refreshed) throw new Error("authoritative refresh failed");
          setActionMessage("Đã hủy yêu cầu thanh toán và tải lại trạng thái mới nhất.");
        } catch {
          setActionMessage("Thanh toán đã được hủy nhưng chưa tải lại được danh sách. Không gửi lại thao tác; hãy thử tải lại dữ liệu.");
        }
      } else {
        if (res.status === 409) {
          await refreshAuthoritativeData(true, true);
        }
        setActionMessage(data.error || "Không thể hủy thanh toán.");
      }
    } catch (err) {
      setActionMessage("Lỗi kết nối: " + (err as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  // Map order details by order_code
  const orderMap = useMemo(() => {
    const map = new Map<string, Order>();
    orders.forEach((o) => {
      if (o.order_code) map.set(o.order_code, o);
    });
    return map;
  }, [orders]);

  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (searchQuery.trim() !== "") {
        const q = searchQuery.toLowerCase();
        const matchedCode = (p.orderCode ?? "").toLowerCase().includes(q);
        const matchedTx = (p.transactionCode ?? "").toLowerCase().includes(q);
        const orderObj = orderMap.get(p.orderCode);
        const matchedBuyer =
          (orderObj?.buyer_name ?? "").toLowerCase().includes(q) ||
          (orderObj?.buyer_phone ?? "").includes(q);
        return matchedCode || matchedTx || !!matchedBuyer;
      }
      return true;
    });
  }, [payments, statusFilter, searchQuery, orderMap]);

  const filteredMissingLedger = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return missingLedger;
    return missingLedger.filter(
      (row) =>
        row.orderCode.toLowerCase().includes(q) ||
        row.customerName.toLowerCase().includes(q) ||
        row.customerPhone.includes(q),
    );
  }, [missingLedger, searchQuery]);

  // Only proofs without a ledger event can enter the confirm/reject workflow.
  // Pending ledger rows are reconciliation exceptions; replaying them would
  // correctly return HTTP 409 from the idempotent payment RPC.
  const proofCandidates = useMemo(() => {
    const orderCodesWithLedger = new Set(payments.map((payment) => payment.orderCode));
    return orders.filter((order) =>
      order.payment_status === "pending" &&
      order.payment_method === "banking" &&
      Boolean(order.payment_proof) &&
      !orderCodesWithLedger.has(order.order_code),
    );
  }, [orders, payments]);

  const pendingCount = payments.filter((p) => p.status === "pending").length;
  const paidCount = payments.filter((p) => p.status === "paid").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading font-extrabold text-2xl text-[#231B16]">
              Xác nhận thanh toán VietQR
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold border border-emerald-300">
              {payments.length} Giao dịch
            </span>
            {missingLedger.length > 0 && (
              <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[11px] font-bold border border-amber-300">
                {missingLedger.length} thiếu đối soát
              </span>
            )}
          </div>
          <p className="text-xs text-[#7E7068] mt-0.5">
            Danh sách giao dịch ngân hàng VietQR cần BTC xác nhận khớp lệnh đối soát tài khoản.
          </p>
        </div>

        <button
          type="button"
          onClick={handleManualRefresh}
          disabled={isRefreshing}
          className="px-4 py-2.5 rounded-full bg-white hover:bg-emerald-50 text-emerald-950 font-bold text-xs flex items-center gap-2 shadow-xs transition-all border border-[#F0E5D8] active:scale-95 cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-emerald-700" : "text-gray-500"}`} />
          <span>{isRefreshing ? "Đang tải lại..." : "Làm mới từ hệ thống"}</span>
        </button>
      </div>

      {refreshMessage && (
        <p className="text-xs font-medium text-emerald-800" role="status">
          {refreshMessage} Thao tác này không tải giao dịch trực tiếp từ SePay.
        </p>
      )}

      {paymentReadError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
          {paymentReadError}
        </div>
      )}

      {actionMessage && (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900" role="status">
          {actionMessage}
        </p>
      )}

      {proofCandidates.length > 0 && (
        <section className="overflow-hidden rounded-3xl border border-emerald-200 bg-white shadow-soft">
          <div className="border-b border-emerald-200 bg-emerald-50 px-4 py-3 sm:px-5">
            <h2 className="text-sm font-extrabold text-emerald-950">Chứng từ mới chờ xác minh</h2>
            <p className="mt-1 text-xs text-emerald-800">
              Chỉ xác nhận sau khi đối chiếu tiền thực nhận và nhập mã giao dịch thật của ngân hàng.
            </p>
          </div>
          <div className="divide-y divide-emerald-100">
            {proofCandidates.map((order) => {
              const candidate: PaymentRecord = {
                paymentId: `proof:${order.order_id}`,
                orderCode: order.order_code,
                amount: order.final_amount,
                paymentMethod: "banking",
                transactionCode: "",
                status: "pending",
                createdAt: order.created_at,
              };
              return (
                <div key={order.order_id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-mono text-xs font-bold text-[#1B3622]">{order.order_code}</p>
                    <p className="text-xs font-semibold text-[#231B16]">{order.buyer_name || order.receiver_name || "Khách mua lẻ"}</p>
                    <MoneyDisplay amount={order.final_amount} className="text-sm font-extrabold text-[#1B3622]" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setViewingProof(order.payment_proof || null)} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
                      Xem biên lai
                    </button>
                    <button type="button" onClick={() => { setBankReference(""); setConfirmingPayment(candidate); }} className="rounded-xl border border-emerald-300 bg-[#BFE9C3] px-3 py-2 text-xs font-bold text-[#16381D]">
                      Xác nhận
                    </button>
                    <button type="button" onClick={() => { setRejectReason(""); setRejectingPayment(candidate); }} className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
                      Hủy thanh toán
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {missingLedger.length > 0 && (
        <section className="overflow-hidden rounded-3xl border border-amber-200 bg-white shadow-soft">
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 sm:px-5">
            <h2 className="text-sm font-extrabold text-amber-950">
              Đơn đã đánh dấu thanh toán nhưng thiếu giao dịch đối soát
            </h2>
            <p className="mt-1 text-xs text-amber-800">
              Đây không phải giao dịch VietQR. Hệ thống chỉ hiển thị để kiểm tra, không tự tạo mã giao dịch hoặc tự xác nhận tiền.
            </p>
          </div>

          <div className="block space-y-2 p-3 sm:hidden">
            {filteredMissingLedger.map((row) => (
              <div key={row.orderCode} className="rounded-2xl border border-amber-100 bg-[#FFFDF9] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs font-bold text-[#1B3622]">{row.orderCode}</p>
                    <p className="mt-1 text-xs font-semibold text-[#231B16]">{row.customerName}</p>
                    {row.customerPhone && <p className="text-[10px] text-gray-500">{row.customerPhone}</p>}
                  </div>
                  <MoneyDisplay amount={row.amount} className="text-sm font-extrabold text-[#1B3622]" />
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-[10px]">
                  <span className="text-gray-500">{row.createdAt}</span>
                  <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-1 font-bold text-amber-900">
                    Thiếu giao dịch
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[720px] text-left text-[11px]">
              <thead>
                <tr className="border-b border-amber-100 bg-[#FFF8EE] text-[10px] font-bold uppercase tracking-wider text-[#7E7068]">
                  <th className="px-4 py-2.5">Mã đơn</th>
                  <th className="px-4 py-2.5">Khách hàng</th>
                  <th className="px-4 py-2.5">Giá trị đơn</th>
                  <th className="px-4 py-2.5">Ngày tạo đơn</th>
                  <th className="px-4 py-2.5">Tình trạng</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100">
                {filteredMissingLedger.map((row) => (
                  <tr key={row.orderCode} className="hover:bg-[#FFFDF9]">
                    <td className="px-4 py-2.5 font-mono text-xs font-bold text-[#1B3622]">{row.orderCode}</td>
                    <td className="px-4 py-2.5 font-semibold text-[#231B16]">
                      {row.customerName}
                      {row.customerPhone && <span className="block font-mono text-[10px] font-normal text-gray-500">{row.customerPhone}</span>}
                    </td>
                    <td className="px-4 py-2.5 font-extrabold text-[#1B3622]">
                      <MoneyDisplay amount={row.amount} />
                    </td>
                    <td className="px-4 py-2.5 font-medium text-[#7E7068]">{row.createdAt}</td>
                    <td className="px-4 py-2.5">
                      <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-900">
                        Thiếu giao dịch đối soát
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Filter & Search Bar */}
      <div className="bg-white rounded-3xl p-4 border border-[#F0E5D8] shadow-soft flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Tìm theo mã đơn, mã GD, tên khách..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-cream/50 rounded-xl border border-[#F0E5D8] text-xs font-medium text-[#231B16] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#BFE9C3]"
          />
        </div>

        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-cream/70 border border-[#F0E5D8] self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              statusFilter === "all" ? "bg-[#2D6338] text-white shadow-2xs" : "text-gray-600 hover:bg-white"
            }`}
          >
            Tất cả ({payments.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("pending")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              statusFilter === "pending" ? "bg-[#2D6338] text-white shadow-2xs" : "text-gray-600 hover:bg-white"
            }`}
          >
            ⏳ Chờ đối soát ({pendingCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("paid")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              statusFilter === "paid" ? "bg-[#2D6338] text-white shadow-2xs" : "text-gray-600 hover:bg-white"
            }`}
          >
            ✓ Đã xác nhận ({paidCount})
          </button>
        </div>
      </div>

      {/* MOBILE CARD VIEW (< sm) */}
      <div className="block sm:hidden space-y-3">
        {filteredPayments.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 border border-[#F0E5D8] text-center text-[#7E7068] shadow-soft">
            <p className="font-bold text-sm text-[#231B16]">
              {!hasLoaded ? "Đang tải dữ liệu thanh toán từ server..." : paymentReadError ? "Không thể hiển thị trạng thái rỗng vì lần tải gần nhất đã lỗi." : payments.length === 0 ? "Chưa có giao dịch nào được ghi trong sổ thanh toán." : "Không tìm thấy giao dịch nào phù hợp."}
            </p>
          </div>
        ) : (
          filteredPayments.map((p, idx) => {
            const orderObj = orderMap.get(p.orderCode);
            const proofImg = orderObj?.payment_proof;

            return (
              <div
                key={p.paymentId}
                className="bg-white rounded-2xl p-4 border border-[#F0E5D8] shadow-soft space-y-3"
              >
                <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-gray-100 text-[#7E7068] font-bold text-[10px] flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <span className="font-mono font-bold text-xs text-[#1B3622] bg-[#EAF7ED] px-2 py-0.5 rounded-lg border border-[#BFE9C3]">
                      {p.orderCode}
                    </span>
                  </div>
                  <Badge variant={p.status === "paid" ? "success" : "warning"} className="text-[10px] px-2 py-0.5">
                    {p.status === "paid" ? "✓ Đã xác nhận" : "⏳ Chờ đối soát"}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[10.5px] text-[#7E7068] block">Số tiền thanh toán:</span>
                    <MoneyDisplay amount={p.amount} className="font-extrabold text-[#1B3622] text-sm" />
                  </div>
                  <div>
                    <span className="text-[10.5px] text-[#7E7068] block">Mã GD / Tham chiếu:</span>
                    <span className="font-mono text-gray-800 text-[11px] block truncate font-semibold">
                      {p.transactionCode}
                    </span>
                  </div>
                  {orderObj?.buyer_name && (
                    <div className="col-span-2 text-[11px] text-gray-700 font-medium">
                      <span>Khách hàng: </span>
                      <span className="font-bold text-[#231B16]">{orderObj.buyer_name}</span>
                      {orderObj.buyer_phone && <span className="text-gray-500"> ({orderObj.buyer_phone})</span>}
                    </div>
                  )}
                  <div className="col-span-2 text-[11px] text-gray-500">
                    <span>Thời gian: </span>
                    <span className="font-medium text-gray-700">{p.createdAt}</span>
                  </div>
                </div>

{proofImg && (
                    <button
                      type="button"
                      onClick={() => setViewingProof(proofImg)}
                      className="w-full py-1.5 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-[11px] flex items-center justify-center gap-1.5 border border-amber-200 transition-colors cursor-pointer"
                    >
                      <ImageIcon className="w-3.5 h-3.5 text-amber-700" />
                      <span>Xem ảnh biên lai khách tải lên</span>
                    </button>
                  )}

                  {p.status === "pending" ? (
                   <Link
                     href={`/admin/orders/${encodeURIComponent(p.orderCode)}`}
                     className="w-full py-2.5 rounded-xl bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-xs transition-all shadow-2xs border border-[#9ed4a3] active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                   >
                     <span>Kiểm tra chi tiết đơn</span>
                   </Link>
                 ) : (
                   <div className="py-1.5 rounded-xl bg-emerald-50 text-[#16381D] font-bold text-[11px] text-center border border-emerald-200">
                     ✓ Giao dịch đã được duyệt thành công
                   </div>
                 )}
              </div>
            );
          })
        )}
      </div>

      {/* DESKTOP TABLE VIEW (>= sm) */}
      <div className="hidden sm:block bg-white rounded-3xl border border-[#F0E5D8] shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-[11px]">
            <thead>
              <tr className="bg-[#FFF8EE] border-b border-[#F0E5D8] text-[#7E7068] font-bold uppercase tracking-wider text-[10px]">
                <th className="py-2.5 px-2.5 text-center w-10 whitespace-nowrap">STT</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Mã đơn</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Khách hàng</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Mã GD VietQR</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Số tiền</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Thời gian GD</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Minh chứng</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Trạng thái</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Duyệt thanh toán</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0E5D8]">
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-gray-500">
                    {!hasLoaded ? "Đang tải dữ liệu thanh toán từ server..." : paymentReadError
                      ? "Lần tải dữ liệu gần nhất đã lỗi; trạng thái rỗng chưa được xác nhận."
                      : payments.length === 0
                      ? "Chưa có giao dịch nào được ghi trong sổ thanh toán. Xem danh sách thiếu đối soát phía trên."
                      : "Không tìm thấy giao dịch thanh toán nào phù hợp."}
                  </td>
                </tr>
              ) : (
                filteredPayments.map((p, idx) => {
                  const orderObj = orderMap.get(p.orderCode);
                  const proofImg = orderObj?.payment_proof;

                  return (
                    <tr key={p.paymentId} className="hover:bg-[#FFFDF9] transition-colors">
                      <td className="py-2.5 px-2.5 text-center text-[#7E7068] font-bold text-[11px]">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-[#1B3622] text-xs">
                        {p.orderCode}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-[#231B16]">
                        {orderObj?.buyer_name || "Khách mua lẻ"}
                        {orderObj?.buyer_phone && (
                          <span className="block text-[10px] text-gray-500 font-mono font-normal">
                            {orderObj.buyer_phone}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[#5C4D44] text-[10.5px]">
                        {p.transactionCode}
                      </td>
                      <td className="py-2.5 px-3 font-extrabold text-[#1B3622] text-xs">
                        <MoneyDisplay amount={p.amount} />
                      </td>
                      <td className="py-2.5 px-3 text-[#7E7068] font-medium text-[10.5px]">
                        {p.createdAt}
                      </td>
                      <td className="py-2.5 px-3">
                        {proofImg ? (
                          <button
                            type="button"
                            onClick={() => setViewingProof(proofImg)}
                            className="px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 text-[10px] font-bold border border-amber-200 inline-flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <Eye className="w-3 h-3 text-amber-700" />
                            <span>Xem biên lai</span>
                          </button>
                        ) : (
                          <span className="text-[10px] text-gray-400 italic">Không có</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge variant={p.status === "paid" ? "success" : "warning"} className="text-[10px] px-2 py-0.5">
                          {p.status === "paid" ? "Đã xác nhận" : "Chờ đối soát"}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {p.status === "pending" ? (
                          <Link href={`/admin/orders/${encodeURIComponent(p.orderCode)}`} className="inline-flex rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-900">
                            Kiểm tra đơn
                          </Link>
                        ) : (
                          <span className="text-[10px] text-[#2D6338] font-bold">✓ Đã duyệt</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

       {/* MODAL: XEM ẢNH BIÊN LAI */}
       {viewingProof && (
         <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
           <div className="w-full max-w-lg bg-white rounded-3xl p-5 border border-[#F0E5D8] shadow-2xl space-y-3 animate-in zoom-in-95">
             <div className="flex items-center justify-between pb-2 border-b border-gray-100">
               <span className="font-heading font-extrabold text-sm text-[#231B16]">
                 Ảnh minh chứng thanh toán
               </span>
               <button
                 onClick={() => setViewingProof(null)}
                 className="p-1 rounded-xl text-gray-500 hover:bg-gray-100 cursor-pointer"
               >
                 <X className="w-4 h-4" />
               </button>
             </div>
             <div className="relative h-[65vh] max-h-[720px] overflow-hidden rounded-2xl bg-gray-50 p-2">
               <Image
                 src={viewingProof}
                 alt="Minh chứng thanh toán"
                 fill
                 sizes="(max-width: 640px) calc(100vw - 48px), 480px"
                 quality={50}
                 unoptimized={viewingProof.startsWith("data:")}
                 className="object-contain rounded-xl shadow-xs"
               />
             </div>
             {!viewingProof.startsWith("data:") && (
               <a href={viewingProof} target="_blank" rel="noreferrer" className="block text-center text-xs font-bold text-emerald-800 underline">
                 Mở ảnh gốc
               </a>
             )}
             <button
               onClick={() => setViewingProof(null)}
               className="w-full py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-xs cursor-pointer"
             >
               Đóng
             </button>
           </div>
         </div>
       )}

{/* MODAL: XÁC NHẬN XÁC NHẬN THANH TOÁN */}
{confirmingPayment && (
          <DoubleConfirmDialog
            open={true}
            onClose={() => { setConfirmingPayment(null); setBankReference(""); }}
            onConfirm={handleApprove}
            title="Xác nhận thanh toán"
            message="Bạn có chắc muốn xác nhận thanh toán cho đơn hàng này?"
            confirmCode="XACNHAN"
            details={[
              {
                label: "Mã đơn hàng",
                value: confirmingPayment.orderCode,
              },
              {
                label: "Khách hàng",
                value: orderMap.get(confirmingPayment.orderCode)?.buyer_name || "Khách mua lẻ",
              },
              {
                label: "Số tiền",
                value: `${confirmingPayment.amount.toLocaleString("vi-VN")}₫`,
              },
              {
                label: "Hành động",
                value: "Xác nhận thanh toán",
              },
            ]}
            continueDisabled={!/^[A-Za-z0-9][A-Za-z0-9 _\-/]{2,63}$/.test(bankReference.trim())}
            loading={actionLoading}
          >
            <label htmlFor="bank-reference" className="mb-1.5 block text-sm font-medium text-foreground">
              Mã giao dịch ngân hàng thật <span className="text-danger">*</span>
            </label>
            <input
              id="bank-reference"
              value={bankReference}
              onChange={(event) => setBankReference(event.target.value)}
              maxLength={64}
              autoComplete="off"
              placeholder="Ví dụ: FT24301ABC123"
              className="w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/50"
            />
          </DoubleConfirmDialog>
        )}

        {rejectingPayment && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div role="dialog" aria-modal="true" aria-labelledby="cancel-payment-title" className="w-full max-w-md space-y-4 rounded-3xl bg-white p-6 shadow-2xl">
              <div>
                <h2 id="cancel-payment-title" className="font-heading text-lg font-extrabold text-red-900">Hủy thanh toán</h2>
                <p className="mt-1 text-sm text-gray-700">Đơn <strong>{rejectingPayment.orderCode}</strong> · {rejectingPayment.amount.toLocaleString("vi-VN")}₫</p>
              </div>
              <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-950">
                Thao tác này hủy yêu cầu/xác nhận thanh toán đang chờ và ghi nhật ký quản trị. Nếu tiền thật đã được chuyển hoặc nhận, thao tác này không tự hoàn tiền và không xóa sổ giao dịch.
              </p>
              <label htmlFor="reject-reason" className="block text-sm font-bold text-gray-800">Lý do hủy <span className="text-red-600">*</span></label>
              <textarea
                id="reject-reason"
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Nhập lý do hủy thanh toán"
                className="w-full resize-y rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100"
              />
              <div className="flex justify-end gap-3">
                <button type="button" disabled={actionLoading} onClick={() => { setRejectingPayment(null); setRejectReason(""); }} className="rounded-xl border px-4 py-2 text-sm font-bold text-gray-700 disabled:opacity-50">Đóng</button>
                <button type="button" disabled={actionLoading || !rejectReason.trim()} onClick={handleReject} className="rounded-xl bg-red-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">
                  {actionLoading ? "Đang hủy..." : "Xác nhận hủy"}
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
