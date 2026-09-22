"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Palette, Upload, QrCode, Check, Globe, Sparkles, Building2 } from "lucide-react";

export default function AdminSettingsPage() {
  const [siteName, setSiteName] = useState("Gieo Mơ");
  const [contactPhone, setContactPhone] = useState("0123456789");
  const [contactEmail, setContactEmail] = useState("gieomo@mammo.vn");
  const [flatShippingFee, setFlatShippingFee] = useState("25000");
  const [freeShippingThreshold, setFreeShippingThreshold] = useState("200000");

  // Banking & QR States
  const [bankNumber, setBankNumber] = useState("03456789999");
  const [bankHolder, setBankHolder] = useState("CLB MAM MO GIEO MO");
  const [bankName, setBankName] = useState("MB Bank (Quân Đội)");
  const [qrMode, setQrMode] = useState<"upload" | "auto">("auto");
  const [qrImageUrl, setQrImageUrl] = useState<string>("/images/logo_gieo mơ.jpg");

  // Branding Customization State
  const [activePalette, setActivePalette] = useState("soft-green");
  const [coverTheme, setCoverTheme] = useState("emerald");
  const [faviconPreview, setFaviconPreview] = useState<string>("/images/logo_gieo mơ.jpg");
  const [avatarPreview, setAvatarPreview] = useState<string>("/images/logo_gieo mơ.jpg");

  const palettes = [
    { id: "soft-green", name: "Soft Green (Mầm Mơ)", color: "#BFE9C3" },
    { id: "powder-blue", name: "Powder Blue (Mộng Mơ)", color: "#CFE8FF" },
    { id: "butter-yellow", name: "Butter Yellow (Ánh Nắng)", color: "#FFE7A8" },
    { id: "warm-orange", name: "Warm Orange (Nút Áo)", color: "#FFB98A" },
    { id: "soft-pink", name: "Soft Pink (Tình Nguyện)", color: "#FFD1E1" },
  ];

  const coverThemes = [
    { id: "emerald", name: "Xanh Mầm Chồi (Emerald Standard)", bg: "bg-[#1B2B20] text-[#BFE9C3]" },
    { id: "warm-autumn", name: "Mùa Thu Ấm Áp (Warm Orange Cover)", bg: "bg-[#422206] text-[#FFE7A8]" },
    { id: "dreamy-blue", name: "Giấc Mơ Mây (Powder Blue Cover)", bg: "bg-[#102A45] text-[#CFE8FF]" },
    { id: "pink-heart", name: "Trái Tim Thiện Nguyện (Soft Pink)", bg: "bg-[#451025] text-[#FFD1E1]" },
  ];

  // Handle Favicon File Upload
  const handleFaviconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setFaviconPreview(url);
    }
  };

  // Handle QR Image Upload
  const handleQrUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setQrImageUrl(url);
      setQrMode("upload");
    }
  };

  // Handle Avatar Upload
  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setAvatarPreview(url);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    alert("Đã lưu cấu hình nhận diện thương hiệu, Favicon, QR thanh toán & thông tin hệ thống thành công!");
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="font-heading font-extrabold text-2xl text-[#231B16]">
          Cài đặt hệ thống & Nhận diện thương hiệu
        </h1>
        <p className="text-xs text-[#7E7068] mt-0.5">
          Tùy chỉnh Favicon, Mã QR thanh toán, Palette nhận diện, Cover chiến dịch và thông tin ngân hàng.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* ========================================================
            SECTION 1: FAVICON & AVATAR UPLOAD (CHO DESIGNER)
            ======================================================== */}
        <div className="bg-white rounded-3xl p-6 border border-[#F0E5D8] shadow-soft space-y-5">
          <div className="flex items-center gap-2 border-b border-[#F0E5D8] pb-3">
            <Globe className="w-5 h-5 text-[#2D6338]" />
            <h3 className="font-heading font-extrabold text-base text-[#231B16]">
              1. Tải lên Favicon & Avatar Thương hiệu
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Favicon Upload Card */}
            <div className="p-4 rounded-2xl bg-[#FFF8EE] border border-[#F0E5D8] space-y-3">
              <span className="font-bold text-xs text-[#342A24] block">
                Favicon Tab Trình Duyệt (.ico, .png, .svg)
              </span>

              {/* Browser tab mockup preview */}
              <div className="p-2.5 rounded-xl bg-gray-100 border border-gray-300 flex items-center gap-2 max-w-xs shadow-2xs">
                <div className="relative w-5 h-5 rounded-md overflow-hidden bg-white shrink-0 border border-gray-200">
                  <Image src={faviconPreview} alt="Favicon" fill className="object-cover" />
                </div>
                <span className="text-[11px] font-semibold text-gray-800 truncate">
                  Gieo Mơ — Little Pieces...
                </span>
                <span className="text-gray-400 ml-auto text-xs">×</span>
              </div>

              <div>
                <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white hover:bg-[#FFFDF9] text-[#16381D] font-bold text-xs border border-[#9ed4a3] shadow-xs cursor-pointer transition-all">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Chọn tệp ảnh Favicon</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFaviconUpload}
                    className="hidden"
                  />
                </label>
                <span className="text-[10px] text-[#A89B92] block mt-1">
                  Đề xuất ảnh vuông tỉ lệ 1:1 (32x32px hoặc 64x64px)
                </span>
              </div>
            </div>

            {/* Avatar / Logo BTC Upload Card */}
            <div className="p-4 rounded-2xl bg-[#FFF8EE] border border-[#F0E5D8] space-y-3">
              <span className="font-bold text-xs text-[#342A24] block">
                Avatar / Logo BTC Mầm Mơ
              </span>

              <div className="flex items-center gap-3">
                <div className="relative w-14 h-14 rounded-full overflow-hidden border-2 border-[#BFE9C3] shadow-xs bg-white shrink-0">
                  <Image src={avatarPreview} alt="Avatar BTC" fill className="object-cover" />
                </div>
                <div>
                  <span className="text-xs font-bold text-[#342A24] block">Biểu tượng hiển thị</span>
                  <span className="text-[11px] text-[#7E7068]">Hiển thị tại Header, Footer và Admin</span>
                </div>
              </div>

              <div>
                <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white hover:bg-[#FFFDF9] text-[#16381D] font-bold text-xs border border-[#9ed4a3] shadow-xs cursor-pointer transition-all">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Tải lên ảnh Avatar mới</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================
            SECTION 2: VIETQR & PAYMENT QR CODE UPLOAD
            ======================================================== */}
        <div className="bg-white rounded-3xl p-6 border border-[#F0E5D8] shadow-soft space-y-5">
          <div className="flex items-center gap-2 border-b border-[#F0E5D8] pb-3">
            <QrCode className="w-5 h-5 text-[#E2884E]" />
            <h3 className="font-heading font-extrabold text-base text-[#231B16]">
              2. Cấu hình Mã QR Thanh Toán & Tài khoản Ngân hàng
            </h3>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Bank details input */}
            <div className="lg:col-span-7 space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-bold text-[#342A24] block">Tên Ngân hàng *</label>
                <input
                  type="text"
                  required
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] font-bold"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Số tài khoản nhận tiền *"
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

              {/* QR Mode Option */}
              <div className="space-y-2 pt-1">
                <label className="text-xs font-bold text-[#342A24] block">Chế độ hiển thị Mã QR tại Checkout:</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setQrMode("auto")}
                    className={`p-3 rounded-2xl border text-left text-xs font-bold transition-all cursor-pointer ${
                      qrMode === "auto"
                        ? "border-[#2D6338] bg-[#BFE9C3]/30 text-[#16381D] shadow-2xs"
                        : "border-[#F0E5D8] text-[#7E7068] hover:bg-[#FFFDF9]"
                    }`}
                  >
                    <span>⚡ Sinh mã động VietQR</span>
                    <span className="text-[10px] text-[#7E7068] block font-normal mt-0.5">Khớp số tiền và nội dung tự động</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setQrMode("upload")}
                    className={`p-3 rounded-2xl border text-left text-xs font-bold transition-all cursor-pointer ${
                      qrMode === "upload"
                        ? "border-[#2D6338] bg-[#BFE9C3]/30 text-[#16381D] shadow-2xs"
                        : "border-[#F0E5D8] text-[#7E7068] hover:bg-[#FFFDF9]"
                    }`}
                  >
                    <span>🖼️ Dùng ảnh QR tải lên</span>
                    <span className="text-[10px] text-[#7E7068] block font-normal mt-0.5">Dùng ảnh QR cố định từ app ngân hàng</span>
                  </button>
                </div>
              </div>

              {/* Upload QR File Input */}
              <div className="pt-2">
                <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#FFF8EE] hover:bg-[#FFF4E5] text-[#4A2603] font-bold text-xs border border-[#FFB98A] shadow-xs cursor-pointer transition-all">
                  <Upload className="w-4 h-4 text-[#E2884E]" />
                  <span>Tải lên ảnh Mã QR Ngân Hàng (.jpg, .png)</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleQrUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* Right: Live Payment Card Preview */}
            <div className="lg:col-span-5 bg-[#FFF8EE] p-5 rounded-3xl border border-[#F0E5D8] text-center space-y-3 shadow-xs">
              <span className="text-[11px] font-bold text-[#7E7068] uppercase tracking-wider block">
                Xem trước mã QR Khách hàng thấy
              </span>

              <div className="relative w-44 h-44 mx-auto rounded-2xl overflow-hidden bg-white p-2 border-2 border-[#FFB98A] shadow-md flex items-center justify-center">
                <Image
                  src={qrImageUrl}
                  alt="QR Thanh Toán"
                  fill
                  className="object-contain p-2"
                />
              </div>

              <div className="space-y-0.5 text-xs">
                <span className="font-extrabold text-[#342A24] block">{bankHolder}</span>
                <span className="font-mono font-bold text-[#2D6338] block">{bankNumber}</span>
                <span className="text-[11px] text-[#7E7068] block">{bankName}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================
            SECTION 3: PALETTE & COVER COLOR PICKER
            ======================================================== */}
        <div className="bg-white rounded-3xl p-6 border border-[#F0E5D8] shadow-soft space-y-5">
          <div className="flex items-center gap-2 border-b border-[#F0E5D8] pb-3">
            <Palette className="w-5 h-5 text-[#2D6338]" />
            <h3 className="font-heading font-extrabold text-base text-[#231B16]">
              3. Màu chủ đạo (Palette) & Cover Header theo chiến dịch
            </h3>
          </div>

          {/* Palette Selector */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-[#342A24] block">
              Bảng màu nhận diện chính (Tokens từ palete_mau.jpg):
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {palettes.map((pal) => (
                <button
                  key={pal.id}
                  type="button"
                  onClick={() => setActivePalette(pal.id)}
                  className={`p-3 rounded-2xl border text-left transition-all flex flex-col items-center gap-2 relative cursor-pointer ${
                    activePalette === pal.id
                      ? "border-[#2D6338] bg-[#BFE9C3]/20 shadow-2xs ring-2 ring-[#2D6338]/30"
                      : "border-[#F0E5D8] hover:border-[#FFB98A]"
                  }`}
                >
                  <div
                    className="w-8 h-8 rounded-full border border-black/10 flex items-center justify-center shadow-xs"
                    style={{ backgroundColor: pal.color }}
                  >
                    {activePalette === pal.id && <Check className="w-4 h-4 text-[#16381D] font-extrabold" />}
                  </div>
                  <span className="text-[11px] font-bold text-[#342A24] text-center leading-tight">
                    {pal.name.split(" ")[0]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Dynamic Cover Color */}
          <div className="space-y-2 pt-2">
            <label className="text-xs font-bold text-[#342A24] block">
              Chủ đề Cover Header đổi màu theo mùa / chiến dịch:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {coverThemes.map((cov) => (
                <button
                  key={cov.id}
                  type="button"
                  onClick={() => setCoverTheme(cov.id)}
                  className={`p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between cursor-pointer ${cov.bg} ${
                    coverTheme === cov.id ? "ring-2 ring-[#BFE9C3] scale-[1.01]" : "opacity-80 hover:opacity-100"
                  }`}
                >
                  <span className="text-xs font-bold">{cov.name}</span>
                  {coverTheme === cov.id && <Check className="w-4 h-4 text-[#BFE9C3]" />}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ========================================================
            SECTION 4: CONTACT & SHIPPING SETTINGS
            ======================================================== */}
        <div className="bg-white rounded-3xl p-6 border border-[#F0E5D8] shadow-soft space-y-4">
          <h3 className="font-heading font-extrabold text-base text-[#231B16] border-b border-[#F0E5D8] pb-3">
            4. Thông tin liên hệ & Cước phí giao hàng
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
            label="Email tiếp nhận liên hệ *"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
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

        <Button type="submit" variant="primary" size="lg">
          Lưu tất cả thay đổi cấu hình ➔
        </Button>
      </form>
    </div>
  );
}
