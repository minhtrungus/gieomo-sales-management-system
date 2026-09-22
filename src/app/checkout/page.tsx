"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { useCartStore } from "@/store/cart";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { checkoutSchema, type CheckoutInput } from "@/lib/validations/schemas";

export default function CheckoutPage() {
  const router = useRouter();
  const { items, getSubtotal, clearCart } = useCartStore();
  const subtotal = getSubtotal();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [differentRecipient, setDifferentRecipient] = useState(false);
  const [deliveryType, setDeliveryType] = useState<"home_delivery" | "pickup_point" | "self_pickup">("home_delivery");
  const [paymentMethod, setPaymentMethod] = useState<"banking" | "cod">("banking");

  // Form Fields
  const [formData, setFormData] = useState({
    buyer_name: "",
    buyer_phone: "",
    buyer_email: "",
    recipient_name: "",
    recipient_phone: "",
    address_detail: "",
    district: "",
    province: "TP. Hồ Chí Minh",
    pickup_point_id: "",
    note: "",
    voucher_code: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const shippingFee = deliveryType === "self_pickup" ? 0 : subtotal >= 200000 ? 0 : 25000;
  const discountAmount = formData.voucher_code.toUpperCase() === "GIEOMO10" ? Math.round(subtotal * 0.1) : 0;
  const finalAmount = Math.max(0, subtotal - discountAmount + shippingFee);

  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

  const handleInputChange = (field: string, val: string) => {
    setFormData((prev) => ({ ...prev, [field]: val }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }));
    }
  };

  const handleValidateForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) return;

    setErrors({});

    const payload: CheckoutInput = {
      customer_name: formData.buyer_name,
      customer_phone: formData.buyer_phone,
      customer_email: formData.buyer_email || undefined,
      receiver_name: differentRecipient ? formData.recipient_name : formData.buyer_name,
      receiver_phone: differentRecipient ? formData.recipient_phone : formData.buyer_phone,
      delivery_type: deliveryType,
      shipping_address: deliveryType === "home_delivery" ? `${formData.address_detail}, ${formData.district}, ${formData.province}` : undefined,
      pickup_point_id: deliveryType === "pickup_point" ? formData.pickup_point_id || "pp-1" : undefined,
      payment_method: paymentMethod,
      customer_note: formData.note || undefined,
      voucher_code: formData.voucher_code || undefined,
    };

    const validation = checkoutSchema.safeParse(payload);

    if (!validation.success) {
      const formattedErrors: Record<string, string> = {};
      validation.error.issues.forEach((issue) => {
        const path = issue.path[0]?.toString();
        if (path === "customer_name") formattedErrors["buyer_name"] = issue.message;
        else if (path === "customer_phone") formattedErrors["buyer_phone"] = issue.message;
        else if (path === "customer_email") formattedErrors["buyer_email"] = issue.message;
        else if (path === "receiver_name") formattedErrors["recipient_name"] = issue.message;
        else if (path === "receiver_phone") formattedErrors["recipient_phone"] = issue.message;
        else if (path === "shipping_address") {
          if (!formData.address_detail.trim()) formattedErrors["address_detail"] = "Vui lòng nhập số nhà, tên đường";
          if (!formData.district.trim()) formattedErrors["district"] = "Vui lòng nhập quận / huyện";
        } else if (path === "pickup_point_id") {
          formattedErrors["pickup_point_id"] = issue.message;
        } else if (path) {
          formattedErrors[path] = issue.message;
        }
      });
      setErrors(formattedErrors);
      return;
    }

    // Extra check for delivery address detail
    if (deliveryType === "home_delivery") {
      const addrErrors: Record<string, string> = {};
      if (!formData.address_detail.trim()) addrErrors["address_detail"] = "Vui lòng nhập địa chỉ chi tiết (số nhà, đường)";
      if (!formData.district.trim()) addrErrors["district"] = "Vui lòng nhập quận / huyện";
      if (Object.keys(addrErrors).length > 0) {
        setErrors(addrErrors);
        return;
      }
    }

    // Validated! Open confirmation modal
    setIsConfirmModalOpen(true);
  };

  const handleFinalSubmit = () => {
    setIsSubmitting(true);
    setIsConfirmModalOpen(false);

    // Generate Order Code
    const randomCode = `GM-${Math.floor(100000 + Math.random() * 900000)}`;

    // Simulate order submission API call
    setTimeout(() => {
      clearCart();
      router.push(`/order/success?code=${randomCode}&payment=${paymentMethod}&amount=${finalAmount}`);
    }, 800);
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen flex flex-col bg-cream/60">
        <Navbar />
        <main className="flex-1 container mx-auto px-4 py-16 text-center space-y-4">
          <span className="text-5xl">🛒</span>
          <h1 className="font-heading font-extrabold text-2xl text-emerald-950">
            Giỏ hàng của bạn đang trống
          </h1>
          <p className="text-gray-600 text-sm">Vui lòng chọn sản phẩm trước khi tiến hành thanh toán nhé.</p>
          <Link href="/products" className="inline-block pt-2">
            <Button variant="primary">Khám phá sản phẩm</Button>
          </Link>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-cream/60">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 sm:px-6 py-8 md:py-12">
        <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-emerald-950 mb-8">
          Thanh toán đơn hàng gây quỹ
        </h1>

        <form onSubmit={handleValidateForm} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Form Controls - Left 7 Cols */}
          <div className="lg:col-span-7 space-y-6">
            {/* Customer Info Box */}
            <div className="bg-white rounded-3xl p-6 border border-emerald-100 shadow-xs space-y-4">
              <h2 className="font-heading font-bold text-lg text-emerald-950 flex items-center gap-2">
                <span>1.</span> Thông tin người đặt
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Họ và tên người đặt *"
                  placeholder="Ví dụ: Nguyễn Văn A"
                  value={formData.buyer_name}
                  onChange={(e) => handleInputChange("buyer_name", e.target.value)}
                  error={errors.buyer_name}
                />

                <Input
                  label="Số điện thoại *"
                  placeholder="Ví dụ: 0901234567"
                  value={formData.buyer_phone}
                  onChange={(e) => handleInputChange("buyer_phone", e.target.value)}
                  error={errors.buyer_phone}
                />
              </div>

              <Input
                label="Email (Không bắt buộc - nhận thông báo đơn hàng)"
                placeholder="nguyenvana@example.com"
                type="email"
                value={formData.buyer_email}
                onChange={(e) => handleInputChange("buyer_email", e.target.value)}
                error={errors.buyer_email}
              />

              <div className="pt-2">
                <label className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-gray-700">
                  <input
                    type="checkbox"
                    checked={differentRecipient}
                    onChange={(e) => setDifferentRecipient(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  Giao cho người khác nhận (quà tặng / đặt hộ)
                </label>
              </div>

              {differentRecipient && (
                <div className="p-4 rounded-2xl bg-cream/70 border border-emerald-100 space-y-4 animate-in fade-in">
                  <h4 className="text-xs font-bold text-emerald-900 uppercase">Thông tin người nhận:</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="Họ tên người nhận *"
                      placeholder="Tên người nhận"
                      value={formData.recipient_name}
                      onChange={(e) => handleInputChange("recipient_name", e.target.value)}
                      error={errors.recipient_name}
                    />
                    <Input
                      label="SĐT người nhận *"
                      placeholder="SĐT người nhận"
                      value={formData.recipient_phone}
                      onChange={(e) => handleInputChange("recipient_phone", e.target.value)}
                      error={errors.recipient_phone}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Delivery Method Box */}
            <div className="bg-white rounded-3xl p-6 border border-emerald-100 shadow-xs space-y-4">
              <h2 className="font-heading font-bold text-lg text-emerald-950 flex items-center gap-2">
                <span>2.</span> Hình thức nhận hàng
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { id: "home_delivery", label: "Giao tận nơi", desc: "Nội thành 25k / Miễn phí >200k" },
                  { id: "pickup_point", label: "Nhận tại điểm", desc: "Điểm hẹn Mầm Mơ" },
                  { id: "self_pickup", label: "Tự đến lấy", desc: "Tại văn phòng BTC" },
                ].map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setDeliveryType(option.id as any)}
                    className={`p-3.5 rounded-2xl text-left border transition-all ${
                      deliveryType === option.id
                        ? "bg-soft-green/40 border-emerald-600 ring-2 ring-emerald-600/20"
                        : "bg-white border-gray-200 hover:border-emerald-200"
                    }`}
                  >
                    <span className="block text-xs font-bold text-emerald-950">{option.label}</span>
                    <span className="block text-[11px] text-gray-500 mt-0.5">{option.desc}</span>
                  </button>
                ))}
              </div>

              {deliveryType === "home_delivery" && (
                <div className="space-y-4 pt-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Select
                      label="Tỉnh / Thành phố *"
                      value={formData.province}
                      onChange={(e) => handleInputChange("province", e.target.value)}
                      options={[
                        { value: "TP. Hồ Chí Minh", label: "TP. Hồ Chí Minh" },
                        { value: "Hà Nội", label: "Hà Nội" },
                        { value: "Đà Nẵng", label: "Đà Nẵng" },
                        { value: "Tỉnh khác", label: "Các tỉnh thành khác" },
                      ]}
                    />
                    <Input
                      label="Quận / Huyện *"
                      placeholder="Ví dụ: Quận 1"
                      value={formData.district}
                      onChange={(e) => handleInputChange("district", e.target.value)}
                      error={errors.district}
                    />
                  </div>
                  <Input
                    label="Địa chỉ chi tiết (Số nhà, tên đường, phường) *"
                    placeholder="Ví dụ: 123 Nguyễn Huệ, Phường Bến Nghé"
                    value={formData.address_detail}
                    onChange={(e) => handleInputChange("address_detail", e.target.value)}
                    error={errors.address_detail}
                  />
                </div>
              )}

              {deliveryType === "pickup_point" && (
                <div className="pt-2">
                  <Select
                    label="Chọn điểm hẹn nhận hàng *"
                    value={formData.pickup_point_id}
                    onChange={(e) => handleInputChange("pickup_point_id", e.target.value)}
                    options={[
                      { value: "pp-1", label: "Cổng trường ĐH Kinh Tế - TP.HCM (Quận 10)" },
                      { value: "pp-2", label: "Cơ sở Mầm Mơ Quận 3 (T2-T6: 8h-17h)" },
                    ]}
                  />
                </div>
              )}
            </div>

            {/* Payment Method Box */}
            <div className="bg-white rounded-3xl p-6 border border-emerald-100 shadow-xs space-y-4">
              <h2 className="font-heading font-bold text-lg text-emerald-950 flex items-center gap-2">
                <span>3.</span> Phương thức thanh toán
              </h2>

              <div className="space-y-3">
                <label
                  className={`flex items-start gap-3 p-4 rounded-2xl border cursor-pointer transition-all ${
                    paymentMethod === "banking"
                      ? "bg-soft-green/40 border-emerald-600 ring-2 ring-emerald-600/20"
                      : "bg-white border-gray-200"
                  }`}
                >
                  <input
                    type="radio"
                    name="payment"
                    value="banking"
                    checked={paymentMethod === "banking"}
                    onChange={() => setPaymentMethod("banking")}
                    className="mt-1 text-emerald-600"
                  />
                  <div>
                    <span className="block text-sm font-bold text-emerald-950">
                      Chuyển khoản Ngân hàng (VietQR - Nhanh chóng)
                    </span>
                    <span className="block text-xs text-gray-500 mt-0.5">
                      Quét mã QR tự động điền số tiền và nội dung chuyển khoản sau khi hoàn tất đơn hàng.
                    </span>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-3 p-4 rounded-2xl border cursor-pointer transition-all ${
                    paymentMethod === "cod"
                      ? "bg-soft-green/40 border-emerald-600 ring-2 ring-emerald-600/20"
                      : "bg-white border-gray-200"
                  }`}
                >
                  <input
                    type="radio"
                    name="payment"
                    value="cod"
                    checked={paymentMethod === "cod"}
                    onChange={() => setPaymentMethod("cod")}
                    className="mt-1 text-emerald-600"
                  />
                  <div>
                    <span className="block text-sm font-bold text-emerald-950">
                      Thanh toán khi nhận hàng (COD)
                    </span>
                    <span className="block text-xs text-gray-500 mt-0.5">
                      Thanh toán bằng tiền mặt trực tiếp cho nhân viên giao hàng khi nhận sản phẩm.
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* Note Input */}
            <div className="bg-white rounded-3xl p-6 border border-emerald-100 shadow-xs">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block mb-2">
                Ghi chú đơn hàng (nếu có):
              </label>
              <textarea
                value={formData.note}
                onChange={(e) => handleInputChange("note", e.target.value)}
                placeholder="Nhắn gửi điều gì đó cho Mầm Mơ hoặc lưu ý giao hàng..."
                rows={3}
                className="w-full p-3 rounded-2xl border border-gray-200 text-sm outline-none focus:border-soft-green"
              />
            </div>
          </div>

          {/* Sidebar Summary - Right 5 Cols */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white rounded-3xl p-6 border border-emerald-100 shadow-xs space-y-6 sticky top-24">
              <h3 className="font-heading font-bold text-xl text-emerald-950 border-b border-gray-100 pb-3">
                Đơn hàng của bạn ({items.length} món)
              </h3>

              {/* Items List */}
              <div className="max-h-60 overflow-y-auto divide-y divide-gray-100 pr-1">
                {items.map((item) => (
                  <div key={`${item.product_id}-${item.variant_id}`} className="py-2.5 flex items-center justify-between text-xs">
                    <div className="min-w-0 pr-2">
                      <span className="font-semibold text-gray-900 block truncate">{item.product_name}</span>
                      {item.variant_name && <span className="text-gray-500 text-[11px] block">{item.variant_name}</span>}
                      <span className="text-gray-500">x{item.quantity}</span>
                    </div>
                    <MoneyDisplay amount={item.price * item.quantity} className="font-bold text-gray-900 shrink-0" />
                  </div>
                ))}
              </div>

              {/* Financial Calculation */}
              <div className="space-y-3 pt-3 border-t border-gray-100 text-xs">
                <div className="flex justify-between text-gray-600">
                  <span>Tạm tính:</span>
                  <MoneyDisplay amount={subtotal} className="font-bold text-gray-900" />
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-emerald-700 font-semibold">
                    <span>Giảm giá:</span>
                    <span>-<MoneyDisplay amount={discountAmount} /></span>
                  </div>
                )}
                <div className="flex justify-between text-gray-600">
                  <span>Phí giao hàng:</span>
                  {shippingFee === 0 ? (
                    <span className="text-emerald-700 font-bold">Miễn phí</span>
                  ) : (
                    <MoneyDisplay amount={shippingFee} className="font-bold text-gray-900" />
                  )}
                </div>
              </div>

              {/* Total Box */}
              <div className="p-4 rounded-2xl bg-cream border border-emerald-100 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-emerald-800 uppercase block">Tổng cộng:</span>
                  <MoneyDisplay amount={finalAmount} className="text-2xl font-extrabold text-emerald-950" />
                </div>
              </div>

              {/* Validation Errors Summary Banner */}
              {Object.keys(errors).length > 0 && (
                <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-700 space-y-1.5 animate-in fade-in">
                  <p className="font-bold flex items-center gap-1.5">
                    <span>⚠️</span> Vui lòng bổ sung các thông tin còn thiếu:
                  </p>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px] text-red-600 font-medium">
                    {Object.values(errors).filter(Boolean).map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Submit CTA Button */}
              <Button
                type="submit"
                variant="primary"
                fullWidth
                size="lg"
                loading={isSubmitting}
              >
                {isSubmitting ? "Đang xử lý đơn hàng..." : "Xác nhận đặt hàng ➔"}
              </Button>

              <p className="text-[11px] text-gray-500 text-center leading-relaxed">
                🔒 Bằng việc nhấn Đặt hàng, bạn đồng ý trao gửi niềm tin cùng dự án gây quỹ Gieo Mơ.
              </p>
            </div>
          </div>
        </form>

        {/* MODAL: XÁC NHẬN ĐẶT HÀNG */}
        {isConfirmModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
            <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-7 border border-[#F0E5D8] shadow-2xl space-y-5 animate-in zoom-in-95">
              <div className="flex items-center justify-between border-b border-[#F0E5D8] pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">📦</span>
                  <h3 className="font-heading font-extrabold text-lg text-[#231B16]">
                    Xác nhận đặt đơn hàng
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsConfirmModalOpen(false)}
                  className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3 text-xs text-[#5C4D44] bg-[#FFF8EE] p-4 rounded-2xl border border-[#F0E5D8]">
                <div className="flex justify-between">
                  <span className="text-[#7E7068]">Người nhận:</span>
                  <span className="font-bold text-[#342A24]">
                    {differentRecipient ? formData.recipient_name : formData.buyer_name} ({differentRecipient ? formData.recipient_phone : formData.buyer_phone})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#7E7068]">Hình thức nhận:</span>
                  <span className="font-semibold text-[#342A24]">
                    {deliveryType === "home_delivery" ? "Giao tận nơi" : deliveryType === "pickup_point" ? "Điểm hẹn Mầm Mơ" : "Tự đến lấy"}
                  </span>
                </div>
                {deliveryType === "home_delivery" && (
                  <div className="flex justify-between">
                    <span className="text-[#7E7068]">Địa chỉ:</span>
                    <span className="font-semibold text-[#342A24] text-right max-w-[200px] truncate">
                      {formData.address_detail}, {formData.district}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-[#7E7068]">Thanh toán:</span>
                  <span className="font-bold text-[#2D6338]">
                    {paymentMethod === "banking" ? "Chuyển khoản VietQR" : "Tiền mặt khi nhận (COD)"}
                  </span>
                </div>
                <div className="pt-2 border-t border-[#F0E5D8] flex justify-between items-center text-sm">
                  <span className="font-bold text-[#231B16]">Tổng thanh toán:</span>
                  <MoneyDisplay amount={finalAmount} className="text-xl font-extrabold text-[#1B3622]" />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsConfirmModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
                >
                  Kiểm tra lại
                </button>
                <button
                  type="button"
                  onClick={handleFinalSubmit}
                  disabled={isSubmitting}
                  className="px-6 py-2.5 rounded-full bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-xs shadow-xs border border-[#9ed4a3] transition-all cursor-pointer"
                >
                  {isSubmitting ? "Đang xử lý..." : "Hoàn tất đặt đơn ➔"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
