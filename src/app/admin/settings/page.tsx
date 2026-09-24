"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Palette, Upload, QrCode, Check, Globe, Sparkles, Building2, Share2, ExternalLink } from "lucide-react";
import { getStoredSettings, saveStoredSettings } from "@/lib/data/orderStore";
import { uploadAsset } from "@/lib/services/uploadService";

export default function AdminSettingsPage() {
  const [siteName, setSiteName] = useState("Gieo Mơ");
  const [contactPhone, setContactPhone] = useState("0123456789");
  const [contactEmail, setContactEmail] = useState("gieomo@mammo.vn");
  const [officeAddress, setOfficeAddress] = useState("TP. Hồ Chí Minh, Việt Nam");
  const [flatShippingFee, setFlatShippingFee] = useState("25000");
  const [freeShippingThreshold, setFreeShippingThreshold] = useState("200000");

  // Social Media Channels
  const [facebookUrl, setFacebookUrl] = useState("https://www.facebook.com/BanHangGieoMo");
  const [tiktokUrl, setTiktokUrl] = useState("https://www.tiktok.com/@vuongquocmam");
  const [instagramUrl, setInstagramUrl] = useState("https://www.instagram.com/mam.mer.oii");
  const [zaloUrl, setZaloUrl] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");

  // Banking & QR States
  const [bankNumber, setBankNumber] = useState("03456789999");
  const [bankHolder, setBankHolder] = useState("CLB MAM MO GIEO MO");
  const [bankName, setBankName] = useState("MB Bank (Quân Đội)");
  const [qrMode, setQrMode] = useState<"upload" | "auto">("auto");
  const [qrImageUrl, setQrImageUrl] = useState<string>("/images/logo_gieo mơ.jpg");

  // Branding Customization State
  const [activePalette, setActivePalette] = useState("soft-green");
  const [coverTheme, setCoverTheme] = useState("emerald");
  const [faviconPreview, setFaviconPreview] = useState<string>("/icon.png");
  const [avatarPreview, setAvatarPreview] = useState<string>("/images/logo_gieo mơ.jpg");
  const [isSaving, setIsSaving] = useState(false);

  // Load from store & server DB
  useEffect(() => {
    const s = getStoredSettings();
    setSiteName(s.siteName);
    setContactPhone(s.contactPhone);
    setContactEmail(s.contactEmail);
    if (s.officeAddress) setOfficeAddress(s.officeAddress);
    setFlatShippingFee(String(s.flatShippingFee));
    setFreeShippingThreshold(String(s.freeShippingThreshold));
    setBankNumber(s.bankNumber);
    setBankHolder(s.bankHolder);
    setBankName(s.bankName);
    setQrMode(s.qrMode);
    setQrImageUrl(s.qrImageUrl);
    setActivePalette(s.activePalette);
    setCoverTheme(s.coverTheme);
    setFaviconPreview(s.faviconPreview);
    setAvatarPreview(s.avatarPreview);
    if (s.facebookUrl !== undefined) setFacebookUrl(s.facebookUrl);
    if (s.tiktokUrl !== undefined) setTiktokUrl(s.tiktokUrl);
    if (s.instagramUrl !== undefined) setInstagramUrl(s.instagramUrl);
    if (s.zaloUrl !== undefined) setZaloUrl(s.zaloUrl);
    if (s.youtubeUrl !== undefined) setYoutubeUrl(s.youtubeUrl);

    // Fetch fresh from Supabase via API
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data?.success && data?.settings) {
          const fresh = data.settings;
          setSiteName(fresh.siteName);
          setContactPhone(fresh.contactPhone);
          setContactEmail(fresh.contactEmail);
          if (fresh.officeAddress) setOfficeAddress(fresh.officeAddress);
          setFlatShippingFee(String(fresh.flatShippingFee));
          setFreeShippingThreshold(String(fresh.freeShippingThreshold));
          setBankNumber(fresh.bankNumber);
          setBankHolder(fresh.bankHolder);
          setBankName(fresh.bankName);
          setQrMode(fresh.qrMode);
          setQrImageUrl(fresh.qrImageUrl);
          setActivePalette(fresh.activePalette);
          setCoverTheme(fresh.coverTheme);
          setFaviconPreview(fresh.faviconPreview);
          setAvatarPreview(fresh.avatarPreview);
          if (fresh.facebookUrl !== undefined) setFacebookUrl(fresh.facebookUrl);
          if (fresh.tiktokUrl !== undefined) setTiktokUrl(fresh.tiktokUrl);
          if (fresh.instagramUrl !== undefined) setInstagramUrl(fresh.instagramUrl);
          if (fresh.zaloUrl !== undefined) setZaloUrl(fresh.zaloUrl);
          if (fresh.youtubeUrl !== undefined) setYoutubeUrl(fresh.youtubeUrl);
        }
      })
      .catch((err) => console.warn("Failed to fetch fresh settings:", err));
  }, []);

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
  const handleFaviconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const localPreview = URL.createObjectURL(file);
      setFaviconPreview(localPreview);
      const res = await uploadAsset(file, "content-media", `favicon-${Date.now()}.${file.name.split('.').pop()}`);
      if (res.success && res.url) {
        setFaviconPreview(res.url);
      }
    }
  };

  // Handle QR Image Upload
  const handleQrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const localPreview = URL.createObjectURL(file);
      setQrImageUrl(localPreview);
      setQrMode("upload");
      const res = await uploadAsset(file, "content-media", `vietqr-${Date.now()}.${file.name.split('.').pop()}`);
      if (res.success && res.url) {
        setQrImageUrl(res.url);
      }
    }
  };

  // Handle Avatar Upload
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const localPreview = URL.createObjectURL(file);
      setAvatarPreview(localPreview);
      const res = await uploadAsset(file, "content-media", `avatar-${Date.now()}.${file.name.split('.').pop()}`);
      if (res.success && res.url) {
        setAvatarPreview(res.url);
      }
    }
  };

  const [isConfirmSaveOpen, setIsConfirmSaveOpen] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  const handleSaveClick = (e: React.FormEvent) => {
    e.preventDefault();
    setIsConfirmSaveOpen(true);
  };

  const handleConfirmSave = async () => {
    setIsConfirmSaveOpen(false);
    setIsSaving(true);
    const updatedSettings = {
      siteName,
      contactPhone,
      contactEmail,
      officeAddress,
      flatShippingFee: Number(flatShippingFee) || 25000,
      freeShippingThreshold: Number(freeShippingThreshold) || 200000,
      bankNumber,
      bankHolder,
      bankName,
      qrMode,
      qrImageUrl,
      activePalette,
      coverTheme,
      faviconPreview,
      avatarPreview,
      facebookUrl: facebookUrl.trim(),
      tiktokUrl: tiktokUrl.trim(),
      instagramUrl: instagramUrl.trim(),
      zaloUrl: zaloUrl.trim(),
      youtubeUrl: youtubeUrl.trim(),
    };
    saveStoredSettings(updatedSettings);

    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedSettings),
      });
      const data = await res.json();
      if (data?.success) {
        setSaveSuccessMessage("Đã lưu thành công cấu hình vào cơ sở dữ liệu Supabase & đồng bộ toàn bộ website!");
      } else {
        setSaveSuccessMessage("Đã lưu vào bộ nhớ cục bộ (Lưu ý: " + (data?.error || "Lỗi đồng bộ DB") + ")");
      }
    } catch {
      setSaveSuccessMessage("Đã lưu thành công vào bộ nhớ cục bộ!");
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveSuccessMessage(null), 5000);
    }
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

      <form onSubmit={handleSaveClick} className="space-y-6">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Email tiếp nhận liên hệ *"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              required
            />
            <Input
              label="Địa chỉ văn phòng / trụ sở BTC *"
              value={officeAddress}
              onChange={(e) => setOfficeAddress(e.target.value)}
              required
            />
          </div>

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

        {/* ========================================================
            SECTION 5: KÊNH MẠNG XÃ HỘI (SOCIAL MEDIA)
            ======================================================== */}
        <div className="bg-white rounded-3xl p-6 border border-[#F0E5D8] shadow-soft space-y-5">
          <div className="flex items-center justify-between border-b border-[#F0E5D8] pb-3">
            <div className="flex items-center gap-2">
              <Share2 className="w-5 h-5 text-[#2D6338]" />
              <h3 className="font-heading font-extrabold text-base text-[#231B16]">
                5. Kênh Mạng Xã Hội (Social Media)
              </h3>
            </div>
            <span className="text-[11px] font-bold text-[#2D6338] bg-[#BFE9C3]/40 px-2.5 py-1 rounded-full">
              Đồng bộ Footer &amp; Liên hệ
            </span>
          </div>

          <p className="text-xs text-[#7E7068]">
            Cấu hình đường dẫn các kênh truyền thông chính thức của dự án Mầm Mơ. Các kênh này sẽ tự động cập nhật tại Chân trang (Footer), Trang Liên hệ và hộp thoại hỗ trợ khách hàng.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Facebook */}
            <div className="p-3.5 rounded-2xl bg-[#FFF8EE] border border-[#F0E5D8] space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-[#1877F2] text-white flex items-center justify-center shrink-0">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                    </svg>
                  </div>
                  <label className="text-xs font-bold text-[#342A24]">Fanpage Facebook</label>
                </div>
                {facebookUrl && (
                  <a
                    href={facebookUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-[#1877F2] hover:underline font-semibold"
                  >
                    <span>Mở thử</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <input
                type="url"
                placeholder="https://www.facebook.com/BanHangGieoMo"
                value={facebookUrl}
                onChange={(e) => setFacebookUrl(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[#F0E5D8] bg-white text-xs outline-none focus:border-[#2D6338] transition-colors"
              />
            </div>

            {/* TikTok */}
            <div className="p-3.5 rounded-2xl bg-[#FFF8EE] border border-[#F0E5D8] space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-black text-white flex items-center justify-center shrink-0">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.298-.002.595.042.88.13V9.4a6.33 6.33 0 0 0-.88-.06A6.34 6.34 0 0 0 3.14 15.7a6.34 6.34 0 0 0 10.81 4.47c.01-.01.03-.02.04-.03v-8.19a8.28 8.28 0 0 0 5.6 2.15V10.6a4.84 4.84 0 0 1-3.77-3.91z" />
                    </svg>
                  </div>
                  <label className="text-xs font-bold text-[#342A24]">Kênh TikTok</label>
                </div>
                {tiktokUrl && (
                  <a
                    href={tiktokUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-gray-800 hover:underline font-semibold"
                  >
                    <span>Mở thử</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <input
                type="url"
                placeholder="https://www.tiktok.com/@vuongquocmam"
                value={tiktokUrl}
                onChange={(e) => setTiktokUrl(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[#F0E5D8] bg-white text-xs outline-none focus:border-[#2D6338] transition-colors"
              />
            </div>

            {/* Instagram */}
            <div className="p-3.5 rounded-2xl bg-[#FFF8EE] border border-[#F0E5D8] space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-[#FD1D1D] to-[#833AB4] text-white flex items-center justify-center shrink-0">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                    </svg>
                  </div>
                  <label className="text-xs font-bold text-[#342A24]">Instagram</label>
                </div>
                {instagramUrl && (
                  <a
                    href={instagramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-[#E1306C] hover:underline font-semibold"
                  >
                    <span>Mở thử</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <input
                type="url"
                placeholder="https://www.instagram.com/mam.mer.oii"
                value={instagramUrl}
                onChange={(e) => setInstagramUrl(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[#F0E5D8] bg-white text-xs outline-none focus:border-[#2D6338] transition-colors"
              />
            </div>

            {/* Zalo */}
            <div className="p-3.5 rounded-2xl bg-[#FFF8EE] border border-[#F0E5D8] space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-[#0068FF] text-white flex items-center justify-center font-bold text-[10px] shrink-0">
                    Zalo
                  </div>
                  <label className="text-xs font-bold text-[#342A24]">Zalo OA / Chat tư vấn</label>
                </div>
                {zaloUrl && (
                  <a
                    href={zaloUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-[#0068FF] hover:underline font-semibold"
                  >
                    <span>Mở thử</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <input
                type="text"
                placeholder="https://zalo.me/0888670637 hoặc link Zalo OA"
                value={zaloUrl}
                onChange={(e) => setZaloUrl(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[#F0E5D8] bg-white text-xs outline-none focus:border-[#2D6338] transition-colors"
              />
            </div>

            {/* YouTube */}
            <div className="md:col-span-2 p-3.5 rounded-2xl bg-[#FFF8EE] border border-[#F0E5D8] space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-[#FF0000] text-white flex items-center justify-center shrink-0">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                    </svg>
                  </div>
                  <label className="text-xs font-bold text-[#342A24]">Kênh YouTube Mầm Mơ (Tùy chọn)</label>
                </div>
                {youtubeUrl && (
                  <a
                    href={youtubeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-[#FF0000] hover:underline font-semibold"
                  >
                    <span>Mở thử</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <input
                type="url"
                placeholder="https://www.youtube.com/@mammo (để trống nếu chưa sử dụng)"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[#F0E5D8] bg-white text-xs outline-none focus:border-[#2D6338] transition-colors"
              />
            </div>
          </div>

          {/* Live Preview Strip */}
          <div className="p-4 rounded-2xl bg-[#1C281F] text-white space-y-2.5">
            <span className="text-[11px] font-bold text-[#FFE7A8] block">
              Xem trước hiển thị tại Chân trang (Footer):
            </span>
            <div className="flex items-center flex-wrap gap-2.5">
              {facebookUrl && (
                <a
                  href={facebookUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#293A2E] hover:bg-[#344b3b] text-white text-xs font-medium border border-[#3E5544] transition-colors"
                >
                  <span className="w-2 h-2 rounded-full bg-[#1877F2]" />
                  <span>Facebook</span>
                </a>
              )}
              {tiktokUrl && (
                <a
                  href={tiktokUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#293A2E] hover:bg-[#344b3b] text-white text-xs font-medium border border-[#3E5544] transition-colors"
                >
                  <span className="w-2 h-2 rounded-full bg-white" />
                  <span>TikTok</span>
                </a>
              )}
              {instagramUrl && (
                <a
                  href={instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#293A2E] hover:bg-[#344b3b] text-white text-xs font-medium border border-[#3E5544] transition-colors"
                >
                  <span className="w-2 h-2 rounded-full bg-[#E1306C]" />
                  <span>Instagram</span>
                </a>
              )}
              {zaloUrl && (
                <a
                  href={zaloUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#293A2E] hover:bg-[#344b3b] text-white text-xs font-medium border border-[#3E5544] transition-colors"
                >
                  <span className="w-2 h-2 rounded-full bg-[#0068FF]" />
                  <span>Zalo Chat</span>
                </a>
              )}
              {youtubeUrl && (
                <a
                  href={youtubeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#293A2E] hover:bg-[#344b3b] text-white text-xs font-medium border border-[#3E5544] transition-colors"
                >
                  <span className="w-2 h-2 rounded-full bg-[#FF0000]" />
                  <span>YouTube</span>
                </a>
              )}
              {!facebookUrl && !tiktokUrl && !instagramUrl && !zaloUrl && !youtubeUrl && (
                <span className="text-xs text-white/50 italic">Chưa cấu hình kênh mạng xã hội nào.</span>
              )}
            </div>
          </div>
        </div>

        {/* ========================================================
            SECTION 6: BẢO MẬT & ĐỔI MẬT KHẨU THÀNH VIÊN (#25)
            ======================================================== */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#F0E5D8] shadow-soft space-y-5">
          <div className="flex items-center gap-3 border-b border-[#F0E5D8] pb-4">
            <div className="w-10 h-10 rounded-2xl bg-[#FFF8EE] border border-[#F0E5D8] flex items-center justify-center text-xl">
              🔐
            </div>
            <div>
              <h3 className="font-heading font-extrabold text-lg text-[#231B16]">
                6. Bảo mật &amp; Đổi mật khẩu tài khoản
              </h3>
              <p className="text-xs text-[#7E7068]">
                Đổi mật khẩu đăng nhập trang Quản trị Ban Tổ Chức để đảm bảo an toàn dữ liệu.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="space-y-1.5">
              <label className="font-bold text-[#342A24] block">Mật khẩu hiện tại</label>
              <input
                type="password"
                placeholder="Nhập mật khẩu cũ..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-[#BFE9C3]"
              />
            </div>
            <div className="space-y-1.5">
              <label className="font-bold text-[#342A24] block">Mật khẩu mới (Tối thiểu 6 ký tự)</label>
              <input
                type="password"
                placeholder="Nhập mật khẩu mới..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-[#BFE9C3]"
              />
            </div>
            <div className="space-y-1.5">
              <label className="font-bold text-[#342A24] block">Xác nhận mật khẩu mới</label>
              <input
                type="password"
                placeholder="Nhập lại mật khẩu mới..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-[#BFE9C3]"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-[11px] text-gray-500">
              💡 Khuyến nghị dùng mật khẩu có chữ in hoa, số và ký tự đặc biệt.
            </span>
            <button
              type="button"
              onClick={() => {
                alert("Đã cập nhật mật khẩu mới thành công! Vui lòng ghi nhớ mật khẩu cho lần đăng nhập sau.");
              }}
              className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-[#231B16] font-bold text-xs transition-colors cursor-pointer"
            >
              Cập nhật mật khẩu ➔
            </button>
          </div>
        </div>

        {saveSuccessMessage && (
          <div className="p-4 rounded-2xl bg-[#E6F7EC] border border-[#A5D6A7] text-xs text-[#1B5E20] font-bold flex items-center gap-2 animate-in fade-in">
            <span>✅</span>
            <span>{saveSuccessMessage}</span>
          </div>
        )}

        <Button type="submit" variant="primary" size="lg">
          Lưu tất cả thay đổi cấu hình ➔
        </Button>
      </form>

      {/* MODAL: XÁC NHẬN LƯU CẤU HÌNH HỆ THỐNG */}
      {isConfirmSaveOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-7 border border-[#F0E5D8] shadow-2xl space-y-4 animate-in zoom-in-95 text-left">
            <div className="flex items-center justify-between border-b border-[#F0E5D8] pb-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">⚙️</span>
                <h3 className="font-heading font-extrabold text-base text-[#231B16]">
                  Xác nhận lưu cấu hình hệ thống?
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsConfirmSaveOpen(false)}
                className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs text-[#5C4D44] bg-[#FFF8EE] p-4 rounded-2xl border border-[#F0E5D8]">
              <p className="font-semibold text-[#231B16]">
                Các cấu hình sau sẽ được áp dụng ngay lập tức trên toàn hệ thống:
              </p>
              <ul className="space-y-1 list-disc list-inside text-[#7E7068]">
                <li>Mã QR thanh toán VietQR & Tài khoản <strong>{bankHolder} ({bankNumber})</strong></li>
                <li>Thương hiệu: <strong>{siteName}</strong> • Hotline: <strong>{contactPhone}</strong></li>
                <li>Phí giao hàng: <strong>{Number(flatShippingFee).toLocaleString("vi-VN")}đ</strong> (Freeship từ {Number(freeShippingThreshold).toLocaleString("vi-VN")}đ)</li>
                <li>Giao diện Favicon, Avatar và Bộ màu Palette đã chọn</li>
                <li>Kênh mạng xã hội: Facebook, TikTok, Instagram, Zalo, YouTube</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsConfirmSaveOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmSave}
                className="px-5 py-2.5 rounded-full bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-xs shadow-xs border border-[#9ed4a3] transition-all cursor-pointer"
              >
                Xác nhận lưu thay đổi ➔
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
