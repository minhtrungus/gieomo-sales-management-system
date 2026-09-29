"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { useCartStore } from "@/store/cart";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { checkoutSchema, type CheckoutInput } from "@/lib/validations/schemas";
import { saveNewOrder, getStoredPickupPoints, getStoredVouchers, getStoredSettings, getStoredMembers, type StoredMember, DEFAULT_SETTINGS } from "@/lib/data/orderStore";
import type { Order, OrderItem, PickupPoint, Voucher } from "@/types/database";

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { items, getSubtotal, clearCart } = useCartStore();
  const subtotal = getSubtotal();
  const totalItemCount = items.reduce((acc, it) => acc + it.quantity, 0);

  const [siteSettings, setSiteSettings] = useState(DEFAULT_SETTINGS);

  useEffect(() => {
    setSiteSettings(getStoredSettings());
    const handleSettingsUpdate = () => setSiteSettings(getStoredSettings());
    window.addEventListener("gieomo_settings_updated", handleSettingsUpdate);
    return () => window.removeEventListener("gieomo_settings_updated", handleSettingsUpdate);
  }, []);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [differentRecipient, setDifferentRecipient] = useState(false);
  const [deliveryType, setDeliveryType] = useState<"home_delivery" | "member_delivery">("home_delivery");
  const [paymentMethod] = useState<"banking">("banking");

  // Members for acquaintance / referral matching
  const [activeMembers, setActiveMembers] = useState<StoredMember[]>([]);
  const [selectedMember, setSelectedMember] = useState<StoredMember | null>(null);
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const [showMemberSuggestions, setShowMemberSuggestions] = useState(false);
  const [noIntroducer, setNoIntroducer] = useState(false);

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
    introducer_info: "",
  });

  const [voucherApplied, setVoucherApplied] = useState<string | null>(null);
  const [voucherError, setVoucherError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const vParam = searchParams.get("voucher");
    if (vParam) {
      const code = vParam.toUpperCase();
      setFormData((prev) => ({ ...prev, voucher_code: code }));
      setVoucherApplied(code);
    }
  }, [searchParams]);

  useEffect(() => {
    const members = getStoredMembers().filter((m) => m.status === "active");
    setActiveMembers(members);

    // Capture referral code from URL (ref, refby, referrer, gioithieu), localStorage, or cookie
    const refParam =
      searchParams.get("ref") ||
      searchParams.get("refby") ||
      searchParams.get("referrer") ||
      searchParams.get("gioithieu");

    const getCookieRef = () => {
      if (typeof document === "undefined") return null;
      const match = document.cookie.match(/(^|;)\s*gieomo_referral_code=([^;]+)/);
      return match ? decodeURIComponent(match[2]) : null;
    };

    const savedRef =
      refParam ||
      (typeof window !== "undefined" ? localStorage.getItem("gieomo_referral_code") : null) ||
      getCookieRef();

    if (savedRef) {
      const clean = savedRef.trim();
      if (typeof window !== "undefined") {
        localStorage.setItem("gieomo_referral_code", clean);
      }
      const matched = members.find(
        (m) =>
          m.referralCode?.toUpperCase() === clean.toUpperCase() ||
          m.fullName?.toLowerCase() === clean.toLowerCase()
      );

      if (matched) {
        setSelectedMember(matched);
        setFormData((prev) => ({
          ...prev,
          introducer_info: `${matched.fullName} (${matched.referralCode})`,
        }));
      } else {
        setMemberSearchQuery(clean);
        setFormData((prev) => ({ ...prev, introducer_info: clean }));
      }
    }
  }, [searchParams]);

  const rawShippingFee = deliveryType !== "home_delivery" ? 0 : siteSettings.flatShippingFee;

  const calculateDiscount = () => {
    const code = (voucherApplied || formData.voucher_code).trim().toUpperCase();
    if (!code) return 0;
    const vouchers = getStoredVouchers();
    const found = vouchers.find((v) => v.code === code && v.status === "active");
    if (!found) return 0;
    if (found.min_order_value && subtotal < found.min_order_value) return 0;
    if (found.min_items_count && totalItemCount < found.min_items_count) return 0;

    if (found.discount_type === "freeship") {
      return rawShippingFee;
    }
    if (found.discount_type === "percentage") {
      const calc = Math.round((subtotal * found.discount_value) / 100);
      return found.max_discount_amount ? Math.min(calc, found.max_discount_amount) : calc;
    }
    return Math.min(subtotal, found.discount_value);
  };

  const discountAmount = calculateDiscount();
  const shippingFee = rawShippingFee;
  const finalAmount = Math.max(0, subtotal - discountAmount + shippingFee);

  const handleApplyVoucher = (codeOverride?: string) => {
    setVoucherError(null);
    const code = (codeOverride || formData.voucher_code).trim().toUpperCase();
    if (!code) {
      setVoucherError("Vui lòng nhập mã giảm giá");
      return;
    }
    const vouchers = getStoredVouchers();
    const found = vouchers.find((v) => v.code === code && v.status === "active");
    if (!found) {
      setVoucherError("Mã giảm giá không hợp lệ hoặc đã hết hạn");
      return;
    }
    if (found.min_order_value && subtotal < found.min_order_value) {
      setVoucherError(
        `Mã ${found.code} yêu cầu đơn từ ${found.min_order_value.toLocaleString("vi-VN")}đ trở lên (hiện tại: ${subtotal.toLocaleString("vi-VN")}đ)`
      );
      return;
    }
    if (found.min_items_count && totalItemCount < found.min_items_count) {
      setVoucherError(
        `Mã ${found.code} yêu cầu mua từ ${found.min_items_count} món trở lên (hiện có ${totalItemCount} món)`
      );
      return;
    }
    setVoucherApplied(found.code);
    handleInputChange("voucher_code", found.code);
  };

  const handleInputChange = (field: string, val: string) => {
    setFormData((prev) => ({ ...prev, [field]: val }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }));
    }
  };

  const handleSelectMember = (mem: StoredMember) => {
    setSelectedMember(mem);
    setNoIntroducer(false);
    setShowMemberSuggestions(false);
    setMemberSearchQuery("");
    setFormData((prev) => ({
      ...prev,
      introducer_info: `${mem.fullName} (${mem.referralCode})`,
    }));
    if (errors.introducer_info) {
      setErrors((prev) => ({ ...prev, introducer_info: "" }));
    }
  };

  const handleClearMember = () => {
    setSelectedMember(null);
    setMemberSearchQuery("");
    setNoIntroducer(true);
    setFormData((prev) => ({ ...prev, introducer_info: "Trực tiếp (Website)" }));
  };

  const filteredMembers = activeMembers.filter((m) => {
    if (!memberSearchQuery.trim()) return true;
    const q = memberSearchQuery.toLowerCase().trim();
    return (
      m.fullName.toLowerCase().includes(q) ||
      m.referralCode.toLowerCase().includes(q) ||
      m.phone.includes(q)
    );
  });

  const handleValidateForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0 || isSubmitting) return;

    setErrors({});

    const payload: CheckoutInput = {
      customer_name: formData.buyer_name,
      customer_phone: formData.buyer_phone,
      customer_email: formData.buyer_email || undefined,
      receiver_name: differentRecipient ? formData.recipient_name : formData.buyer_name,
      receiver_phone: differentRecipient ? formData.recipient_phone : formData.buyer_phone,
      delivery_type: deliveryType,
      shipping_address: deliveryType === "home_delivery" ? `${formData.address_detail}, ${formData.province}` : undefined,
      pickup_point_id: undefined,
      payment_method: "banking",
      customer_note: formData.note || undefined,
      voucher_code: formData.voucher_code || undefined,
      referral_code: selectedMember ? selectedMember.referralCode : undefined,
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
          if (!formData.address_detail.trim()) formattedErrors["address_detail"] = "Vui lòng nhập địa chỉ chi tiết nhận hàng";
        } else if (path) {
          formattedErrors[path] = issue.message;
        }
      });
      setErrors(formattedErrors);
      return;
    }

    // Extra check for delivery address detail
    if (deliveryType === "home_delivery") {
      if (!formData.address_detail.trim()) {
        setErrors({ address_detail: "Vui lòng nhập địa chỉ nhận hàng (Số nhà, đường, phường/xã...)" });
        return;
      }
    }

    if (deliveryType === "member_delivery" && !selectedMember && !formData.introducer_info.trim()) {
      setErrors({ introducer_info: "Vui lòng chọn hoặc nhập tên thành viên Mầm Mơ giao hàng cho bạn" });
      return;
    }

    // Validated! Directly create order and go straight to QR / payment screen
    setIsSubmitting(true);

    // Generate Order Code
    const randomCode = `GM-${Math.floor(100000 + Math.random() * 900000)}`;
    const newOrderId = `ord-${Date.now()}`;

    // Build order items snapshot
    const orderItemsSnapshot: OrderItem[] = items.map((it, idx) => ({
      order_item_id: `item-${newOrderId}-${idx + 1}`,
      order_id: newOrderId,
      product_id: it.product_id,
      variant_id: it.variant_id,
      combo_id: it.combo_id || null,
      product_name_snapshot: it.product_name || "Sản phẩm",
      item_name_snapshot: it.product_name || "Sản phẩm",
      variant_name_snapshot: it.variant_name || null,
      price_snapshot: it.price,
      quantity: it.quantity,
      subtotal: it.price * it.quantity,
      created_at: new Date().toISOString(),
    }));

    const finalSellerId = selectedMember ? selectedMember.memberId : null;
    const finalIntroducerText = selectedMember
      ? `${selectedMember.fullName} (${selectedMember.referralCode})`
      : noIntroducer
      ? "Trực tiếp (Website)"
      : formData.introducer_info || "Trực tiếp (Website)";

    const newOrderRecord: Order = {
      order_id: newOrderId,
      order_code: randomCode,
      buyer_name: formData.buyer_name,
      buyer_phone: formData.buyer_phone,
      buyer_email: formData.buyer_email || "",
      recipient_name: differentRecipient ? formData.recipient_name : formData.buyer_name,
      recipient_phone: differentRecipient ? formData.recipient_phone : formData.buyer_phone,
      delivery_type: deliveryType,
      address_detail:
        deliveryType === "home_delivery"
          ? formData.address_detail
          : `Giao qua tay thành viên: ${finalIntroducerText}`,
      district: "",
      province: formData.province || "TP. Hồ Chí Minh",
      payment_method: "banking",
      payment_status: "pending",
      order_status: "pending",
      delivery_status: "not_ready",
      subtotal: subtotal,
      discount_amount: discountAmount,
      shipping_fee: shippingFee,
      final_amount: finalAmount,
      total_cost: Math.round(finalAmount * 0.4),
      seller_id: finalSellerId,
      introducer_info: finalIntroducerText,
      referral_code: selectedMember ? selectedMember.referralCode : null,
      customer_note: formData.note || "",
      items: orderItemsSnapshot,
      created_at: new Date().toISOString(),
      completed_at: null,
      updated_at: new Date().toISOString(),
    };

    saveNewOrder(newOrderRecord);

    // Send order confirmation email asynchronously (if Resend is configured)
    try {
      fetch("/api/notify/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "order_confirmation",
          order: newOrderRecord,
          toEmail: formData.buyer_email || undefined,
        }),
      }).catch(() => {});
    } catch {
      // ignore
    }

    // Save to local customer history and update customers store
    try {
      const myRaw = localStorage.getItem("gieomo_my_order_codes");
      const myCodes = myRaw ? JSON.parse(myRaw) : [];
      localStorage.setItem("gieomo_my_order_codes", JSON.stringify([randomCode, ...myCodes.filter((c: string) => c !== randomCode)]));
      localStorage.setItem("gieomo_customer_profile", JSON.stringify({ name: formData.buyer_name, phone: formData.buyer_phone }));

      // Auto-sync customer record
      const custRaw = localStorage.getItem("gieomo_customers");
      const custList = custRaw ? JSON.parse(custRaw) : [];
      const cleanPhone = formData.buyer_phone.replace(/\s+/g, "");
      const existingIdx = custList.findIndex((c: any) => c.phone?.replace(/\s+/g, "") === cleanPhone);
      if (existingIdx >= 0) {
        custList[existingIdx].totalOrders = (custList[existingIdx].totalOrders || 1) + 1;
        custList[existingIdx].totalSpent = (custList[existingIdx].totalSpent || 0) + finalAmount;
        if (formData.buyer_name) custList[existingIdx].fullName = formData.buyer_name;
        if (formData.buyer_email) custList[existingIdx].email = formData.buyer_email;
      } else {
        custList.unshift({
          customerId: `cust-${Date.now()}`,
          fullName: formData.buyer_name,
          phone: formData.buyer_phone,
          email: formData.buyer_email || "",
          address: deliveryType === "home_delivery" ? `${formData.address_detail}, ${formData.province}` : "Nhận tại điểm Mầm Mơ",
          totalOrders: 1,
          totalSpent: finalAmount,
          createdAt: new Date().toISOString(),
        });
      }
      localStorage.setItem("gieomo_customers", JSON.stringify(custList));
    } catch {
      // ignore
    }

    // Navigate straight to the payment / QR code screen without intermediate modals or delay
    clearCart();
    router.push(`/order/success?code=${randomCode}&payment=${paymentMethod}&amount=${finalAmount}`);
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

      <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl py-8 md:py-12">
        <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-emerald-950 mb-8 text-balance">
          Thanh toán đơn hàng gây quỹ
        </h1>

        <form onSubmit={handleValidateForm} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Form Controls - Left 7 Cols */}
          <div className="lg:col-span-7 space-y-6">
            {/* Customer Info Box */}
            <div className="bg-white rounded-3xl p-6 border border-emerald-100 shadow-xs space-y-4">
              <h2 className="font-heading font-bold text-lg text-emerald-950 flex items-center gap-2">
                <span>1.</span> Thông tin nhận hàng
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Họ và tên *"
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {[
                  {
                    id: "home_delivery",
                    label: "Giao tận nơi",
                    desc: `Phí ship ${siteSettings.flatShippingFee ? `${siteSettings.flatShippingFee.toLocaleString("vi-VN")}đ` : "15.000đ"} toàn quốc`,
                  },
                  {
                    id: "member_delivery",
                    label: "Qua người quen",
                    desc: "Thành viên Mầm Mơ gửi trực tiếp",
                  },
                ].map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setDeliveryType(option.id as any)}
                    className={`p-3.5 rounded-2xl text-left border transition-all cursor-pointer ${
                      deliveryType === option.id
                        ? "bg-soft-green/40 border-emerald-600 ring-2 ring-emerald-600/20"
                        : "bg-white border-gray-200 hover:border-emerald-200"
                    }`}
                  >
                    <span className="block text-xs font-bold text-emerald-950">{option.label}</span>
                    <span className="block text-[10.5px] text-gray-500 mt-0.5 leading-tight">{option.desc}</span>
                  </button>
                ))}
              </div>

              {deliveryType === "home_delivery" && (
                <div className="space-y-4 pt-2">
                  <Select
                    label="Tỉnh / Thành phố *"
                    value={formData.province}
                    onChange={(e) => handleInputChange("province", e.target.value)}
                    options={[
                      { value: "TP. Hồ Chí Minh", label: "TP. Hồ Chí Minh" },
                      { value: "Hà Nội", label: "Hà Nội" },
                      { value: "Tây Ninh", label: "Tây Ninh" },
                      { value: "Đồng Tháp", label: "Đồng Tháp" },
                      { value: "Đà Nẵng", label: "Đà Nẵng" },
                      { value: "Bình Dương", label: "Bình Dương" },
                      { value: "Đồng Nai", label: "Đồng Nai" },
                      { value: "Cần Thơ", label: "Cần Thơ" },
                      { value: "Tỉnh khác", label: "Các tỉnh thành khác" },
                    ]}
                  />
                  <Input
                    label="Địa chỉ chi tiết nhận hàng (Số nhà, tên đường, phường/xã...) *"
                    placeholder="Ví dụ: 123 Nguyễn Huệ, Phường Bến Nghé"
                    value={formData.address_detail}
                    onChange={(e) => handleInputChange("address_detail", e.target.value)}
                    error={errors.address_detail}
                  />
                </div>
              )}

              {deliveryType === "member_delivery" && (
                <div className="p-4 rounded-2xl bg-[#EAF7ED] border border-[#BFE9C3] text-xs space-y-2 animate-in fade-in">
                  <div className="flex items-center gap-2 font-bold text-[#16381D]">
                    <span>🌱</span>
                    <span>Hình thức: Nhận hàng thông qua thành viên của Gieo Mơ</span>
                  </div>
                  <p className="text-[#386341] leading-relaxed">
                    Bạn quen thành viên trong Gieo Mơ? Hãy chọn hoặc nhập <strong>tên/mã của bạn ấy</strong> ở ô bên dưới để đơn hàng được trao tận tay bạn nhé!
                  </p>
                </div>
              )}
            </div>

            {/* Introducer / Member referral input box */}
            <div className={`bg-white rounded-3xl p-6 border shadow-xs space-y-4 transition-all ${
              deliveryType === "member_delivery" ? "border-emerald-500 ring-2 ring-emerald-500/20" : "border-emerald-100"
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-heading font-bold text-base text-emerald-950 flex items-center gap-2">
                    <span>🌱</span>
                    Mã người quen / Tên Mầm-er bạn quen{deliveryType === "member_delivery" && <span className="text-red-600 font-bold">*</span>}
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Hỗ trợ ghi nhận đúng đóng góp cho thành viên và giúp bạn không bao giờ chọn nhầm.
                  </p>
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-cream text-emerald-800">
                  {deliveryType === "member_delivery" ? "Bắt buộc xác nhận" : "Không bắt buộc"}
                </span>
              </div>

              {selectedMember ? (
                /* Confirmed Member Card */
                <div className="p-4 rounded-2xl bg-[#EAF7ED] border-2 border-emerald-500 shadow-xs space-y-3 animate-in fade-in">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-700 text-white font-extrabold flex items-center justify-center text-lg shadow-sm">
                        {selectedMember.fullName.slice(0, 1)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-heading font-extrabold text-sm text-emerald-950">
                            {selectedMember.fullName}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 font-mono font-bold text-[11px] border border-emerald-300">
                            Mã: {selectedMember.referralCode}
                          </span>
                        </div>
                        <p className="text-xs text-emerald-700 font-medium mt-0.5 flex items-center gap-1">
                          <span>✓</span> Đã xác nhận thành viên chính thức Mầm Mơ
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedMember(null);
                          setShowMemberSuggestions(true);
                        }}
                        className="text-xs font-bold text-emerald-900 hover:underline px-2.5 py-1.5 rounded-xl bg-white border border-emerald-300 cursor-pointer shadow-2xs"
                      >
                        Đổi người khác
                      </button>
                      <button
                        type="button"
                        onClick={handleClearMember}
                        className="text-xs font-medium text-gray-500 hover:text-red-600 px-2 py-1.5 cursor-pointer"
                      >
                        Xóa
                      </button>
                    </div>
                  </div>

                  {deliveryType === "member_delivery" && (
                    <div className="text-[11.5px] text-[#2D6338] bg-white/80 p-2.5 rounded-xl border border-emerald-200">
                      📦 <strong>{selectedMember.fullName}</strong> ({selectedMember.phone}) sẽ trực tiếp nhận hàng và giao tận tay bạn.
                    </div>
                  )}
                </div>
              ) : (
                /* Search / Suggestion Input */
                <div className="space-y-2.5">
                  <div className="relative">
                    <input
                      type="text"
                      value={memberSearchQuery}
                      onChange={(e) => {
                        setMemberSearchQuery(e.target.value);
                        setShowMemberSuggestions(true);
                        setNoIntroducer(false);
                        setFormData((prev) => ({ ...prev, introducer_info: e.target.value }));
                      }}
                      onFocus={() => setShowMemberSuggestions(true)}
                      placeholder="Gõ tên hoặc mã (Ví dụ: Mai Lan, MAM-LAN, Quang...)"
                      className="w-full px-4 py-3 rounded-2xl border border-emerald-200 text-xs font-semibold outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 bg-white"
                    />
                    {memberSearchQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setMemberSearchQuery("");
                          setShowMemberSuggestions(false);
                        }}
                        className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 text-xs cursor-pointer"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {showMemberSuggestions && (
                    <div className="p-2 bg-cream/70 rounded-2xl border border-emerald-200 max-h-56 overflow-y-auto space-y-1 animate-in fade-in">
                      <div className="px-2 py-1 text-[10.5px] font-bold text-gray-500 uppercase">
                        {filteredMembers.length > 0 ? "Thành viên Mầm Mơ (nhấn để xác nhận):" : "Chưa có trong danh sách chính thức:"}
                      </div>
                      {filteredMembers.map((m) => (
                        <button
                          key={m.memberId}
                          type="button"
                          onClick={() => handleSelectMember(m)}
                          className="w-full p-2.5 rounded-xl text-left hover:bg-white flex items-center justify-between border border-transparent hover:border-emerald-300 transition-all cursor-pointer group"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-soft-green text-emerald-950 font-extrabold flex items-center justify-center text-xs group-hover:scale-105 transition-transform">
                              {m.fullName.slice(0, 1)}
                            </div>
                            <div>
                              <span className="font-bold text-xs text-gray-900 block">{m.fullName}</span>
                              <span className="text-[10.5px] text-gray-500 font-mono">Mã: {m.referralCode}</span>
                            </div>
                          </div>
                          <span className="px-2.5 py-1 rounded-xl bg-soft-green text-emerald-950 text-[11px] font-bold border border-emerald-200">
                            Chọn người này ✓
                          </span>
                        </button>
                      ))}

                      {filteredMembers.length === 0 && memberSearchQuery && (
                        <div className="p-3 text-center text-xs text-gray-600 bg-white rounded-xl">
                          <span>Chưa tìm thấy thành viên có tên hoặc mã này. Bạn có thể lưu tên này để BTC kiểm tra đối chiếu sau.</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleClearMember}
                      className={`text-xs px-3 py-1.5 rounded-xl border transition-colors cursor-pointer ${
                        noIntroducer
                          ? "bg-gray-100 text-gray-900 border-gray-300 font-bold"
                          : "text-gray-500 hover:text-gray-800 border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      {noIntroducer ? "✓ Đã chọn: Tôi không quen ai / Mua tự do" : "Tôi không quen ai / Không có người giới thiệu"}
                    </button>
                    <span className="text-[11px] text-gray-400">
                      Gợi ý: Lan, Quang, Trúc Hân...
                    </span>
                  </div>
                </div>
              )}

              {errors.introducer_info && (
                <p className="text-[11px] text-red-600 font-medium">{errors.introducer_info}</p>
              )}
            </div>

            {/* Payment Method Box */}
            <div className="bg-white rounded-3xl p-6 border border-emerald-100 shadow-xs space-y-4">
              <h2 className="font-heading font-bold text-lg text-emerald-950 flex items-center gap-2">
                <span>3.</span> Phương thức thanh toán
              </h2>

              <div className="space-y-3">
                <div
                  className="flex items-start gap-3 p-4 rounded-2xl border bg-soft-green/40 border-emerald-600 ring-2 ring-emerald-600/20"
                >
                  <input
                    type="radio"
                    name="payment"
                    value="banking"
                    checked={true}
                    readOnly
                    className="mt-1 text-emerald-600"
                  />
                  <div>
                    <span className="block text-sm font-bold text-emerald-950">
                      Chuyển khoản Ngân hàng (VietQR - Nhanh chóng)
                    </span>
                    <span className="block text-xs text-gray-600 mt-0.5 leading-relaxed">
                      Quét mã QR tự động điền số tiền và nội dung chuyển khoản sau khi bấm &quot;Xác nhận đặt hàng&quot;.
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Note Input */}
            <div className="bg-white rounded-3xl p-6 border border-emerald-100 shadow-xs">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block mb-2">
                Ghi chú (nếu có):
              </label>
              <textarea
                value={formData.note}
                onChange={(e) => handleInputChange("note", e.target.value)}
                placeholder="Bạn cần Gieo Mơ lưu ý điều khi khi giao hàng, hoặc muốn nhắn nhủ gì cho tụi mình, hãy điền vào đây nhé"
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

              {/* Voucher Code Box */}
              <div className="pt-3 border-t border-gray-100 space-y-2">
                <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block">
                  Mã giảm giá (Voucher):
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.voucher_code}
                    onChange={(e) => {
                      handleInputChange("voucher_code", e.target.value.toUpperCase());
                      setVoucherError(null);
                    }}
                    placeholder="Nhập mã giảm giá Gieo Mơ..."
                    className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold outline-none focus:border-soft-green uppercase"
                  />
                  <button
                    type="button"
                    onClick={() => handleApplyVoucher()}
                    className="px-3.5 py-2 rounded-xl bg-soft-green hover:bg-emerald-300 text-emerald-950 font-bold text-xs transition-colors cursor-pointer"
                  >
                    Áp dụng
                  </button>
                </div>

                {/* Quick Chips */}
                {(() => {
                  const publicVouchers = getStoredVouchers().filter(
                    (v) => (v.visibility || "public") === "public" && v.status === "active"
                  );
                  if (publicVouchers.length === 0) return null;
                  return (
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <span className="text-[10px] text-gray-500 font-medium">Gợi ý:</span>
                      {publicVouchers.slice(0, 4).map((v) => (
                        <button
                          key={v.voucher_id}
                          type="button"
                          onClick={() => handleApplyVoucher(v.code)}
                          className="px-2 py-0.5 rounded-lg bg-soft-green/40 hover:bg-soft-green text-emerald-900 text-[10.5px] font-bold border border-emerald-200 transition-colors cursor-pointer"
                        >
                          🏷️ {v.code} ({v.discount_type === "freeship" ? "Freeship" : v.discount_type === "percentage" ? `-${v.discount_value}%` : `-${Math.round(v.discount_value / 1000)}k`})
                        </button>
                      ))}
                    </div>
                  );
                })()}

                {voucherError && (
                  <p className="text-[11px] text-red-600 font-medium">{voucherError}</p>
                )}

                {voucherApplied && discountAmount > 0 && (
                  <div className="text-xs text-emerald-700 font-semibold flex items-center justify-between bg-emerald-50 p-2 rounded-xl border border-emerald-100">
                    <span>✓ Đã áp mã &quot;{voucherApplied}&quot; (-<MoneyDisplay amount={discountAmount} />)</span>
                    <button
                      type="button"
                      onClick={() => {
                        setVoucherApplied(null);
                        handleInputChange("voucher_code", "");
                      }}
                      className="text-gray-400 hover:text-red-500 text-xs ml-2 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                )}
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
                    <span className="text-emerald-700 font-bold">
                      {deliveryType === "member_delivery" ? "0đ (Thành viên gửi)" : "Miễn phí"}
                    </span>
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
      </main>

      <Footer />
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-cream/60 flex items-center justify-center p-8 text-center text-sm font-bold text-emerald-950">
          Đang chuẩn bị trang thanh toán...
        </div>
      }
    >
      <CheckoutContent />
    </Suspense>
  );
}
