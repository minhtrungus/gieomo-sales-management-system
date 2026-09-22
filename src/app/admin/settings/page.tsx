"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Palette, Image as ImageIcon, ShieldCheck, Check } from "lucide-react";

export default function AdminSettingsPage() {
  const [siteName, setSiteName] = useState("Gieo Mơ");
  const [contactPhone, setContactPhone] = useState("0123456789");
  const [contactEmail, setContactEmail] = useState("gieomo@mammo.vn");
  const [flatShippingFee, setFlatShippingFee] = useState("25000");
  const [freeShippingThreshold, setFreeShippingThreshold] = useState("200000");
  const [bankNumber, setBankNumber] = useState("03456789999");
  const [bankHolder, setBankHolder] = useState("CLB MAM MO GIEO MO");

  // Branding Customization State
  const [activePalette, setActivePalette] = useState("soft-green");
  const [coverTheme, setCoverTheme] = useState("emerald");
  const [faviconUrl, setFaviconUrl] = useState("/favicon.ico");
  const [avatarUrl, setAvatarUrl] = useState("🌱");

  const palettes = [
    { id: "soft-green", name: "Soft Green (Mầm Mơ)", color: "#BFE9C3" },
    { id: "powder-blue", name: "Powder Blue (Mộng Mơ)", color: "#CFE8FF" },
    { id: "butter-yellow", name: "Butter Yellow (Ánh Nắng)", color: "#FFE7A8" },
    { id: "warm-orange", name: "Warm Orange (Nút Áo)", color: "#FFB98A" },
    { id: "soft-pink", name: "Soft Pink (Tình Nguyện)", color: "#FFD1E1" },
  ];

  const coverThemes = [
    { id: "emerald", name: "Xanh Mầm Chồi (Emerald Standard)", bg: "bg-emerald-950 text-emerald-100" },
    { id: "warm-autumn", name: "Mùa Thu Ấm Áp (Warm Orange Cover)", bg: "bg-amber-950 text-amber-100" },
    { id: "dreamy-blue", name: "Giấc Mơ Mây (Powder Blue Cover)", bg: "bg-slate-900 text-blue-100" },
    { id: "pink-heart", name: "Trái Tim Thiện Nguyện (Soft Pink)", bg: "bg-pink-950 text-pink-100" },
  ];

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    alert("Đã lưu cấu hình nhận diện thương hiệu & cài đặt hệ thống thành công!");
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-heading font-extrabold text-2xl text-emerald-950">
          Cài đặt hệ thống & Nhận diện thương hiệu
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Cấu hình thông tin thương hiệu, bảng màu Palette, Cover đổi màu, Favicon, Avatar BTC & phương thức VietQR.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Branding & Palette Settings */}
        <div className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-2xs space-y-5">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
            <Palette className="w-5 h-5 text-emerald-800" />
            <h3 className="font-heading font-bold text-base text-emerald-950">
              Nhận diện thương hiệu (Palette, Cover, Favicon, Avatar)
            </h3>
          </div>

          {/* Palette Selector */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-700 block">
              1. Màu chủ đạo hệ thống (Palette Brand Token)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {palettes.map((pal) => (
                <button
                  key={pal.id}
                  type="button"
                  onClick={() => setActivePalette(pal.id)}
                  className={`p-3 rounded-2xl border text-left transition-all flex flex-col items-center gap-2 relative ${
                    activePalette === pal.id
                      ? "border-emerald-800 bg-emerald-50/50 shadow-2xs ring-2 ring-emerald-600/20"
                      : "border-gray-200 hover:border-emerald-300"
                  }`}
                >
                  <div
                    className="w-8 h-8 rounded-full border border-black/10 flex items-center justify-center shadow-xs"
                    style={{ backgroundColor: pal.color }}
                  >
                    {activePalette === pal.id && <Check className="w-4 h-4 text-emerald-950 font-bold" />}
                  </div>
                  <span className="text-[11px] font-bold text-gray-800 text-center leading-tight">
                    {pal.name.split(" ")[0]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Dynamic Cover Color */}
          <div className="space-y-2 pt-2">
            <label className="text-xs font-semibold text-gray-700 block">
              2. Dynamic Cover Header (Màu Cover Banner đổi màu theo chiến dịch)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {coverThemes.map((cov) => (
                <button
                  key={cov.id}
                  type="button"
                  onClick={() => setCoverTheme(cov.id)}
                  className={`p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between ${cov.bg} ${
                    coverTheme === cov.id ? "ring-2 ring-emerald-500 scale-[1.01]" : "opacity-80 hover:opacity-100"
                  }`}
                >
                  <span className="text-xs font-bold">{cov.name}</span>
                  {coverTheme === cov.id && <Check className="w-4 h-4 text-soft-green" />}
                </button>
              ))}
            </div>
          </div>

          {/* Favicon & Avatar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="space-y-1.5">
              <Input
                label="Đường dẫn Favicon Icon *"
                value={faviconUrl}
                onChange={(e) => setFaviconUrl(e.target.value)}
                required
              />
              <span className="text-[10px] text-gray-400 block">Icon hiển thị trên tab trình duyệt (tệp .ico hoặc .png)</span>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-700 block">Biểu tượng Avatar BTC Mầm Mơ *</label>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-soft-green border border-emerald-200 flex items-center justify-center text-lg font-bold shrink-0">
                  {avatarUrl}
                </div>
                <input
                  type="text"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-xs outline-none focus:border-soft-green"
                  placeholder="Nhập emoji hoặc đường dẫn ảnh..."
                />
              </div>
            </div>
          </div>
        </div>

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
          Lưu thay đổi cài đặt & Nhận diện thương hiệu ➔
        </Button>
      </form>
    </div>
  );
}

