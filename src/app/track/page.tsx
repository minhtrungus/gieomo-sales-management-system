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
import type { Order } from "@/types/database";

function TrackContent() {
  const searchParams = useSearchParams();
  const initialCode = searchParams.get("code") || "";

  const [orderCode, setOrderCode] = useState(initialCode);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [foundOrder, setFoundOrder] = useState<Order | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setHasSearched(true);

    const queryCode = orderCode.trim().toUpperCase();

    // Look up in mock data or sample order
    if (queryCode === "GM-260901" || queryCode.startsWith("GM-")) {
      setFoundOrder(MOCK_ORDERS[0]);
    } else {
      setFoundOrder(null);
      setErrorMsg("Không tìm thấy đơn hàng với thông tin trên. Vui lòng kiểm tra lại mã đơn hoặc số điện thoại.");
    }
  };

  useEffect(() => {
    if (initialCode) {
      handleSearch({ preventDefault: () => {} } as any);
    }
  }, [initialCode]);

  const currentStepIndex = foundOrder
    ? CUSTOMER_TIMELINE_STEPS.findIndex((s) => s.key === foundOrder.order_status)
    : 0;

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-soft-green/50 text-emerald-900 text-xs font-bold">
          📍 Hỗ trợ khách hàng
        </div>
        <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-emerald-950">
          Tra cứu tiến độ đơn hàng
        </h1>
        <p className="text-gray-600 text-sm">
          Nhập mã đơn hàng (GM-XXXXXX) để kiểm tra trạng thái đóng gói và giao hàng nhé!
        </p>
      </div>

      {/* Search Card */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-emerald-100 shadow-xs">
        <form onSubmit={handleSearch} className="grid grid-cols-1 sm:grid-cols-12 gap-4">
          <div className="sm:col-span-6">
            <Input
              label="Mã đơn hàng *"
              placeholder="Ví dụ: GM-260901"
              value={orderCode}
              onChange={(e) => setOrderCode(e.target.value)}
              required
            />
          </div>
          <div className="sm:col-span-4">
            <Input
              label="Số điện thoại người đặt"
              placeholder="0901234567 (Tùy chọn)"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2 flex items-end">
            <Button type="submit" variant="primary" fullWidth size="md">
              Tra cứu
            </Button>
          </div>
        </form>

        {errorMsg && (
          <div className="mt-4 p-4 rounded-2xl bg-red-50 border border-red-100 text-xs text-red-600 font-medium text-center">
            {errorMsg}
          </div>
        )}
      </div>

      {/* Timeline Result Card */}
      {foundOrder && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-emerald-100 shadow-xs space-y-8 animate-in fade-in">
          {/* Header Info */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-6 border-b border-gray-100 gap-4">
            <div>
              <span className="text-xs text-gray-500 font-medium block">Mã đơn hàng:</span>
              <span className="font-heading font-extrabold text-2xl text-emerald-950">
                {foundOrder.order_code}
              </span>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-soft-green/60 text-emerald-950 text-xs font-extrabold">
              trạng thái: {ORDER_STATUS_LABELS[foundOrder.order_status]}
            </div>
          </div>

          {/* Stepper Timeline */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
              Tiến độ vận chuyển:
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

          {/* Delivery & Items Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-gray-100 text-xs">
            <div className="space-y-2">
              <span className="font-bold text-gray-900 block text-sm">Thông tin nhận hàng:</span>
              <p className="text-gray-600">
                <strong>Người nhận:</strong> {foundOrder.recipient_name}
              </p>
              <p className="text-gray-600">
                <strong>Địa chỉ:</strong> {foundOrder.address_detail}, {foundOrder.district}, {foundOrder.province}
              </p>
            </div>

            <div className="space-y-2">
              <span className="font-bold text-gray-900 block text-sm">Sản phẩm đã đặt:</span>
              <div className="space-y-1 divide-y divide-gray-100">
                {MOCK_ORDER_ITEMS.map((item) => (
                  <div key={item.order_item_id} className="pt-1 flex justify-between">
                    <span className="text-gray-700">
                      {item.product_name_snapshot} x{item.quantity}
                    </span>
                    <MoneyDisplay amount={item.subtotal} className="font-semibold text-gray-900" />
                  </div>
                ))}
              </div>
              <div className="pt-2 flex justify-between font-bold text-sm text-emerald-950 border-t border-gray-200">
                <span>Tổng tiền:</span>
                <MoneyDisplay amount={foundOrder.final_amount} />
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
