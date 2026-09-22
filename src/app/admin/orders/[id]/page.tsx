"use client";

import { use, useState } from "react";
import Link from "next/link";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { Badge } from "@/components/ui/Badge";
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS } from "@/lib/constants";
import { MOCK_ORDERS, MOCK_ORDER_ITEMS } from "@/lib/data/mockData";
import type { OrderStatus, PaymentStatus } from "@/types/database";
import { ArrowLeft, CheckCircle, Clock, Truck, FileText } from "lucide-react";

export default function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const order = MOCK_ORDERS.find((o) => o.order_id === resolvedParams.id) || MOCK_ORDERS[0];

  const [orderStatus, setOrderStatus] = useState<OrderStatus>(order.order_status);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(order.payment_status);
  const [internalNote, setInternalNote] = useState(order.internal_note || "");

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/orders" className="p-2 rounded-xl text-gray-500 hover:bg-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-heading font-extrabold text-2xl text-emerald-950">
                Chi tiết đơn hàng {order.order_code}
              </h1>
              <Badge variant={orderStatus === "completed" ? "success" : "warning"}>
                {ORDER_STATUS_LABELS[orderStatus]}
              </Badge>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Tạo ngày: {new Date(order.created_at).toLocaleString("vi-VN")}
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            alert("Đã lưu cập nhật đơn hàng thành công!");
          }}
          className="px-4 py-2 rounded-xl bg-soft-green text-emerald-950 font-bold text-xs hover:bg-emerald-300 transition-colors shadow-xs"
        >
          Lưu thay đổi
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 8 Cols */}
        <div className="lg:col-span-8 space-y-6">
          {/* Customer & Shipping Address */}
          <div className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-2xs space-y-4">
            <h3 className="font-heading font-bold text-base text-emerald-950 border-b border-gray-100 pb-3">
              Thông tin khách hàng & Giao hàng
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-gray-500 block">Người đặt hàng:</span>
                <span className="font-bold text-gray-900 block text-sm">{order.buyer_name}</span>
                <span className="text-gray-600 block">{order.buyer_phone}</span>
                <span className="text-gray-500 block">{order.buyer_email}</span>
              </div>

              <div>
                <span className="text-gray-500 block">Người nhận hàng:</span>
                <span className="font-bold text-gray-900 block text-sm">{order.recipient_name}</span>
                <span className="text-gray-600 block">{order.recipient_phone}</span>
                <span className="text-gray-500 block mt-1">
                  {order.address_detail}, {order.district}, {order.province}
                </span>
              </div>
            </div>
          </div>

          {/* Items Recap */}
          <div className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-2xs space-y-4">
            <h3 className="font-heading font-bold text-base text-emerald-950 border-b border-gray-100 pb-3">
              Sản phẩm trong đơn ({MOCK_ORDER_ITEMS.length} món)
            </h3>

            <div className="divide-y divide-gray-100">
              {MOCK_ORDER_ITEMS.map((item) => (
                <div key={item.order_item_id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-gray-900 block">{item.product_name_snapshot}</span>
                    <span className="text-gray-500 text-[11px] block">{item.variant_name_snapshot}</span>
                    <span className="text-gray-500">Đơn giá: <MoneyDisplay amount={item.price_snapshot ?? 85000} /> x {item.quantity}</span>
                  </div>

                  <MoneyDisplay amount={item.subtotal} className="font-extrabold text-emerald-950 text-sm" />
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-gray-100 space-y-2 text-xs">
              <div className="flex justify-between text-gray-600">
                <span>Tạm tính tiền hàng:</span>
                <MoneyDisplay amount={order.subtotal} className="font-bold text-gray-900" />
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Giảm giá voucher:</span>
                <span>-<MoneyDisplay amount={order.discount_amount ?? 10000} /></span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Phí vận chuyển:</span>
                <MoneyDisplay amount={order.shipping_fee} className="font-bold text-gray-900" />
              </div>
              <div className="flex justify-between text-sm font-bold text-emerald-950 pt-2 border-t border-gray-100">
                <span>Tổng cộng thực thu:</span>
                <MoneyDisplay amount={order.final_amount} className="text-lg font-extrabold" />
              </div>
            </div>
          </div>
        </div>

        {/* Right 4 Cols Controls */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-2xs space-y-4">
            <h3 className="font-heading font-bold text-base text-emerald-950 border-b border-gray-100 pb-3">
              Cập nhật trạng thái
            </h3>

            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-700 uppercase">Trạng thái đơn hàng:</label>
              <select
                value={orderStatus}
                onChange={(e) => setOrderStatus(e.target.value as OrderStatus)}
                className="w-full p-2.5 rounded-xl border border-gray-200 text-xs font-bold bg-white outline-none"
              >
                <option value="pending">Chờ xác nhận</option>
                <option value="confirmed">Đã xác nhận</option>
                <option value="processing">Đang chuẩn bị</option>
                <option value="ready_to_ship">Sẵn sàng giao</option>
                <option value="shipping">Đang giao</option>
                <option value="completed">Hoàn thành</option>
                <option value="cancelled">Hủy đơn</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-700 uppercase">Trạng thái thanh toán:</label>
              <select
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}
                className="w-full p-2.5 rounded-xl border border-gray-200 text-xs font-bold bg-white outline-none"
              >
                <option value="pending">Chờ thanh toán</option>
                <option value="paid">Đã thanh toán (Khớp VietQR)</option>
                <option value="refunded">Đã hoàn tiền</option>
                <option value="failed">Thất bại</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-700 uppercase">Ghi chú nội bộ BTC:</label>
              <textarea
                value={internalNote}
                onChange={(e) => setInternalNote(e.target.value)}
                placeholder="Ghi chú riêng cho nhân viên đóng gói / shipper..."
                rows={3}
                className="w-full p-2.5 rounded-xl border border-gray-200 text-xs outline-none"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
