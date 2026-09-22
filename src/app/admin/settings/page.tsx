"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function AdminSettingsPage() {
  const [siteName, setSiteName] = useState("Gieo Mơ");
  const [contactPhone, setContactPhone] = useState("0123456789");
  const [contactEmail, setContactEmail] = useState("gieomo@mammo.vn");
  const [flatShippingFee, setFlatShippingFee] = useState("25000");
  const [freeShippingThreshold, setFreeShippingThreshold] = useState("200000");
  const [bankNumber, setBankNumber] = useState("03456789999");
  const [bankHolder, setBankHolder] = useState("CLB MAM MO GIEO MO");

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    alert("Đã lưu cấu hình hệ thống thành công!");
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-heading font-extrabold text-2xl text-emerald-950">
          Cài đặt hệ thống
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Cấu hình thông tin liên hệ, mức phí vận chuyển và tài khoản nhận chuyển khoản.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* General Settings */}
        <div className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-2xs space-y-4">
          <h3 className="font-heading font-bold text-base text-emerald-950 border-b border-gray-100 pb-3">
            Thông tin thương hiệu & Liên hệ
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Tên thương hiệu *"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              required
            />
            <Input
              label="Hotline liên hệ *"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              required
            />
          </div>

          <Input
            label="Email tiếp nhận *"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            required
          />
        </div>

        {/* Shipping Settings */}
        <div className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-2xs space-y-4">
          <h3 className="font-heading font-bold text-base text-emerald-950 border-b border-gray-100 pb-3">
            Cấu hình Phí giao hàng
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Phí giao hàng cố định (VNĐ) *"
              value={flatShippingFee}
              onChange={(e) => setFlatShippingFee(e.target.value)}
              required
            />
            <Input
              label="Hạn mức Miễn phí vận chuyển (VNĐ) *"
              value={freeShippingThreshold}
              onChange={(e) => setFreeShippingThreshold(e.target.value)}
              required
            />
          </div>
        </div>

        {/* Banking Settings */}
        <div className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-2xs space-y-4">
          <h3 className="font-heading font-bold text-base text-emerald-950 border-b border-gray-100 pb-3">
            Tài khoản Ngân hàng (VietQR)
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Số tài khoản *"
              value={bankNumber}
              onChange={(e) => setBankNumber(e.target.value)}
              required
            />
            <Input
              label="Tên chủ tài khoản *"
              value={bankHolder}
              onChange={(e) => setBankHolder(e.target.value)}
              required
            />
          </div>
        </div>

        <Button type="submit" variant="primary" size="lg">
          Lưu thay đổi cài đặt ➔
        </Button>
      </form>
    </div>
  );
}
