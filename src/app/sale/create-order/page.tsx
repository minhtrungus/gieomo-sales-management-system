"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import {
  saveNewOrder,
  getStoredProducts,
  getStoredPickupPoints,
  getStoredSettings,
  getAdminSession,
  type AdminSession,
} from "@/lib/data/orderStore";
import type { Order, OrderItem, PickupPoint } from "@/types/database";
import {
  ArrowLeft,
  Plus,
  Trash2,
  QrCode,
  Copy,
  Check,
  CheckCircle,
  ExternalLink,
  Sparkles,
} from "lucide-react";

function SaleCreateOrderForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryProductId = searchParams.get("productId");
  const [session, setSession] = useState<AdminSession | null>(null);
  const [availableProducts, setAvailableProducts] = useState(getStoredProducts());
  const [settings, setSettings] = useState(getStoredSettings());

  useEffect(() => {
    const s = getAdminSession();
    setSession(s);
    setAvailableProducts(getStoredProducts());
    setSettings(getStoredSettings());

    const handleSettingsUpdate = () => setSettings(getStoredSettings());
    window.addEventListener("gieomo_settings_updated", handleSettingsUpdate);
    return () => window.removeEventListener("gieomo_settings_updated", handleSettingsUpdate);
  }, []);

  useEffect(() => {
    if (queryProductId && availableProducts.length > 0) {
      const targetProd = availableProducts.find((p) => p.product_id === queryProductId);
      if (targetProd) {
        const firstVar = targetProd.variants?.[0];
        setOrderItems([
          {
            productId: targetProd.product_id,
            variantId: firstVar?.variant_id,
            name: targetProd.name,
            variantName: firstVar?.name,
            price: firstVar?.price || targetProd.price,
            quantity: 1,
          },
        ]);
      }
    }
  }, [queryProductId, availableProducts]);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [addressDetail, setAddressDetail] = useState("");
  const [province, setProvince] = useState("TP. Hồ Chí Minh");
  const [customerNote, setCustomerNote] = useState("");

  // QR Modal
  const [activeQrModal, setActiveQrModal] = useState<{
    orderCode: string;
    orderId: string;
    amount: number;
    qrUrl: string;
  } | null>(null);
  const [copiedMemo, setCopiedMemo] = useState(false);
  const [orderCreatedSuccess, setOrderCreatedSuccess] = useState<Order | null>(null);

  const defaultProd = availableProducts[0] || { product_id: "prod-1", name: "Sản phẩm", price: 85000 };

  // Selected Order Items
  const [orderItems, setOrderItems] = useState<
    Array<{
      productId: string;
      variantId?: string;
      name: string;
      variantName?: string;
      price: number;
      quantity: number;
    }>
  >([
    {
      productId: defaultProd.product_id,
      name: defaultProd.name,
      price: defaultProd.price,
      quantity: 1,
    },
  ]);

  const handleAddItem = () => {
    if (availableProducts.length === 0) return;
    const p = availableProducts[0];
    setOrderItems((prev) => [
      ...prev,
      {
        productId: p.product_id,
        name: p.name,
        price: p.price,
        quantity: 1,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (orderItems.length <= 1) return;
    setOrderItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleProductChange = (index: number, prodId: string) => {
    const selectedProd = availableProducts.find((p) => p.product_id === prodId);
    if (!selectedProd) return;

    setOrderItems((prev) =>
      prev.map((item, i) => {
        if (i === index) {
          const firstVariant = selectedProd.variants?.[0];
          return {
            productId: selectedProd.product_id,
            variantId: firstVariant?.variant_id,
            name: selectedProd.name,
            variantName: firstVariant?.name,
            price: firstVariant?.price || selectedProd.price,
            quantity: 1,
          };
        }
        return item;
      })
    );
  };

  const handleVariantChange = (index: number, variantId: string) => {
    setOrderItems((prev) =>
      prev.map((item, i) => {
        if (i === index) {
          const prod = availableProducts.find((p) => p.product_id === item.productId);
          const variant = prod?.variants?.find((v) => v.variant_id === variantId);
          return {
            ...item,
            variantId: variantId,
            variantName: variant?.name,
            price: variant?.price || item.price,
          };
        }
        return item;
      })
    );
  };

  const handleQuantityChange = (index: number, qty: number) => {
    setOrderItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, quantity: Math.max(1, qty) } : item))
    );
  };

  // Calculations
  const subtotal = useMemo(
    () => orderItems.reduce((acc, item) => acc + item.price * item.quantity, 0),
    [orderItems]
  );
  const isFreeship = (settings.freeShippingThreshold ?? 0) > 0 && subtotal >= (settings.freeShippingThreshold ?? 0);
  const baseShippingFee = settings.flatShippingFee !== undefined ? settings.flatShippingFee : 15000;
  const shippingFee = isFreeship ? 0 : baseShippingFee;
  const finalAmount = useMemo(() => subtotal + shippingFee, [subtotal, shippingFee]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !customerPhone.trim()) {
      alert("Vui lòng điền họ tên và số điện thoại của người nhận!");
      return;
    }

    const randomCode = `GM-${Math.floor(100000 + Math.random() * 900000)}`;
    const newOrderId = `ord-${Date.now()}`;

    const orderItemsSnapshot: OrderItem[] = orderItems.map((item, idx) => {
      const prod = availableProducts.find((p) => p.product_id === item.productId);
      const variant = prod?.variants?.find((v) => v.variant_id === item.variantId) || prod?.variants?.[0];
      return {
        order_item_id: `item-${newOrderId}-${idx + 1}`,
        order_id: newOrderId,
        product_id: item.productId,
        variant_id: item.variantId || variant?.variant_id || null,
        combo_id: null,
        product_name_snapshot: item.name,
        item_name_snapshot: item.name,
        variant_name_snapshot: item.variantName || variant?.name || null,
        price_snapshot: item.price,
        quantity: item.quantity,
        subtotal: item.price * item.quantity,
        created_at: new Date().toISOString(),
      };
    });

    const memberName = session?.name || "Thành viên";
    const refCode = session?.referralCode || "";

    const newOrder: Order = {
      order_id: newOrderId,
      order_code: randomCode,
      buyer_name: customerName,
      buyer_phone: customerPhone,
      buyer_email: customerEmail || "",
      recipient_name: customerName,
      recipient_phone: customerPhone,
      delivery_type: "home_delivery",
      address_detail: addressDetail || "Địa chỉ giao hàng",
      district: "",
      province: province,
      payment_method: "banking",
      payment_status: "pending",
      order_status: "pending",
      delivery_status: "not_ready",
      subtotal,
      discount_amount: 0,
      shipping_fee: shippingFee,
      final_amount: finalAmount,
      total_cost: Math.round(finalAmount * 0.4),
      seller_id: session?.memberId || null,
      introducer_info: refCode ? `${memberName} (${refCode})` : memberName,
      referral_code: refCode || null,
      created_by_member_id: session?.memberId || null,
      customer_note: customerNote ? `[Thành viên chốt]: ${customerNote}` : "Thành viên chốt đơn hộ",
      items: orderItemsSnapshot,
      created_at: new Date().toISOString(),
      completed_at: null,
      updated_at: new Date().toISOString(),
    };

    saveNewOrder(newOrder);
    setOrderCreatedSuccess(newOrder);

    const qrUrl =
      settings.qrMode === "upload" && settings.qrImageUrl
        ? settings.qrImageUrl
        : `https://img.vietqr.io/image/MB-${settings.bankNumber || "0888670637"}-compact2.png?amount=${finalAmount}&addInfo=${encodeURIComponent(
            `${randomCode} ${customerPhone}`
          )}&accountName=${encodeURIComponent(settings.bankHolder || "NGUYEN THI TRUC HAN")}`;

    setActiveQrModal({
      orderCode: randomCode,
      orderId: newOrderId,
      amount: finalAmount,
      qrUrl,
    });
  };

  const handleResetForm = () => {
    setCustomerName("");
    setCustomerPhone("");
    setCustomerEmail("");
    setAddressDetail("");
    setCustomerNote("");
    setOrderCreatedSuccess(null);
    setActiveQrModal(null);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/sale"
            className="p-2 rounded-xl text-gray-500 hover:bg-white hover:text-gray-900 transition-colors border border-gray-200"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="font-heading font-extrabold text-xl sm:text-2xl text-[#231B16]">
              Nhập Đơn Hộ Cho Khách
            </h1>
            <p className="text-xs text-gray-400">
              Tạo đơn trực tiếp cho người quen — Đơn hàng sẽ được ghi nhận cho bạn.
            </p>
          </div>
        </div>

        {/* Member Tag */}
        <div className="hidden sm:flex items-center gap-2 bg-[#EBF7EE] border border-[#BFE9C3] px-3.5 py-1.5 rounded-2xl">
          <span className="text-xs text-[#16381D] font-bold">
            🌱 {session?.name} ({session?.referralCode || "BTC Sale"})
          </span>
        </div>
      </div>

      {orderCreatedSuccess && !activeQrModal && (
        <div className="p-6 rounded-3xl bg-emerald-50 border border-emerald-200 space-y-4">
          <div className="flex items-center gap-3 text-emerald-900">
            <CheckCircle className="w-6 h-6 text-emerald-600 shrink-0" />
            <div>
              <h3 className="font-bold text-base">Đã tạo đơn thành công!</h3>
              <p className="text-xs text-emerald-700">
                Mã đơn hàng: <span className="font-mono font-bold text-emerald-950">{orderCreatedSuccess.order_code}</span> cho khách <span className="font-bold">{orderCreatedSuccess.buyer_name}</span>.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleResetForm}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              + Nhập tiếp đơn khác
            </button>
            <Link
              href="/sale/orders"
              className="px-4 py-2 bg-white text-emerald-900 border border-emerald-300 hover:bg-emerald-50 rounded-xl text-xs font-bold transition-colors"
            >
              Xem danh sách đơn
            </Link>
          </div>
        </div>
      )}

      {/* Main Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Attribution Card */}
        <div className="bg-white rounded-3xl p-5 border border-emerald-100/90 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#EBF7EE] text-[#16381D] font-bold text-base flex items-center justify-center border border-[#BFE9C3]">
              🌱
            </div>
            <div>
              <span className="text-[11px] text-gray-400 font-semibold block uppercase tracking-wider">
                Ghi nhận hoa hồng / doanh số cho
              </span>
              <span className="text-sm font-extrabold text-[#16381D]">
                {session?.name || "Bạn"} — Mã Referral: {session?.referralCode || "N/A"}
              </span>
            </div>
          </div>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
            ✓ Tự động gán mã của bạn
          </span>
        </div>

        {/* Customer Information */}
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-xs space-y-4">
          <h2 className="font-heading font-extrabold text-base text-[#231B16] border-b border-gray-100 pb-3">
            1. Thông Tin Khách Hàng
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Họ và tên khách hàng *"
              placeholder="Nguyễn Văn A"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              required
            />
            <Input
              label="Số điện thoại người nhận *"
              placeholder="0912345678"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              required
            />
          </div>

          <Input
            label="Email khách hàng (nếu có, để nhận thông báo đơn)"
            type="email"
            placeholder="khachhang@gmail.com"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
          />
        </div>

        {/* Products Selection */}
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <h2 className="font-heading font-extrabold text-base text-[#231B16]">
              2. Chọn Sản Phẩm Đặt Mua
            </h2>
            <button
              type="button"
              onClick={handleAddItem}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 hover:text-emerald-950 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Thêm sản phẩm</span>
            </button>
          </div>

          <div className="space-y-3">
            {orderItems.map((item, idx) => {
              const prod = availableProducts.find((p) => p.product_id === item.productId);
              const hasVariants = Boolean(prod?.variants && prod.variants.length > 0);

              return (
                <div
                  key={idx}
                  className="p-4 rounded-2xl bg-gray-50 border border-gray-200/80 flex flex-col md:flex-row items-stretch md:items-center gap-3"
                >
                  {/* Product selector */}
                  <div className="flex-1">
                    <label className="text-[11px] font-bold text-gray-500 mb-1 block">
                      Sản phẩm
                    </label>
                    <select
                      className="w-full h-10 px-3 rounded-xl border border-gray-300 bg-white text-xs font-semibold text-gray-800 focus:outline-none focus:border-emerald-600 cursor-pointer"
                      value={item.productId}
                      onChange={(e) => handleProductChange(idx, e.target.value)}
                    >
                      {availableProducts.map((p) => (
                        <option key={p.product_id} value={p.product_id}>
                          {p.name} — {p.price.toLocaleString("vi-VN")}đ
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Variant selector */}
                  {hasVariants && (
                    <div className="w-full md:w-44">
                      <label className="text-[11px] font-bold text-gray-500 mb-1 block">
                        Phân loại
                      </label>
                      <select
                        className="w-full h-10 px-3 rounded-xl border border-gray-300 bg-white text-xs font-semibold text-gray-800 focus:outline-none focus:border-emerald-600 cursor-pointer"
                        value={item.variantId || ""}
                        onChange={(e) => handleVariantChange(idx, e.target.value)}
                      >
                        {prod?.variants?.map((v) => (
                          <option key={v.variant_id} value={v.variant_id}>
                            {v.name} ({(v.price ?? prod.price).toLocaleString("vi-VN")}đ)
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Quantity */}
                  <div className="w-full md:w-28">
                    <label className="text-[11px] font-bold text-gray-500 mb-1 block">
                      Số lượng
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={item.quantity}
                      onChange={(e) => handleQuantityChange(idx, parseInt(e.target.value) || 1)}
                      className="w-full h-10 px-3 rounded-xl border border-gray-300 bg-white text-xs font-bold text-center text-gray-900 focus:outline-none focus:border-emerald-600"
                    />
                  </div>

                  {/* Price */}
                  <div className="w-full md:w-32 flex md:flex-col justify-between items-end md:items-end">
                    <span className="text-[11px] font-bold text-gray-400">Thành tiền</span>
                    <span className="font-extrabold text-sm text-[#16381D]">
                      {(item.price * item.quantity).toLocaleString("vi-VN")}đ
                    </span>
                  </div>

                  {/* Delete Button */}
                  {orderItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      className="p-2.5 rounded-xl text-red-500 hover:bg-red-50 hover:text-red-700 transition-colors self-end md:self-center cursor-pointer"
                      title="Xoá món này"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Delivery & Payment */}
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-xs space-y-4">
          <h2 className="font-heading font-extrabold text-base text-[#231B16] border-b border-gray-100 pb-3">
            3. Nhận Hàng & Thanh Toán
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-gray-700 mb-1.5 block">
                Hình thức nhận hàng
              </label>
              <select
                className="w-full h-11 px-3 rounded-2xl border border-emerald-200 bg-emerald-50/40 text-xs font-bold text-emerald-950 focus:outline-none cursor-default"
                value="home_delivery"
                disabled
              >
                <option value="home_delivery">
                  Giao tận nơi ({isFreeship ? "Miễn phí 0đ" : `+${(settings.flatShippingFee ?? 15000).toLocaleString("vi-VN")}đ`})
                </option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 mb-1.5 block">
                Phương thức thanh toán
              </label>
              <select
                className="w-full h-11 px-3 rounded-2xl border border-emerald-200 bg-emerald-50/40 text-xs font-bold text-emerald-950 focus:outline-none cursor-default"
                value="banking"
                disabled
              >
                <option value="banking">Chuyển khoản Ngân hàng (VietQR)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Địa chỉ chi tiết (Số nhà, đường, phường/xã) *"
              placeholder="Ví dụ: 227 Nguyễn Văn Cừ, P.4, Q.5"
              value={addressDetail}
              onChange={(e) => setAddressDetail(e.target.value)}
              required
            />
            <Select
              label="Tỉnh / Thành phố *"
              value={province}
              onChange={(e) => setProvince(e.target.value)}
              options={[
                { value: "TP. Hồ Chí Minh", label: "TP. Hồ Chí Minh" },
                { value: "Hà Nội", label: "Hà Nội" },
                { value: "Tây Ninh", label: "Tây Ninh" },
                { value: "Đồng Tháp", label: "Đồng Tháp" },
                { value: "Bình Dương", label: "Bình Dương" },
                { value: "Đồng Nai", label: "Đồng Nai" },
                { value: "Long An", label: "Long An" },
                { value: "Tiền Giang", label: "Tiền Giang" },
                { value: "Bến Tre", label: "Bến Tre" },
                { value: "Cần Thơ", label: "Cần Thơ" },
                { value: "Đà Nẵng", label: "Đà Nẵng" },
                { value: "Hải Phòng", label: "Hải Phòng" },
                { value: "Bà Rịa - Vũng Tàu", label: "Bà Rịa - Vũng Tàu" },
                { value: "Lâm Đồng", label: "Lâm Đồng" },
                { value: "Khánh Hòa", label: "Khánh Hòa" },
                { value: "Tỉnh thành khác", label: "Các tỉnh thành khác" },
              ]}
            />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-700 mb-1.5 block">
              Ghi chú thêm cho đơn (nếu có)
            </label>
            <input
              type="text"
              placeholder="Ví dụ: Giao giờ hành chính, gọi trước khi đến..."
              value={customerNote}
              onChange={(e) => setCustomerNote(e.target.value)}
              className="w-full h-11 px-4 rounded-2xl border border-gray-200 bg-white text-xs text-gray-800 focus:outline-none focus:border-emerald-600"
            />
          </div>
        </div>

        {/* Order Summary Box & Submit */}
        <div className="bg-[#16381D] rounded-3xl p-6 text-white space-y-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-emerald-100/90 pb-3 border-b border-[#264E2E]">
            <span>Tạm tính tiền hàng:</span>
            <span className="font-bold">{subtotal.toLocaleString("vi-VN")}đ</span>
          </div>
          <div className="flex items-center justify-between text-xs text-emerald-100/90 pb-3 border-b border-[#264E2E]">
            <span>Phí vận chuyển:</span>
            <span className="font-bold">
              {shippingFee === 0 ? "Miễn phí" : `${shippingFee.toLocaleString("vi-VN")}đ`}
            </span>
          </div>
          <div className="flex items-center justify-between text-base sm:text-lg font-extrabold text-[#BFE9C3]">
            <span>TỔNG CỘNG THANH TOÁN:</span>
            <span>{finalAmount.toLocaleString("vi-VN")}đ</span>
          </div>

          <button
            type="submit"
            className="w-full h-12 bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] rounded-2xl font-bold text-sm transition-all duration-200 shadow-md active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2"
          >
            <CheckCircle className="w-5 h-5" />
            <span>Xác nhận & Hoàn tất tạo đơn hộ</span>
          </button>
        </div>
      </form>

      {/* VietQR Modal */}
      {activeQrModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 animate-in fade-in" style={{ willChange: "opacity" }}>
          <div
            className="bg-white rounded-3xl max-w-sm w-full p-6 text-center space-y-4 shadow-2xl animate-in zoom-in-95 duration-200"
            style={{ willChange: "transform, opacity", transform: "translateZ(0)" }}
          >
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-800 flex items-center justify-center mx-auto text-xl">
              ✓
            </div>
            <div>
              <h3 className="font-heading font-extrabold text-lg text-gray-900">
                Tạo Đơn Hàng Thành Công!
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Mã đơn: <span className="font-mono font-bold text-emerald-900">{activeQrModal.orderCode}</span>
              </p>
            </div>

            <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100 space-y-2">
              <span className="text-[11px] font-bold text-gray-500 block uppercase">
                Mã QR Chuyển Khoản
              </span>
              <div className="w-48 h-48 mx-auto relative bg-white p-2 rounded-xl border border-gray-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={activeQrModal.qrUrl}
                  alt="VietQR"
                  className="w-full h-full object-contain"
                />
              </div>
              <p className="text-xs font-extrabold text-emerald-900">
                Số tiền: {activeQrModal.amount.toLocaleString("vi-VN")}đ
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                const info = `Đơn hàng Gieo Mơ: ${activeQrModal.orderCode}\nSố tiền: ${activeQrModal.amount.toLocaleString("vi-VN")}đ\nSố TK: ${settings.bankNumber} (${settings.bankName})\nChủ TK: ${settings.bankHolder}\nNội dung CK: ${activeQrModal.orderCode}`;
                navigator.clipboard.writeText(info);
                setCopiedMemo(true);
                setTimeout(() => setCopiedMemo(false), 2000);
              }}
              className="w-full py-2.5 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-900 text-xs font-bold hover:bg-emerald-100 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {copiedMemo ? <Check className="w-4 h-4 text-emerald-700" /> : <Copy className="w-4 h-4 text-emerald-700" />}
              <span>{copiedMemo ? "Đã sao chép thông tin CK!" : "Sao chép thông tin CK gửi khách"}</span>
            </button>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleResetForm}
                className="flex-1 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs transition-colors cursor-pointer"
              >
                Nhập đơn mới
              </button>
              <Link
                href="/sale/orders"
                className="flex-1 py-2.5 rounded-xl bg-[#16381D] hover:bg-[#234E2B] text-white font-bold text-xs transition-colors inline-flex items-center justify-center"
              >
                Xem đơn vừa tạo
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SaleCreateOrderPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[50vh] flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 rounded-full border-2 border-emerald-600 border-t-transparent animate-spin" />
            <span className="text-xs font-semibold text-gray-500">Đang tải form nhập đơn...</span>
          </div>
        </div>
      }
    >
      <SaleCreateOrderForm />
    </Suspense>
  );
}
