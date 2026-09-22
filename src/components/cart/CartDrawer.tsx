"use client";

import { useCartStore } from "@/store/cart";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { EmptyState } from "@/components/ui/States";
import Link from "next/link";
import Image from "next/image";

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CartDrawer({ isOpen, onClose }: CartDrawerProps) {
  const { items, removeItem, updateQuantity, getSubtotal, getItemCount } = useCartStore();
  const subtotal = getSubtotal();
  const count = getItemCount();

  return (
    <Drawer open={isOpen} onClose={onClose} title={`Giỏ hàng của bạn (${count})`}>
      <div className="flex flex-col h-full">
        {items.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-4">
            <EmptyState
              icon="🛍️"
              title="Giỏ hàng đang trống"
              description="Hãy chọn những món quà nhỏ đáng yêu từ Gieo Mơ để bắt đầu hành trình nhé!"
              action={
                <Button onClick={onClose} variant="primary" size="md">
                  Khám phá sản phẩm
                </Button>
              }
            />
          </div>
        ) : (
          <>
            {/* Items List */}
            <div className="flex-1 overflow-y-auto divide-y divide-gray-100 pr-1">
              {items.map((item) => (
                <div key={`${item.product_id}-${item.variant_id ?? "default"}`} className="py-4 flex gap-3.5 items-start">
                  {/* Image */}
                  <div className="relative w-16 h-16 rounded-xl bg-emerald-50 border border-emerald-100 overflow-hidden shrink-0 flex items-center justify-center text-xl">
                    {item.image_url ? (
                      <Image
                        src={item.image_url}
                        alt={item.product_name ?? item.name ?? ""}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <span>🧵</span>
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-gray-900 truncate">
                      {item.product_name}
                    </h4>
                    {item.variant_name && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        Phân loại: {item.variant_name}
                      </p>
                    )}
                    <div className="mt-1.5 flex items-center justify-between">
                      <MoneyDisplay amount={item.price} className="text-sm font-bold text-emerald-800" />

                      {/* Quantity Controls */}
                      <div className="flex items-center gap-1.5 bg-gray-100/80 rounded-lg p-1">
                        <button
                          onClick={() =>
                            updateQuantity(item.product_id, item.variant_id, item.quantity - 1)
                          }
                          className="w-6 h-6 flex items-center justify-center text-gray-600 hover:bg-white rounded font-bold text-xs transition-colors"
                          aria-label="Decrease quantity"
                        >
                          -
                        </button>
                        <span className="w-6 text-center text-xs font-semibold text-gray-800">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() =>
                            updateQuantity(item.product_id, item.variant_id, item.quantity + 1)
                          }
                          className="w-6 h-6 flex items-center justify-center text-gray-600 hover:bg-white rounded font-bold text-xs transition-colors"
                          aria-label="Increase quantity"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Remove Button */}
                  <button
                    onClick={() => removeItem(item.product_id, item.variant_id)}
                    className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                    title="Xóa khỏi giỏ"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>

            {/* Footer Summary & Checkout CTA */}
            <div className="pt-4 border-t border-gray-200 mt-auto space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 font-medium">Tạm tính:</span>
                <MoneyDisplay amount={subtotal} className="text-lg font-bold text-emerald-950" />
              </div>

              <p className="text-[11px] text-gray-500 italic">
                * Phí vận chuyển và mã giảm giá sẽ được tính tại bước thanh toán.
              </p>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <Link href="/cart" onClick={onClose} className="w-full">
                  <Button variant="outline" fullWidth size="md">
                    Xem giỏ hàng
                  </Button>
                </Link>
                <Link href="/checkout" onClick={onClose} className="w-full">
                  <Button variant="primary" fullWidth size="md">
                    Thanh toán ngay
                  </Button>
                </Link>
              </div>
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
}
