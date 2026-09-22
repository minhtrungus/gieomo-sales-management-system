"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { MOCK_PRODUCTS } from "@/lib/data/mockData";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

export default function AdminCreateOrderPage() {
  const router = useRouter();

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [sourceType, setSourceType] = useState("admin_manual");
  const [memberId, setMemberId] = useState("");
  const [deliveryType, setDeliveryType] = useState("home_delivery");
  const [addressDetail, setAddressDetail] = useState("");
  const [district, setDistrict] = useState("");
  const [province, setProvince] = useState("TP. Hồ Chí Minh");
  const [paymentMethod, setPaymentMethod] = useState("banking");

  // Selected Order Items
  const [orderItems, setOrderItems] = useState<
    Array<{ productId: string; name: string; price: number; quantity: number }>
  >([
    {
      productId: MOCK_PRODUCTS[0].product_id,
      name: MOCK_PRODUCTS[0].name,
      price: MOCK_PRODUCTS[0].price,
      quantity: 1,
    },
  ]);

  const subtotal = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shippingFee = deliveryType === "self_pickup" ? 0 : subtotal >= 200000 ? 0 : 25000;
  const finalAmount = subtotal + shippingFee;

  const handleAddItem = () => {
    const firstProd = MOCK_PRODUCTS[0];
    setOrderItems((prev) => [
      ...prev,
      { productId: firstProd.product_id, name: firstProd.name, price: firstProd.price, quantity: 1 },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    setOrderItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleProductSelect = (index: number, prodId: string) => {
    const prod = MOCK_PRODUCTS.find((p) => p.product_id === prodId);
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
    router.push("/admin/orders");
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/admin/orders" className="p-2 rounded-xl text-gray-500 hover:bg-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-emerald-950">
            Nhập đơn hộ khách hàng
          </h1>
          <p className="text-xs text-gray-500">
            Dành cho Ban tổ chức nhập đơn trực tiếp khi hỗ trợ khách chốt qua Fanpage hoặc sự kiện.
          </p>
        </div>
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
                  { value: "mem-1", label: "Nguyễn Thị Mai Lan (MAM-LAN)" },
                  { value: "mem-2", label: "Trần Minh Quang (MAM-QUANG)" },
                  { value: "mem-0", label: "BTC Mầm Mơ (MAM-ADMIN)" },
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
                className="text-xs font-bold text-emerald-800 hover:underline flex items-center gap-1"
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
                      className="w-full p-2 rounded-xl border border-gray-200 text-xs font-bold bg-white outline-none"
                    >
                      {MOCK_PRODUCTS.map((p) => (
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
                      className="p-1 text-gray-400 hover:text-red-600 transition-colors"
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
                  { value: "home_delivery", label: "Giao tận nơi (25k)" },
                  { value: "pickup_point", label: "Nhận tại điểm hẹn" },
                  { value: "self_pickup", label: "Tự đến lấy tại BTC" },
                ]}
              />

              <Select
                label="Phương thức thanh toán"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                options={[
                  { value: "banking", label: "Chuyển khoản Ngân hàng (VietQR)" },
                  { value: "cod", label: "Tiền mặt khi nhận (COD)" },
                ]}
              />
            </div>

            {deliveryType === "home_delivery" && (
              <div className="space-y-3 pt-2">
                <Input
                  label="Địa chỉ chi tiết *"
                  placeholder="Số nhà, tên đường, phường..."
                  value={addressDetail}
                  onChange={(e) => setAddressDetail(e.target.value)}
                  required
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Quận / Huyện *"
                    placeholder="Quận 1"
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    required
                  />
                  <Input
                    label="Tỉnh / Thành phố *"
                    value={province}
                    onChange={(e) => setProvince(e.target.value)}
                    required
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Summary Column */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-2xs space-y-4 sticky top-24">
            <h3 className="font-heading font-bold text-base text-emerald-950 border-b border-gray-100 pb-3">
              Tóm tắt đơn tạo
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
              Tạo đơn ngay ➔
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
