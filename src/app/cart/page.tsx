"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { useCartStore } from "@/store/cart";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/States";
import { MOCK_VOUCHERS } from "@/lib/data/mockData";
import { SITE_CONFIG } from "@/lib/constants";

export default function CartPage() {
  const { items, removeItem, updateQuantity, clearCart, getSubtotal } = useCartStore();

  const [voucherCode, setVoucherCode] = useState("");
  const [appliedVoucher, setAppliedVoucher] = useState<{
    code: string;
    discountAmount: number;
  } | null>(null);
  const [voucherError, setVoucherError] = useState<string | null>(null);

  const subtotal = getSubtotal();

  // Free shipping over threshold (200k)
  const shippingThreshold = 200000;
  const shippingFee = subtotal >= shippingThreshold || subtotal === 0 ? 0 : 25000;
  const finalTotal = Math.max(0, subtotal - (appliedVoucher?.discountAmount ?? 0) + shippingFee);

  const handleApplyVoucher = (e: React.FormEvent) => {
    e.preventDefault();
    setVoucherError(null);

    const found = MOCK_VOUCHERS.find(
      (v) => v.code.toUpperCase() === voucherCode.trim().toUpperCase() && v.status === "active"
    );

    if (!found) {
      setVoucherError("Mã giảm giá không hợp lệ hoặc đã hết hạn!");
      return;
    }

    if (subtotal < found.min_order_value) {
      setVoucherError(
        `Đơn hàng tối thiểu ${found.min_order_value.toLocaleString("vi-VN")}đ để sử dụng mã này!`
      );
      return;
    }

    let discount = 0;
    if (found.discount_type === "percentage") {
      discount = Math.round((subtotal * found.discount_value) / 100);
    } else {
      discount = found.discount_value;
    }

    setAppliedVoucher({
      code: found.code,
      discountAmount: discount,
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-cream/60">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 sm:px-6 py-8 md:py-12">
        <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-emerald-950 mb-8">
          Giỏ hàng gây quỹ ({items.length})
        </h1>

        {items.length === 0 ? (
          <div className="py-16 bg-white rounded-3xl border border-emerald-100 p-8 text-center">
            <EmptyState
              icon="🛍️"
              title="Giỏ hàng đang trống"
              description="Bạn chưa chọn món hàng nào. Hãy khám phá ngay các sản phẩm handmade yêu thương của Gieo Mơ nhé!"
              action={
                <Link href="/products">
                  <Button variant="primary" size="lg">
                    Khám phá sản phẩm ngay
                  </Button>
                </Link>
              }
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Cart Items List - 8 Cols */}
            <div className="lg:col-span-8 space-y-4">
              <div className="bg-white rounded-3xl p-6 border border-emerald-100 shadow-xs divide-y divide-gray-100">
                {items.map((item) => (
                  <div
                    key={`${item.product_id}-${item.variant_id ?? "default"}`}
                    className="py-4 first:pt-0 last:pb-0 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="relative w-20 h-20 rounded-2xl bg-cream border border-emerald-100 overflow-hidden shrink-0 flex items-center justify-center text-2xl">
                        {item.image_url ? (
                          <Image src={item.image_url} alt="" fill className="object-cover" />
                        ) : (
                          <span>🌱</span>
                        )}
                      </div>

                      <div className="space-y-1 min-w-0">
                        <h3 className="font-heading font-bold text-gray-900 text-base truncate">
                          {item.product_name}
                        </h3>
                        {item.variant_name && (
                          <span className="text-xs text-gray-500 font-medium bg-gray-100 px-2 py-0.5 rounded-md">
                            {item.variant_name}
                          </span>
                        )}
                        <div className="pt-1">
                          <MoneyDisplay amount={item.price} className="text-sm font-bold text-emerald-950" />
                        </div>
                      </div>
                    </div>

                    {/* Quantity & Item Total */}
                    <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto">
                      <div className="flex items-center border border-gray-200 rounded-xl bg-gray-50 p-1">
                        <button
                          onClick={() => updateQuantity(item.product_id, item.variant_id, item.quantity - 1)}
                          className="w-7 h-7 flex items-center justify-center text-gray-600 hover:bg-white rounded font-bold text-sm"
                        >
                          -
                        </button>
                        <span className="w-8 text-center text-xs font-bold text-gray-900">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(item.product_id, item.variant_id, item.quantity + 1)}
                          className="w-7 h-7 flex items-center justify-center text-gray-600 hover:bg-white rounded font-bold text-sm"
                        >
                          +
                        </button>
                      </div>

                      <MoneyDisplay amount={item.price * item.quantity} className="text-base font-extrabold text-emerald-950 min-w-[90px] text-right" />

                      <button
                        onClick={() => removeItem(item.product_id, item.variant_id)}
                        className="text-gray-400 hover:text-red-500 p-1 transition-colors"
                        title="Xóa món này"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center px-2">
                <button
                  onClick={clearCart}
                  className="text-xs text-red-600 hover:text-red-800 font-semibold underline"
                >
                  Xóa tất cả trong giỏ
                </button>
                <Link href="/products" className="text-xs text-emerald-800 font-semibold hover:underline">
                  + Tiếp tục mua sắm
                </Link>
              </div>
            </div>

            {/* Order Summary & Voucher - 4 Cols */}
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-white rounded-3xl p-6 border border-emerald-100 shadow-xs space-y-6">
                <h2 className="font-heading font-bold text-xl text-emerald-950 border-b border-gray-100 pb-3">
                  Tóm tắt đơn hàng
                </h2>

                {/* Voucher Form */}
                <form onSubmit={handleApplyVoucher} className="space-y-2">
                  <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Mã giảm giá / Voucher:
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={voucherCode}
                      onChange={(e) => setVoucherCode(e.target.value)}
                      placeholder="Nhập GIEOMO10 hoặc WELCOME20K"
                      className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold outline-none focus:border-soft-green uppercase"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-xl bg-soft-green hover:bg-emerald-300 text-emerald-950 font-bold text-xs transition-colors"
                    >
                      Áp dụng
                    </button>
                  </div>
                  {voucherError && (
                    <p className="text-xs text-red-600 font-medium">{voucherError}</p>
                  )}
                  {appliedVoucher && (
                    <p className="text-xs text-emerald-700 font-semibold flex items-center gap-1">
                      <span>✓</span> Đã áp dụng mã &quot;{appliedVoucher.code}&quot; (-
                      <MoneyDisplay amount={appliedVoucher.discountAmount} />)
                    </p>
                  )}
                </form>

                {/* Calculation Rows */}
                <div className="space-y-3 pt-2 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>Tạm tính tiền hàng:</span>
                    <MoneyDisplay amount={subtotal} className="font-bold text-gray-900" />
                  </div>

                  {appliedVoucher && (
                    <div className="flex justify-between text-emerald-700 font-semibold">
                      <span>Giảm giá:</span>
                      <span>-<MoneyDisplay amount={appliedVoucher.discountAmount} /></span>
                    </div>
                  )}

                  <div className="flex justify-between text-gray-600">
                    <span>Phí vận chuyển dự kiến:</span>
                    {shippingFee === 0 ? (
                      <span className="text-emerald-700 font-bold">Miễn phí</span>
                    ) : (
                      <MoneyDisplay amount={shippingFee} className="font-bold text-gray-900" />
                    )}
                  </div>

                  {subtotal < shippingThreshold && (
                    <p className="text-[11px] text-emerald-800 bg-emerald-50 p-2.5 rounded-xl border border-emerald-100">
                      💡 Mua thêm <MoneyDisplay amount={shippingThreshold - subtotal} className="font-bold" /> để được <strong>MIỄN PHÍ VẬN CHUYỂN</strong> toàn quốc!
                    </p>
                  )}
                </div>

                {/* Total */}
                <div className="pt-4 border-t border-gray-200 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-gray-500 block uppercase font-bold">Tổng thanh toán:</span>
                    <MoneyDisplay amount={finalTotal} className="text-2xl font-extrabold text-emerald-950" />
                  </div>
                </div>

                {/* Checkout CTA */}
                <Link href="/checkout" className="block w-full">
                  <Button variant="primary" fullWidth size="lg">
                    Tiến hành thanh toán ➔
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
