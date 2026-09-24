"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import {
  saveNewOrder,
  getStoredProducts,
  getStoredMembers,
  getStoredPickupPoints,
  getStoredSettings,
  updateStoredOrderStatus,
  updateStoredPaymentStatus,
  type StoredMember,
} from "@/lib/data/orderStore";
import type { Order, OrderItem, PickupPoint } from "@/types/database";
import { ArrowLeft, Plus, Trash2, QrCode, Copy, Check, CheckCircle, ExternalLink } from "lucide-react";

export default function AdminCreateOrderPage() {
  const router = useRouter();
  const [availableProducts, setAvailableProducts] = useState(getStoredProducts());
  const [members, setMembers] = useState<StoredMember[]>([]);
  const [pickupPoints, setPickupPoints] = useState<PickupPoint[]>([]);
  const [settings, setSettings] = useState(getStoredSettings());

  useEffect(() => {
    setAvailableProducts(getStoredProducts());
    setMembers(getStoredMembers());
    setPickupPoints(getStoredPickupPoints().filter((p) => p.status === "active"));
    setSettings(getStoredSettings());
  }, []);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [sourceType, setSourceType] = useState("admin_manual");
  const [memberId, setMemberId] = useState("");
  const [deliveryType, setDeliveryType] = useState("home_delivery");
  const [pickupPointId, setPickupPointId] = useState("");
  const [addressDetail, setAddressDetail] = useState("");
  const [province, setProvince] = useState("TP. Hồ Chí Minh");
  const [paymentMethod, setPaymentMethod] = useState("banking");
  const [customerNote, setCustomerNote] = useState("");

  // QR Modal
  const [activeQrModal, setActiveQrModal] = useState<{
    orderCode: string;
    orderId: string;
    amount: number;
    qrUrl: string;
  } | null>(null);
  const [copiedMemo, setCopiedMemo] = useState(false);

  const defaultProd = availableProducts[0] || { product_id: "prod-1", name: "Sản phẩm", price: 85000 };

  // Selected Order Items
  const [orderItems, setOrderItems] = useState<
    Array<{ productId: string; name: string; price: number; quantity: number }>
  >([
    {
      productId: defaultProd.product_id,
      name: defaultProd.name,
      price: defaultProd.price,
      quantity: 1,
    },
  ]);

  const subtotal = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shippingFee = deliveryType === "pickup_point" ? 0 : subtotal >= 200000 ? 0 : 25000;
  const finalAmount = subtotal + shippingFee;

  const handleAddItem = () => {
    const firstProd = availableProducts[0] || defaultProd;
    setOrderItems((prev) => [
      ...prev,
      { productId: firstProd.product_id, name: firstProd.name, price: firstProd.price, quantity: 1 },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    setOrderItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleProductSelect = (index: number, prodId: string) => {
    const prod = availableProducts.find((p) => p.product_id === prodId);
    if (!prod) return;
    setOrderItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, productId: prod.product_id, name: prod.name, price: prod.price } : item
      )
    );
  };

  const handleQuantityChange = (index: number, qty: number) => {
    setOrderItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, quantity: Math.max(1, qty) } : item))
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const randomCode = `GM-${Math.floor(100000 + Math.random() * 900000)}`;
    const newOrderId = `ord-${Date.now()}`;

    const orderItemsSnapshot: OrderItem[] = orderItems.map((item, idx) => {
      const prod = availableProducts.find((p) => p.product_id === item.productId);
      return {
        order_item_id: `item-${newOrderId}-${idx + 1}`,
        order_id: newOrderId,
        product_id: item.productId,
        variant_id: prod?.variants?.[0]?.variant_id || null,
        combo_id: null,
        product_name_snapshot: item.name,
        item_name_snapshot: item.name,
        variant_name_snapshot: prod?.variants?.[0]?.name || null,
        price_snapshot: item.price,
        quantity: item.quantity,
        subtotal: item.price * item.quantity,
        created_at: new Date().toISOString(),
      };
    });

    const matchedMember = members.find((m) => m.memberId === memberId);
    const selectedPickup = pickupPoints.find((p) => p.pickup_point_id === pickupPointId);

    const newOrder: Order = {
      order_id: newOrderId,
      order_code: randomCode,
      buyer_name: customerName || "Khách đặt hộ",
      buyer_phone: customerPhone || "",
      buyer_email: customerEmail || "",
      recipient_name: customerName || "Khách đặt hộ",
      recipient_phone: customerPhone || "",
      delivery_type: deliveryType as any,
      address_detail:
        deliveryType === "home_delivery"
          ? addressDetail || "Địa chỉ giao hàng"
          : selectedPickup
          ? `${selectedPickup.name} - ${selectedPickup.address || selectedPickup.address_detail || ""}`
          : "Điểm hẹn nhận hàng",
      district: "",
      province: province,
      payment_method: paymentMethod as any,
      payment_status: "pending",
      order_status: "pending",
      delivery_status: "not_ready",
      subtotal,
      discount_amount: 0,
      shipping_fee: shippingFee,
      final_amount: finalAmount,
      total_cost: Math.round(finalAmount * 0.4),
      seller_id: matchedMember ? matchedMember.memberId : null,
      introducer_info: matchedMember
        ? `${matchedMember.fullName} (${matchedMember.referralCode})`
        : sourceType === "admin_manual"
        ? "Ban tổ chức nhập đơn"
        : "Khách lẻ tự liên hệ",
      referral_code: matchedMember?.referralCode || null,
      created_by_member_id: matchedMember ? matchedMember.memberId : null,
      customer_note: customerNote || "Ban tổ chức nhập đơn hộ",
      items: orderItemsSnapshot,
      created_at: new Date().toISOString(),
      completed_at: null,
      updated_at: new Date().toISOString(),
    };

    saveNewOrder(newOrder);

    if (paymentMethod === "banking") {
      const qrUrl =
        settings.qrMode === "upload" && settings.qrImageUrl
          ? settings.qrImageUrl
          : `https://img.vietqr.io/image/MB-${settings.bankNumber || "03456789999"}-compact2.png?amount=${finalAmount}&addInfo=${randomCode}&accountName=${encodeURIComponent(
              settings.bankHolder || "CLB MAM MO GIEO MO"
            )}`;

      setActiveQrModal({
        orderCode: randomCode,
        orderId: newOrderId,
        amount: finalAmount,
        qrUrl,
      });
    } else {
      router.push("/admin/orders");
    }
  };

  const handleConfirmQrPaid = () => {
    if (!activeQrModal) return;
    updateStoredPaymentStatus(activeQrModal.orderId, "paid");
    updateStoredOrderStatus(activeQrModal.orderId, "confirmed");
    router.push("/admin/orders");
  };

  const handleCopyMemo = (memo: string) => {
    navigator.clipboard.writeText(memo);
    setCopiedMemo(true);
    setTimeout(() => setCopiedMemo(false), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/admin/orders" className="p-2 rounded-xl text-gray-500 hover:bg-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-900 font-extrabold text-[11px] border border-blue-200">
                📝 NHẬP ĐƠN ĐẶT HỘ
              </span>
              <h1 className="font-heading font-extrabold text-2xl text-[#231B16]">
                Nhập đơn giao hàng từ xa
              </h1>
            </div>
            <p className="text-xs text-[#7E7068] mt-0.5">
              Dành cho Ban tổ chức nhập đơn chốt qua Fanpage/Hotline hoặc hỗ trợ khách cần ship tận nơi/điểm tập kết.
            </p>
          </div>
        </div>

        <Link
          href="/admin/orders/pos"
          className="px-4 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-extrabold text-xs border border-emerald-300 shadow-2xs transition-colors flex items-center gap-1.5"
        >
          <span>⚡ Bán trực tiếp tại sự kiện</span>
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Form Column */}
        <div className="lg:col-span-8 space-y-6">
          {/* Customer & Source Info */}
          <div className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-2xs space-y-4">
            <h3 className="font-heading font-bold text-base text-emerald-950">
              1. Thông tin khách hàng & Nguồn đơn
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Họ tên khách hàng *"
                placeholder="Tên khách hàng"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                required
              />
              <Input
                label="Số điện thoại *"
                placeholder="0901234567"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                required
              />
            </div>

            <Input
              label="Email khách (Không bắt buộc)"
              placeholder="khachhang@example.com"
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Nguồn đơn hàng"
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value)}
                options={[
                  { value: "admin_manual", label: "BTC Nhập hộ" },
                  { value: "member_referral", label: "Thành viên giới thiệu" },
                  { value: "social_media", label: "Fanpage / MXH" },
                ]}
              />

              <Select
                label="Thành viên giới thiệu / Chốt đơn"
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
                options={[
                  { value: "", label: "Trực tiếp / Không qua giới thiệu" },
                  ...members.map((m) => ({
                    value: m.memberId,
                    label: `${m.fullName} (${m.referralCode})`,
                  })),
                ]}
              />
            </div>
          </div>

          {/* Product Items Selection */}
          <div className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-bold text-base text-emerald-950">
                2. Chọn sản phẩm đặt mua
              </h3>
              <button
                type="button"
                onClick={handleAddItem}
                className="text-xs font-bold text-emerald-800 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Thêm món
              </button>
            </div>

            <div className="space-y-3">
              {orderItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 rounded-2xl bg-gray-50 border border-gray-200/60">
                  <div className="flex-1">
                    <select
                      value={item.productId}
                      onChange={(e) => handleProductSelect(idx, e.target.value)}
                      className="w-full p-2 rounded-xl border border-gray-200 text-xs font-bold bg-white text-gray-800 outline-none"
                    >
                      {availableProducts.map((p) => (
                        <option key={p.product_id} value={p.product_id}>
                          {p.name} - {p.price.toLocaleString("vi-VN")}đ
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="w-20">
                    <input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) => handleQuantityChange(idx, Number(e.target.value))}
                      className="w-full p-2 text-center rounded-xl border border-gray-200 text-xs font-bold bg-white outline-none"
                    />
                  </div>

                  <MoneyDisplay amount={item.price * item.quantity} className="font-bold text-xs text-emerald-950 w-24 text-right" />

                  {orderItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      className="p-1 text-gray-400 hover:text-red-600 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Delivery & Address */}
          <div className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-2xs space-y-4">
            <h3 className="font-heading font-bold text-base text-emerald-950">
              3. Giao hàng & Thanh toán
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Hình thức giao"
                value={deliveryType}
                onChange={(e) => setDeliveryType(e.target.value)}
                options={[
                  { value: "home_delivery", label: "Giao tận nơi (25k - Freeship >200k)" },
                  { value: "pickup_point", label: "Nhận tại điểm hẹn Mầm Mơ (0đ)" },
                ]}
              />

              <Select
                label="Phương thức thanh toán"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                options={[
                  { value: "banking", label: "Chuyển khoản Ngân hàng (VietQR)" },
                  { value: "cod", label: "Tiền mặt khi nhận hàng (COD)" },
                ]}
              />
            </div>

            {deliveryType === "pickup_point" && (
              <div className="pt-2">
                <Select
                  label="Chọn điểm hẹn nhận hàng *"
                  value={pickupPointId}
                  onChange={(e) => setPickupPointId(e.target.value)}
                  options={[
                    { value: "", label: "-- Chọn điểm hẹn --" },
                    ...pickupPoints.map((p) => ({
                      value: p.pickup_point_id,
                      label: `${p.name} (${p.address || p.address_detail || ""})`,
                    })),
                  ]}
                />
              </div>
            )}

            {deliveryType === "home_delivery" && (
              <div className="space-y-4 pt-2">
                <Select
                  label="Tỉnh / Thành phố *"
                  value={province}
                  onChange={(e) => setProvince(e.target.value)}
                  options={[
                    { value: "TP. Hồ Chí Minh", label: "TP. Hồ Chí Minh" },
                    { value: "Hà Nội", label: "Hà Nội" },
                    { value: "Đà Nẵng", label: "Đà Nẵng" },
                    { value: "Bình Dương", label: "Bình Dương" },
                    { value: "Đồng Nai", label: "Đồng Nai" },
                    { value: "Tỉnh khác", label: "Các tỉnh thành khác" },
                  ]}
                />

                <Input
                  label="Địa chỉ chi tiết nhận hàng (Số nhà, đường, phường/xã...) *"
                  placeholder="Ví dụ: 123 Nguyễn Huệ, Phường Bến Nghé"
                  value={addressDetail}
                  onChange={(e) => setAddressDetail(e.target.value)}
                  required
                />
              </div>
            )}

            <div>
              <Input
                label="Ghi chú đơn hàng"
                placeholder="Ghi chú đóng gói hoặc hướng dẫn giao hàng..."
                value={customerNote}
                onChange={(e) => setCustomerNote(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Right Summary Column */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-2xs space-y-4 sticky top-24">
            <h3 className="font-heading font-bold text-base text-emerald-950 border-b border-gray-100 pb-3">
              Tóm tắt đơn đặt hộ
            </h3>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-gray-600">
                <span>Tạm tính tiền hàng:</span>
                <MoneyDisplay amount={subtotal} className="font-bold text-gray-900" />
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Phí giao hàng:</span>
                {shippingFee === 0 ? (
                  <span className="text-emerald-700 font-bold">Miễn phí</span>
                ) : (
                  <MoneyDisplay amount={shippingFee} className="font-bold text-gray-900" />
                )}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-cream border border-emerald-100 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-emerald-800 uppercase block">Tổng tiền đơn:</span>
                <MoneyDisplay amount={finalAmount} className="text-2xl font-extrabold text-emerald-950" />
              </div>
            </div>

            <Button type="submit" variant="primary" fullWidth size="lg">
              {paymentMethod === "banking" ? "Tạo đơn & Xuất mã VietQR ➔" : "Tạo đơn giao COD ➔"}
            </Button>
          </div>
        </div>
      </form>

      {/* MODAL: HIỆN MÃ VIETQR ĐƠN ĐẶT HỘ */}
      {activeQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-7 border border-[#F0E5D8] shadow-2xl space-y-5 text-center">
            <div className="flex items-center justify-between border-b border-[#F0E5D8] pb-3 text-left">
              <div>
                <span className="text-xs font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                  MÃ ĐƠN: {activeQrModal.orderCode}
                </span>
                <h3 className="font-heading font-extrabold text-lg text-[#231B16] mt-1">
                  Mã VietQR cho khách thanh toán
                </h3>
              </div>
              <button
                type="button"
                onClick={() => router.push("/admin/orders")}
                className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* QR Image */}
            <div className="flex flex-col items-center justify-center p-4 rounded-2xl bg-white border-2 border-emerald-300 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={activeQrModal.qrUrl}
                alt="Mã VietQR"
                className="w-64 h-auto object-contain rounded-xl"
              />
              <span className="font-heading font-extrabold text-2xl text-emerald-950 mt-3 font-mono">
                {activeQrModal.amount.toLocaleString("vi-VN")}đ
              </span>
              <span className="text-xs text-gray-500">
                Tài khoản: {settings.bankHolder || "CLB MAM MO GIEO MO"} ({settings.bankNumber || "03456789999"})
              </span>
            </div>

            {/* Transfer Memo */}
            <div className="p-3 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-between text-xs">
              <div className="text-left">
                <span className="text-gray-500 block text-[10px]">Nội dung chuyển khoản:</span>
                <span className="font-mono font-bold text-red-600 text-sm">
                  {activeQrModal.orderCode}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleCopyMemo(activeQrModal.orderCode)}
                className="px-2.5 py-1 rounded-lg bg-white border border-gray-300 text-gray-700 font-bold hover:bg-gray-100 cursor-pointer flex items-center gap-1"
              >
                {copiedMemo ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedMemo ? "Đã chép" : "Chép"}</span>
              </button>
            </div>

            {/* Actions */}
            <div className="space-y-2 pt-2 border-t border-[#F0E5D8]">
              <button
                type="button"
                onClick={handleConfirmQrPaid}
                className="w-full py-3 px-4 rounded-full bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-sm shadow-md transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2 border border-[#9ed4a3]"
              >
                <CheckCircle className="w-4 h-4 text-emerald-800" />
                <span>✓ Khách đã chuyển khoản xong — Xác nhận đã nhận tiền</span>
              </button>

              <button
                type="button"
                onClick={() => router.push("/admin/orders")}
                className="w-full py-2.5 px-4 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs transition-colors cursor-pointer"
              >
                Hoàn tất & Về danh sách đơn hàng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
