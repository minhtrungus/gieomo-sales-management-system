"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CUSTOMER_TIMELINE_STEPS, ORDER_STATUS_LABELS } from "@/lib/constants";
import { MOCK_ORDERS, MOCK_ORDER_ITEMS } from "@/lib/data/mockData";
import { getStoredOrders } from "@/lib/data/orderStore";
import type { Order } from "@/types/database";

function removeVietnameseTones(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

function maskPhone(phone?: string | null): string {
  if (!phone) return "";
  const clean = phone.trim();
  if (clean.length < 7) return clean;
  return clean.slice(0, 4) + "***" + clean.slice(-3);
}

function TrackContent() {
  const searchParams = useSearchParams();
  const initialCode = searchParams.get("code") || "";

  const [searchQuery, setSearchQuery] = useState(initialCode);
  const [searchMode, setSearchMode] = useState<"code" | "phone_name">("code");
  const [searchPhone, setSearchPhone] = useState("");
  const [searchName, setSearchName] = useState("");

  const [matchedOrders, setMatchedOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Device history
  const [deviceOrders, setDeviceOrders] = useState<Order[]>([]);
  const [savedProfile, setSavedProfile] = useState<{ name: string; phone: string } | null>(null);

  useEffect(() => {
    try {
      const allOrders = getStoredOrders();
      const profileRaw = localStorage.getItem("gieomo_customer_profile");
      const myCodesRaw = localStorage.getItem("gieomo_my_order_codes");

      const profile = profileRaw ? JSON.parse(profileRaw) : null;
      const myCodes: string[] = myCodesRaw ? JSON.parse(myCodesRaw) : [];

      if (profile) setSavedProfile(profile);

      // Find orders matching this device
      const localOrders = allOrders.filter(
        (o) =>
          myCodes.includes(o.order_code) ||
          (profile?.phone && (o.buyer_phone === profile.phone || o.recipient_phone === profile.phone))
      );
      setDeviceOrders(localOrders);

      // If URL has code, search directly
      if (initialCode) {
        performSearchByCode(initialCode, allOrders);
      }
    } catch (e) {
      console.error("Error reading device history", e);
    }
  }, [initialCode]);

  const performSearchByCode = (rawQuery: string, ordersList?: Order[]) => {
    setErrorMsg(null);
    setHasSearched(true);

    const query = rawQuery.trim();
    if (!query) {
      setErrorMsg("Vui lòng nhập Mã đơn hàng của bạn (Ví dụ: GM-369817).");
      setMatchedOrders([]);
      setSelectedOrder(null);
      return;
    }

    const orders = ordersList || getStoredOrders();
    const upperQuery = query.toUpperCase();

    // Exact order_code match for privacy
    const results = orders.filter((o) => {
      return (
        o.order_code.toUpperCase() === upperQuery ||
        o.order_code.toUpperCase().replace(/[^A-Z0-9]/g, "") === upperQuery.replace(/[^A-Z0-9]/g, "")
      );
    });

    if (results.length > 0) {
      setMatchedOrders(results);
      setSelectedOrder(results[0]);
    } else {
      setMatchedOrders([]);
      setSelectedOrder(null);
      setErrorMsg(
        `Không tìm thấy đơn hàng nào có mã "${query}". Vui lòng kiểm tra lại mã đơn (Ví dụ: GM-369817) được cấp khi bạn đặt hàng.`
      );
    }
  };

  const performSearchByPhoneAndName = (rawPhone: string, rawName: string) => {
    setErrorMsg(null);
    setHasSearched(true);

    const cleanPhone = rawPhone.replace(/\D/g, "").trim();
    const cleanName = removeVietnameseTones(rawName).trim();

    if (!cleanPhone || cleanPhone.length < 9) {
      setErrorMsg("Vui lòng nhập số điện thoại hợp lệ (tối thiểu 9-10 chữ số).");
      setMatchedOrders([]);
      setSelectedOrder(null);
      return;
    }

    if (!cleanName || cleanName.length < 2) {
      setErrorMsg("Vui lòng nhập đầy đủ Họ và tên để bảo mật thông tin đơn hàng.");
      setMatchedOrders([]);
      setSelectedOrder(null);
      return;
    }

    const orders = getStoredOrders();

    // Must match BOTH phone AND name (buyer or recipient) to prevent unauthorized snooping
    const results = orders.filter((o) => {
      const buyerPhoneClean = (o.buyer_phone || "").replace(/\D/g, "");
      const recipientPhoneClean = (o.recipient_phone || "").replace(/\D/g, "");
      const phoneMatched = buyerPhoneClean.includes(cleanPhone) || recipientPhoneClean.includes(cleanPhone);

      const buyerNameClean = removeVietnameseTones(o.buyer_name || "");
      const recipientNameClean = removeVietnameseTones(o.recipient_name || "");
      const nameMatched =
        buyerNameClean.includes(cleanName) ||
        cleanName.includes(buyerNameClean) ||
        recipientNameClean.includes(cleanName) ||
        cleanName.includes(recipientNameClean);

      return phoneMatched && nameMatched;
    });

    if (results.length > 0) {
      setMatchedOrders(results);
      if (results.length === 1) {
        setSelectedOrder(results[0]);
      } else {
        setSelectedOrder(null); // show list
      }
    } else {
      setMatchedOrders([]);
      setSelectedOrder(null);
      setErrorMsg(
        "Không tìm thấy đơn hàng nào khớp với cả Số điện thoại và Họ tên bạn đã nhập. Vui lòng kiểm tra lại thông tin."
      );
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchMode === "code") {
      performSearchByCode(searchQuery);
    } else {
      performSearchByPhoneAndName(searchPhone, searchName);
    }
  };

  const handleSelectDeviceHistory = () => {
    if (deviceOrders.length > 0) {
      setSearchQuery(deviceOrders[0].order_code);
      setMatchedOrders(deviceOrders);
      setHasSearched(true);
      setErrorMsg(null);
      if (deviceOrders.length === 1) {
        setSelectedOrder(deviceOrders[0]);
      } else {
        setSelectedOrder(null);
      }
    }
  };

  const currentStepIndex = selectedOrder
    ? CUSTOMER_TIMELINE_STEPS.findIndex((s) => s.key === selectedOrder.order_status)
    : 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-soft-green/50 text-emerald-900 text-xs font-bold">
          📍 Tra cứu bảo mật
        </div>
        <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-emerald-950">
          Tra cứu tiến độ &amp; Đơn hàng
        </h1>
        <p className="text-gray-600 text-xs sm:text-sm max-w-xl mx-auto">
          Nhập <strong>Mã đơn hàng</strong> hoặc kết hợp <strong>Số điện thoại + Họ tên</strong> để theo dõi tiến độ một cách bảo mật và an toàn.
        </p>
      </div>

      {/* Device History Card (Quick banner if customer placed orders on this browser) */}
      {deviceOrders.length > 0 && (
        <div className="p-4 sm:p-5 rounded-3xl bg-[#EAF7ED] border border-[#BFE9C3] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🌱</span>
            <div className="text-xs">
              <span className="font-bold text-[#16381D] text-sm block">
                Chào {savedProfile?.name || "bạn"}! Trình duyệt ghi nhận bạn có {deviceOrders.length} đơn hàng trên thiết bị này.
              </span>
              <span className="text-[#386341]">
                Tổng số tiền gây quỹ ủng hộ: <strong>{deviceOrders.reduce((sum, o) => sum + (o.final_amount || 0), 0).toLocaleString("vi-VN")}đ</strong>
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSelectDeviceHistory}
            className="px-4 py-2 rounded-2xl bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-xs transition-colors shrink-0 shadow-2xs border border-[#9ed4a3] cursor-pointer"
          >
            Xem {deviceOrders.length} đơn của bạn ➔
          </button>
        </div>
      )}

      {/* Search Form - Secure Options */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-emerald-100 shadow-xs space-y-5">
        {/* Search Mode Tabs */}
        <div className="flex p-1 bg-gray-100 rounded-2xl max-w-md mx-auto sm:mx-0">
          <button
            type="button"
            onClick={() => {
              setSearchMode("code");
              setErrorMsg(null);
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
              searchMode === "code"
                ? "bg-white text-emerald-950 shadow-xs"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            Tra cứu bằng Mã đơn hàng
          </button>
          <button
            type="button"
            onClick={() => {
              setSearchMode("phone_name");
              setErrorMsg(null);
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
              searchMode === "phone_name"
                ? "bg-white text-emerald-950 shadow-xs"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            SĐT + Họ tên (Bảo mật 2 lớp)
          </button>
        </div>

        <form onSubmit={handleSearchSubmit} className="space-y-4">
          {searchMode === "code" ? (
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <Input
                  label="Mã đơn hàng:"
                  placeholder="Ví dụ: GM-369817 hoặc GM-260901..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button type="submit" variant="primary" size="md" className="w-full sm:w-auto h-11 px-6">
                  Tra cứu ngay
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Số điện thoại đặt hàng: *"
                  placeholder="0912 345 678"
                  type="tel"
                  value={searchPhone}
                  onChange={(e) => setSearchPhone(e.target.value)}
                  required
                />
                <Input
                  label="Họ và tên người nhận / đặt hàng: *"
                  placeholder="Nguyễn Văn A"
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                  required
                />
              </div>
              <p className="text-[11px] text-gray-500 italic">
                🔒 Hệ thống yêu cầu khớp cả Số điện thoại và Họ tên để bảo vệ danh tính và đơn hàng của bạn.
              </p>
              <div className="flex justify-end">
                <Button type="submit" variant="primary" size="md" className="w-full sm:w-auto h-11 px-6">
                  Xác thực &amp; Tra cứu
                </Button>
              </div>
            </div>
          )}
        </form>

        {/* Suggestion tags: ONLY user's own orders on this device */}
        {deviceOrders.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500 pt-1 border-t border-gray-100">
            <span className="text-[11px]">Đơn của bạn trên máy này:</span>
            {deviceOrders.slice(0, 3).map((ord) => (
              <button
                key={ord.order_code}
                type="button"
                onClick={() => {
                  setSearchMode("code");
                  setSearchQuery(ord.order_code);
                  performSearchByCode(ord.order_code);
                }}
                className="px-2.5 py-1 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-mono font-bold text-[11px] transition-colors cursor-pointer border border-emerald-200"
              >
                #{ord.order_code}
              </button>
            ))}
          </div>
        )}

        {errorMsg && (
          <div className="p-3.5 rounded-2xl bg-red-50 border border-red-100 text-xs text-red-600 font-medium text-center">
            {errorMsg}
          </div>
        )}
      </div>

      {/* Multiple Orders Overview List */}
      {hasSearched && matchedOrders.length > 1 && !selectedOrder && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-emerald-100 shadow-xs space-y-5 animate-in fade-in">
          {/* Summary Stat */}
          <div className="p-4 rounded-2xl bg-cream/70 border border-emerald-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-xs text-gray-500 block">Kết quả tra cứu:</span>
              <span className="font-heading font-extrabold text-base text-emerald-950">
                Tìm thấy <strong>{matchedOrders.length} đơn hàng</strong> của khách hàng
              </span>
            </div>
            <div className="text-left sm:text-right">
              <span className="text-xs text-gray-500 block">Tổng đóng góp:</span>
              <MoneyDisplay
                amount={matchedOrders.reduce((sum, o) => sum + (o.final_amount || 0), 0)}
                className="text-lg font-extrabold text-[#1B3622]"
              />
            </div>
          </div>

          <h3 className="font-heading font-bold text-sm text-gray-800 uppercase tracking-wider">
            Danh sách đơn hàng đã mua:
          </h3>

          <div className="divide-y divide-gray-100">
            {matchedOrders.map((ord, idx) => (
              <div
                key={ord.order_id}
                className="py-4 first:pt-0 last:pb-0 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:bg-gray-50/60 p-3 rounded-2xl transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-extrabold text-sm text-emerald-950">
                      #{ord.order_code}
                    </span>
                    <span className="px-2 py-0.5 rounded-lg bg-soft-green/50 text-emerald-950 font-bold text-[10.5px]">
                      {ORDER_STATUS_LABELS[ord.order_status]}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600">
                    Người nhận: <strong>{ord.recipient_name || ord.buyer_name}</strong> • SĐT: {maskPhone(ord.recipient_phone || ord.buyer_phone)}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    Ngày đặt: {new Date(ord.created_at).toLocaleDateString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" })}
                  </p>
                </div>

                <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-2">
                  <MoneyDisplay amount={ord.final_amount} className="font-extrabold text-sm text-emerald-950" />
                  <button
                    type="button"
                    onClick={() => setSelectedOrder(ord)}
                    className="px-3.5 py-1.5 rounded-xl bg-soft-green hover:bg-emerald-300 text-emerald-950 font-bold text-xs transition-colors cursor-pointer"
                  >
                    Xem chi tiết tiến độ ➔
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Single Order Timeline & Detail Card */}
      {selectedOrder && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-emerald-100 shadow-xs space-y-8 animate-in fade-in">
          {/* Back button if searched multiple orders */}
          {matchedOrders.length > 1 && (
            <button
              type="button"
              onClick={() => setSelectedOrder(null)}
              className="text-xs font-bold text-emerald-800 hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              ← Quay lại danh sách ({matchedOrders.length} đơn)
            </button>
          )}

          {/* Header Info */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-6 border-b border-gray-100 gap-4">
            <div>
              <span className="text-xs text-gray-500 font-medium block">Mã đơn hàng:</span>
              <span className="font-heading font-extrabold text-2xl text-emerald-950 font-mono">
                {selectedOrder.order_code}
              </span>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Ngày đặt: {new Date(selectedOrder.created_at).toLocaleString("vi-VN")}
              </p>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-soft-green/60 text-emerald-950 text-xs font-extrabold">
              Trạng thái: {ORDER_STATUS_LABELS[selectedOrder.order_status]}
            </div>
          </div>

          {/* Stepper Timeline */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
              Tiến độ vận chuyển đơn hàng:
            </h3>

            <div className="relative flex items-center justify-between">
              {/* Process Bar Line */}
              <div className="absolute top-1/2 left-0 right-0 -translate-y-1/2 h-1 bg-gray-200 z-0" />
              <div
                className="absolute top-1/2 left-0 h-1 bg-soft-green transition-all duration-500 z-0"
                style={{
                  width: `${(Math.max(0, currentStepIndex) / (CUSTOMER_TIMELINE_STEPS.length - 1)) * 100}%`,
                }}
              />

              {/* Timeline Dots */}
              {CUSTOMER_TIMELINE_STEPS.map((step, idx) => {
                const isPassed = idx <= currentStepIndex;
                const isCurrent = idx === currentStepIndex;

                return (
                  <div key={step.key} className="relative z-10 flex flex-col items-center">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-all ${
                        isPassed
                          ? "bg-emerald-900 text-white ring-4 ring-soft-green"
                          : "bg-gray-100 text-gray-400 border border-gray-300"
                      }`}
                    >
                      {isPassed ? "✓" : idx + 1}
                    </div>
                    <span
                      className={`text-[11px] font-semibold mt-2 text-center max-w-[70px] ${
                        isCurrent ? "text-emerald-950 font-bold" : isPassed ? "text-gray-800" : "text-gray-400"
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Order Items Breakdown */}
          {selectedOrder.items && selectedOrder.items.length > 0 && (
            <div className="pt-4 border-t border-gray-100 space-y-3">
              <span className="font-bold text-gray-900 block text-sm">
                Sản phẩm đã đặt ({selectedOrder.items.length} món):
              </span>
              <div className="bg-gray-50/80 rounded-2xl p-4 divide-y divide-gray-200/60 border border-gray-100">
                {selectedOrder.items.map((item, idx) => (
                  <div
                    key={item.order_item_id || idx}
                    className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-bold text-emerald-950 block">
                        {item.product_name_snapshot || item.item_name_snapshot || "Sản phẩm Mầm Mơ"}
                      </span>
                      {item.variant_name_snapshot && (
                        <span className="text-gray-500 text-[11px] block">{item.variant_name_snapshot}</span>
                      )}
                      <span className="text-gray-500 text-[11px]">
                        Số lượng: <strong>{item.quantity}</strong> • Đơn giá:{" "}
                        <MoneyDisplay amount={item.price_snapshot ?? item.unit_price ?? 85000} />
                      </span>
                    </div>
                    <MoneyDisplay
                      amount={item.subtotal || (item.price_snapshot ?? 85000) * item.quantity}
                      className="font-extrabold text-emerald-950 text-xs"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Delivery & Items Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-gray-100 text-xs">
            <div className="space-y-2">
              <span className="font-bold text-gray-900 block text-sm">Thông tin nhận hàng:</span>
              
              {selectedOrder.recipient_name && selectedOrder.buyer_name && selectedOrder.recipient_name !== selectedOrder.buyer_name ? (
                <>
                  <p className="text-gray-600">
                    <strong>Người đặt mua:</strong> {selectedOrder.buyer_name} {selectedOrder.buyer_phone && `(${maskPhone(selectedOrder.buyer_phone)})`}
                  </p>
                  <p className="text-gray-700 bg-emerald-50/60 p-2 rounded-xl border border-emerald-100">
                    <strong className="text-emerald-950">Người nhận hàng (đặt hộ):</strong> {selectedOrder.recipient_name} {selectedOrder.recipient_phone && `(${maskPhone(selectedOrder.recipient_phone)})`}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-gray-600">
                    <strong>Người nhận:</strong> {selectedOrder.recipient_name || selectedOrder.buyer_name}
                  </p>
                  <p className="text-gray-600">
                    <strong>SĐT:</strong> {maskPhone(selectedOrder.recipient_phone || selectedOrder.buyer_phone)}
                  </p>
                </>
              )}

              <p className="text-gray-600">
                <strong>Địa chỉ:</strong> {selectedOrder.address_detail}, {selectedOrder.district}, {selectedOrder.province}
              </p>
              {selectedOrder.introducer_info && (
                <p className="text-gray-600">
                  <strong>Người quen giới thiệu:</strong> {selectedOrder.introducer_info}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <span className="font-bold text-gray-900 block text-sm">Chi tiết thanh toán:</span>
              <div className="space-y-1.5">
                <div className="flex justify-between text-gray-600">
                  <span>Tiền hàng:</span>
                  <MoneyDisplay amount={selectedOrder.subtotal} />
                </div>
                {selectedOrder.discount_amount ? (
                  <div className="flex justify-between text-emerald-700">
                    <span>Giảm giá:</span>
                    <span>-<MoneyDisplay amount={selectedOrder.discount_amount} /></span>
                  </div>
                ) : null}
                <div className="flex justify-between text-gray-600">
                  <span>Phí ship:</span>
                  <MoneyDisplay amount={selectedOrder.shipping_fee} />
                </div>
                <div className="pt-2 flex justify-between font-bold text-sm text-emerald-950 border-t border-gray-200">
                  <span>Tổng cộng:</span>
                  <MoneyDisplay amount={selectedOrder.final_amount} />
                </div>
                <div className="pt-1 text-[11px] text-gray-500">
                  Phương thức: {selectedOrder.payment_method === "banking" ? "Chuyển khoản VietQR" : "Tiền mặt khi nhận (COD)"}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OrderTrackingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-cream/60">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 sm:px-6 py-12 md:py-16">
        <Suspense fallback={<div className="text-center py-12">Đang tải...</div>}>
          <TrackContent />
        </Suspense>
      </main>

      <Footer />
    </div>
  );
}
