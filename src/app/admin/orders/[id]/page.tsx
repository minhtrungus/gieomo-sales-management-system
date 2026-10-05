"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { Badge } from "@/components/ui/Badge";
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, DELIVERY_STATUS_LABELS } from "@/lib/constants";
import {
  getStoredOrders,
  updateStoredOrderStatus,
  updateStoredPaymentStatus,
  updateStoredDeliveryStatus,
  updateStoredOrderNotes,
  updateStoredOrderWarehouse,
  getStoredMembers,
  updateOrderShipper,
  type StoredMember,
} from "@/lib/data/orderStore";
import type { OrderStatus, PaymentStatus, DeliveryStatus, Order } from "@/types/database";
import { ArrowLeft, CheckCircle, Clock, Truck, FileText, UserCheck, Copy, Check, Building, Bike, Phone, Maximize2, X, Download, ZoomIn, ShieldCheck, AlertCircle } from "lucide-react";

export default function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const [order, setOrder] = useState<Order | null>(() => {
    const stored = getStoredOrders();
    return stored.find((o) => o.order_id === resolvedParams.id || o.order_code === resolvedParams.id) || null;
  });

  const [orderStatus, setOrderStatus] = useState<OrderStatus>(order ? order.order_status : "pending");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(order ? order.payment_status : "pending");
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatus>(order?.delivery_status || "not_ready");
  const [internalNote, setInternalNote] = useState(order?.internal_note || "");
  const [warehouseId, setWarehouseId] = useState<string>(
    order?.warehouse_id || (order?.delivery_type === "pickup_point" && order.pickup_point_id === "pp-3" ? "wh-2" : "wh-1")
  );
  const [members, setMembers] = useState<StoredMember[]>([]);
  const [assignedShipperId, setAssignedShipperId] = useState<string>(order?.assigned_shipper_id || "");
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [isSavedNotice, setIsSavedNotice] = useState(false);

  // Lightbox modal state for receipt proof
  const [zoomedProof, setZoomedProof] = useState<string | null>(null);

  // Confirmation modal state for manual payment verification
  const [showPaymentConfirmModal, setShowPaymentConfirmModal] = useState(false);
  const [pendingPaymentStatus, setPendingPaymentStatus] = useState<PaymentStatus | null>(null);

  useEffect(() => {
    setMembers(getStoredMembers());
    const stored = getStoredOrders();
    const found = stored.find((o) => o.order_id === resolvedParams.id || o.order_code === resolvedParams.id) || null;
    if (found) {
      setOrder(found);
      setOrderStatus(found.order_status);
      setPaymentStatus(found.payment_status);
      setDeliveryStatus(found.delivery_status || "not_ready");
      setInternalNote(found.internal_note || "");
      setAssignedShipperId(found.assigned_shipper_id || "");
      setWarehouseId(
        found.warehouse_id ||
          (found.delivery_type === "pickup_point" && found.pickup_point_id === "pp-3" ? "wh-2" : "wh-1")
      );
    }
  }, [resolvedParams.id]);

  // Handle changing payment status with explicit confirmation for 'paid'
  const handlePaymentStatusChange = (newStatus: PaymentStatus) => {
    if (newStatus === "paid" && paymentStatus !== "paid") {
      setPendingPaymentStatus("paid");
      setShowPaymentConfirmModal(true);
    } else {
      setPaymentStatus(newStatus);
    }
  };

  const handleConfirmPaid = () => {
    setPaymentStatus("paid");
    setShowPaymentConfirmModal(false);
    setPendingPaymentStatus(null);
    if (order) {
      updateStoredPaymentStatus(order.order_id, "paid");
      setOrder((prev) => (prev ? { ...prev, payment_status: "paid" } : prev));
      setIsSavedNotice(true);
      setTimeout(() => setIsSavedNotice(false), 2500);
    }
  };

  const handleSaveChanges = () => {
    if (!order) return;
    updateStoredOrderStatus(order.order_id, orderStatus);
    updateStoredPaymentStatus(order.order_id, paymentStatus);
    updateStoredDeliveryStatus(order.order_id, deliveryStatus);
    updateStoredOrderNotes(order.order_id, { internal_note: internalNote });
    updateStoredOrderWarehouse(order.order_id, warehouseId);

    const selectedShipper = members.find((m) => m.memberId === assignedShipperId);
    updateOrderShipper(
      order.order_code,
      assignedShipperId || null,
      selectedShipper ? selectedShipper.fullName : null
    );

    setIsSavedNotice(true);
    setTimeout(() => setIsSavedNotice(false), 2500);
  };

  if (!order) {
    return (
      <div className="max-w-4xl mx-auto py-16 text-center space-y-4">
        <h2 className="text-xl font-bold text-gray-800">Không tìm thấy đơn hàng</h2>
        <p className="text-sm text-gray-500">Đơn hàng này không tồn tại hoặc đã bị xóa khỏi hệ thống.</p>
        <Link
          href="/admin/orders"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-soft-green text-emerald-950 font-bold text-xs"
        >
          <ArrowLeft className="w-4 h-4" />
          Quay lại danh sách đơn hàng
        </Link>
      </div>
    );
  }

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
          onClick={handleSaveChanges}
          className="px-4 py-2 rounded-xl bg-soft-green text-emerald-950 font-bold text-xs hover:bg-emerald-300 transition-colors shadow-xs flex items-center gap-1.5"
        >
          {isSavedNotice ? <Check className="w-4 h-4 text-emerald-700" /> : null}
          {isSavedNotice ? "Đã lưu!" : "Lưu thay đổi"}
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
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 block">Người nhận hàng:</span>
                  <button
                    onClick={() => {
                      const fullAddr = `${order.recipient_name ? `${order.recipient_name} - ` : ""}${order.recipient_phone ? `${order.recipient_phone} - ` : ""}${order.address_detail || ""}, ${order.district || ""}, ${order.province || ""}`;
                      navigator.clipboard.writeText(fullAddr);
                      setCopiedAddress(true);
                      setTimeout(() => setCopiedAddress(false), 2000);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-100/70 hover:bg-emerald-200/80 px-2 py-0.5 rounded-lg border border-emerald-300 transition-colors cursor-pointer"
                    title="Sao chép tên, số điện thoại và địa chỉ giao hàng"
                  >
                    {copiedAddress ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-700" />
                        <span>Đã sao chép</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3 text-emerald-700" />
                        <span>Sao chép địa chỉ</span>
                      </>
                    )}
                  </button>
                </div>

                {order.recipient_name && order.buyer_name && order.recipient_name !== order.buyer_name ? (
                  <div className="space-y-1.5 mt-1">
                    <div className="p-2 rounded-xl bg-gray-50 border border-gray-100">
                      <span className="text-[11px] text-gray-500 block">Người đặt mua:</span>
                      <span className="font-bold text-gray-900 block text-xs">{order.buyer_name}</span>
                      <span className="text-gray-600 block text-xs">{order.buyer_phone}</span>
                    </div>
                    <div className="p-2 rounded-xl bg-emerald-50/70 border border-emerald-200/70">
                      <span className="text-[11px] text-emerald-800 font-bold block">Người nhận hàng (Đặt hộ):</span>
                      <span className="font-bold text-emerald-950 block text-xs">{order.recipient_name}</span>
                      <span className="text-emerald-800 block text-xs">{order.recipient_phone}</span>
                    </div>
                  </div>
                ) : (
                  <div className="mt-0.5">
                    <span className="font-bold text-gray-900 block text-sm">{order.recipient_name || order.buyer_name}</span>
                    <span className="text-gray-600 block text-xs">{order.recipient_phone || order.buyer_phone}</span>
                  </div>
                )}

                <span className="text-gray-500 block mt-1 text-xs">
                  {order.address_detail}, {order.district}, {order.province}
                </span>
              </div>
            </div>

            {/* Kho xuất hàng điều phối (Fulfillment Warehouse) */}
            <div className="pt-3 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-gray-500 block text-[11px]">Kho điều phối xuất đơn hàng này:</span>
                <span className="font-bold text-emerald-950 flex items-center gap-1.5 text-xs mt-0.5">
                  <Building className="w-3.5 h-3.5 text-emerald-700" />
                  {warehouseId === "wh-2" ? "Kho Cơ Sở 2 (Thủ Đức - KTX ĐHQG)" : "Kho Trung Tâm (Quận 3 - Trụ sở Mầm Mơ)"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-gray-500 whitespace-nowrap">Chuyển kho xuất:</span>
                <select
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-emerald-300 text-xs font-bold outline-none bg-white text-emerald-950 focus:border-emerald-600"
                >
                  <option value="wh-1">📍 Kho 1: Trung Tâm (Quận 3)</option>
                  <option value="wh-2">📍 Kho 2: Cơ Sở 2 (Thủ Đức)</option>
                </select>
              </div>
            </div>

            {/* Phân công thành viên giao hàng (Shipper nội bộ) */}
            <div className="pt-3 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-gray-500 block text-[11px]">Thành viên phụ trách giao hàng (Shipper):</span>
                <span className="font-bold text-emerald-950 flex items-center gap-1.5 text-xs mt-0.5">
                  <Bike className="w-3.5 h-3.5 text-emerald-700" />
                  {assignedShipperId ? (
                    (() => {
                      const shipper = members.find((m) => m.memberId === assignedShipperId);
                      return shipper ? `${shipper.fullName} (${shipper.phone})` : "Đã gán thành viên";
                    })()
                  ) : (
                    <span className="text-gray-400 font-normal italic">Chưa phân công thành viên giao</span>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-gray-500 whitespace-nowrap">Gán người giao:</span>
                <select
                  value={assignedShipperId}
                  onChange={(e) => setAssignedShipperId(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-emerald-300 text-xs font-bold outline-none bg-white text-emerald-950 focus:border-emerald-600"
                >
                  <option value="">-- Chưa gán shipper --</option>
                  {members.map((m) => (
                    <option key={m.memberId} value={m.memberId}>
                      🛵 {m.fullName} ({m.phone}) - {m.role === "admin" ? "Admin" : "Sale"}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Nguồn đơn & Người quen qua ai / Người giới thiệu */}
          <div className="bg-white rounded-3xl p-6 border border-[#F0E5D8] shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-heading font-bold text-base text-emerald-950 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-emerald-600" />
                Nguồn đơn hàng & Người giới thiệu
              </h3>
              {order.introducer_info ? (
                <span className="text-[11px] px-2.5 py-1 rounded-full font-bold bg-emerald-100/80 text-emerald-900 border border-emerald-300">
                  🌱 Có người quen / Giới thiệu
                </span>
              ) : (
                <span className="text-[11px] px-2.5 py-1 rounded-full font-medium bg-gray-100 text-gray-600 border border-gray-200">
                  🌐 Trực tiếp qua Website
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="space-y-1">
                <span className="text-gray-500 block">Quen qua ai / Người giới thiệu:</span>
                {order.introducer_info ? (
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl font-bold bg-[#BFE9C3]/50 text-[#16381D] border border-[#9ed4a3] text-sm">
                    <span>🌱</span>
                    <span>{order.introducer_info}</span>
                  </div>
                ) : (
                  <span className="text-gray-700 font-medium italic block py-1">
                    Không qua giới thiệu (Khách tự tìm đến website)
                  </span>
                )}
              </div>

              <div className="space-y-1">
                <span className="text-gray-500 block">Nguồn đặt hàng (Qua đâu):</span>
                <span className="font-bold text-gray-900 block text-sm">
                  {order.source_type === "admin_manual"
                    ? "Tạo thủ công tại quầy (Admin / Offline)"
                    : order.source_type === "member_referral"
                    ? "Qua thành viên giới thiệu (Referral Link)"
                    : order.source_type === "social_media"
                    ? "Mạng xã hội (Facebook / TikTok)"
                    : "Cửa hàng Online (Website gieomo.vn)"}
                </span>
                {order.referral_code && (
                  <span className="text-gray-500 text-[11px] block">
                    Mã Referral gắn kèm: <code className="bg-[#FFF8EE] text-[#542B07] border border-[#ebd089] font-mono px-1.5 py-0.5 rounded font-bold">{order.referral_code}</code>
                  </span>
                )}
              </div>

              {order.customer_note && (
                <div className="sm:col-span-2 pt-2 border-t border-gray-100">
                  <span className="text-gray-500 font-bold block mb-1">💬 Ghi chú từ khách hàng (Read-only):</span>
                  <p className="text-gray-800 italic bg-amber-50/70 p-3 rounded-2xl border border-amber-200/60 text-xs">
                    &ldquo;{order.customer_note}&rdquo;
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Items Recap */}
          <div className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-2xs space-y-4">
            {(() => {
              const displayItems = order.items && order.items.length > 0 ? order.items : [];
              return (
                <>
                  <h3 className="font-heading font-bold text-base text-emerald-950 border-b border-gray-100 pb-3">
                    Sản phẩm trong đơn ({displayItems.length} món)
                  </h3>

                  <div className="divide-y divide-gray-100">
                    {displayItems.map((item, idx) => (
                      <div
                        key={item.order_item_id || idx}
                        className="py-3 first:pt-0 last:pb-0 flex items-center justify-between text-xs"
                      >
                        <div>
                          <span className="font-bold text-gray-900 block">
                            {item.product_name_snapshot || item.item_name_snapshot || "Sản phẩm Mầm Mơ"}
                          </span>
                          {item.variant_name_snapshot && (
                            <span className="text-gray-500 text-[11px] block">{item.variant_name_snapshot}</span>
                          )}
                          <span className="text-gray-500">
                            Đơn giá:{" "}
                            <MoneyDisplay amount={item.price_snapshot ?? item.unit_price ?? 85000} /> x{" "}
                            {item.quantity}
                          </span>
                        </div>

                        <MoneyDisplay
                          amount={item.subtotal || (item.price_snapshot ?? 85000) * item.quantity}
                          className="font-extrabold text-emerald-950 text-sm"
                        />
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}

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
                onChange={(e) => handlePaymentStatusChange(e.target.value as PaymentStatus)}
                className="w-full p-2.5 rounded-xl border border-gray-200 text-xs font-bold bg-white outline-none"
              >
                <option value="pending">⏳ Chờ thanh toán</option>
                <option value="paid">✅ Đã thanh toán (Khớp VietQR)</option>
                <option value="refunded">↩️ Đã hoàn tiền</option>
                <option value="failed">❌ Thất bại</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-700 uppercase">Trạng thái giao hàng (Fulfillment):</label>
              <select
                value={deliveryStatus}
                onChange={(e) => setDeliveryStatus(e.target.value as DeliveryStatus)}
                className="w-full p-2.5 rounded-xl border border-gray-200 text-xs font-bold bg-white outline-none"
              >
                <option value="not_ready">Chưa sẵn sàng</option>
                <option value="packed">Đã đóng gói xong</option>
                <option value="handed_to_carrier">Đã bàn giao shipper/đơn vị vận chuyển</option>
                <option value="in_transit">Đang vận chuyển</option>
                <option value="out_for_delivery">Đang giao đến người nhận</option>
                <option value="delivered">Đã giao thành công</option>
                <option value="failed_delivery">Giao không thành công</option>
                <option value="returned">Đã hoàn trả về kho</option>
                <option value="ready_for_pickup">Sẵn sàng nhận tại điểm hẹn</option>
                <option value="picked_up">Người mua đã đến nhận hàng</option>
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

          {/* Payment Proof Receipt Image Box */}
          {(order.payment_proof || (order.internal_note && order.internal_note.includes("[Ảnh biên lai]"))) && (
            <div className="bg-white rounded-3xl p-6 border border-emerald-200 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-heading font-bold text-sm text-emerald-950 flex items-center gap-2">
                  <span>🧾</span> Ảnh biên lai chuyển khoản
                </h3>
                {paymentStatus !== "paid" && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full font-extrabold bg-amber-100 text-amber-900 border border-amber-300">
                    Chờ BTC đối soát
                  </span>
                )}
              </div>

              {(() => {
                const proofSrc =
                  order.payment_proof ||
                  order.internal_note?.match(/\[Ảnh biên lai\]:\s*(data:image\/[^\s]+|https?:\/\/[^\s]+)/)?.[1] ||
                  "";
                if (!proofSrc) return null;
                return (
                  <div className="space-y-3">
                    <div
                      onClick={() => setZoomedProof(proofSrc)}
                      className="relative w-full rounded-2xl overflow-hidden border border-emerald-200 bg-gray-50 group cursor-pointer hover:border-emerald-500 transition-all shadow-2xs hover:shadow-md"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={proofSrc}
                        alt="Biên lai chuyển khoản"
                        className="w-full h-auto max-h-72 object-contain mx-auto transition-transform group-hover:scale-[1.02]"
                      />
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-white font-bold text-xs">
                        <ZoomIn className="w-5 h-5" />
                        <span>Nhấp để phóng to</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setZoomedProof(proofSrc)}
                        className="flex-1 py-2 px-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                        <span>Xem ảnh lớn</span>
                      </button>

                      {paymentStatus !== "paid" && (
                        <button
                          type="button"
                          onClick={() => {
                            setPendingPaymentStatus("paid");
                            setShowPaymentConfirmModal(true);
                          }}
                          className="flex-1 py-2 px-3 rounded-xl bg-soft-green hover:bg-emerald-300 text-emerald-950 font-extrabold text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer border border-emerald-300 shadow-2xs transition-all"
                        >
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-800" />
                          <span>Duyệt thanh toán</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>

      {/* LIGHTBOX MODAL: Xem ảnh biên lai phóng to */}
      {zoomedProof && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs animate-in fade-in"
          onClick={() => setZoomedProof(null)}
        >
          <div
            className="relative max-w-4xl w-full max-h-[92vh] bg-[#16381D]/90 rounded-3xl p-4 border border-emerald-600/40 shadow-2xl flex flex-col items-center space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="w-full flex items-center justify-between text-white pb-2 border-b border-white/10 px-2">
              <div className="flex items-center gap-2">
                <span className="text-base">🧾</span>
                <span className="font-heading font-bold text-sm">
                  Biên lai đơn {order.order_code} — {order.buyer_name} ({order.final_amount.toLocaleString("vi-VN")}đ)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={zoomedProof}
                  download={`Bien-Lai-${order.order_code}.png`}
                  className="px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                  title="Tải ảnh về máy"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Tải ảnh</span>
                </a>
                <button
                  type="button"
                  onClick={() => setZoomedProof(null)}
                  className="p-1.5 rounded-full hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-pointer"
                  title="Đóng (ESC)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Image Area */}
            <div className="relative w-full flex-1 flex items-center justify-center overflow-auto max-h-[80vh] p-2 bg-black/40 rounded-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={zoomedProof}
                alt="Ảnh biên lai phóng to"
                className="max-w-full max-h-[76vh] object-contain rounded-xl shadow-lg select-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL: Xác nhận đã nhận tiền thanh toán (Minh bạch BTC) */}
      {showPaymentConfirmModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
          onClick={() => setShowPaymentConfirmModal(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-3xl p-6 border border-emerald-200 shadow-2xl space-y-4 animate-in zoom-in-95 text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-lg">
                  🛡️
                </div>
                <h3 className="font-heading font-extrabold text-base text-emerald-950">
                  Xác nhận đối soát thanh toán
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPaymentConfirmModal(false)}
                className="p-1 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 cursor-pointer text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-gray-700">
              <p className="text-gray-600">
                Để đảm bảo minh bạch, BTC vui lòng kiểm tra tài khoản ngân hàng và xác nhận đã nhận đủ số tiền cho đơn hàng này:
              </p>

              <div className="p-3.5 rounded-2xl bg-[#FFFDF9] border border-[#F0E5D8] space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-gray-500">Mã đơn hàng:</span>
                  <span className="font-mono font-bold text-emerald-950">{order.order_code}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Khách hàng:</span>
                  <span className="font-bold text-gray-900">{order.buyer_name} ({order.buyer_phone})</span>
                </div>
                <div className="flex justify-between text-sm pt-1 border-t border-gray-100">
                  <span className="text-gray-600 font-bold">Số tiền thực thu:</span>
                  <span className="font-extrabold text-emerald-900 text-base">
                    {order.final_amount.toLocaleString("vi-VN")}đ
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-emerald-50 text-emerald-900 border border-emerald-200 text-[11.5px] leading-relaxed flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <span>
                  Sau khi xác nhận, đơn hàng sẽ được đánh dấu <strong>Đã thanh toán (Khớp VietQR)</strong> trên toàn hệ thống và lưu nhật ký đối soát.
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowPaymentConfirmModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-gray-500 hover:bg-gray-100 cursor-pointer transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmPaid}
                className="px-5 py-2.5 rounded-full bg-soft-green hover:bg-emerald-300 text-emerald-950 font-extrabold text-xs shadow-xs border border-emerald-300 transition-all cursor-pointer inline-flex items-center gap-1.5"
              >
                <Check className="w-4 h-4 text-emerald-800" />
                <span>Xác nhận đã nhận tiền</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
