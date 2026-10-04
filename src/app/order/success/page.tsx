"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Suspense, useState, useEffect, useMemo } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { Button } from "@/components/ui/Button";
import {
  getStoredOrders,
  getStoredSettings,
  getStoredVouchers,
  updateStoredOrderStatus,
  updateStoredPaymentStatus,
  updateStoredPaymentProof,
  DEFAULT_SETTINGS,
  type SiteSettings,
} from "@/lib/data/orderStore";
import type { Order, Voucher } from "@/types/database";
import { Copy, Check, ExternalLink, Download, Share2, Sparkles, Gift } from "lucide-react";
import { compressImage } from "@/lib/utils/imageCompressor";

function OrderSuccessContent() {
  const searchParams = useSearchParams();
  const orderCode = searchParams.get("code") || "GM-369817";
  const paymentMethod = searchParams.get("payment") || "banking";
  const urlAmount = Number(searchParams.get("amount") || "110000");

  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SETTINGS);
  const [order, setOrder] = useState<Order | null>(null);
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [hasConfirmedPayment, setHasConfirmedPayment] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [proofImage, setProofImage] = useState<string | null>(null);

  // Social Share Card states
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const shareQuote = "Tôi vừa cùng Mầm Mơ gieo một giấc mơ cho trẻ em khó khăn 🌱";

  useEffect(() => {
    setSettings(getStoredSettings());
    const handleUpdate = () => setSettings(getStoredSettings());
    window.addEventListener("gieomo_settings_updated", handleUpdate);
    return () => window.removeEventListener("gieomo_settings_updated", handleUpdate);
  }, []);

  useEffect(() => {
    const orders = getStoredOrders();
    const found = orders.find((o) => o.order_code === orderCode || o.order_id === orderCode);
    if (found) {
      setOrder(found);
      if (
        found.payment_status === "paid" ||
        found.payment_proof ||
        found.internal_note?.includes("[Khách đính kèm ảnh biên lai CK]")
      ) {
        setHasConfirmedPayment(true);
        if (found.payment_proof) setProofImage(found.payment_proof);
      }
    }

    // Also restore cached confirmation state
    try {
      const localConfirmed = localStorage.getItem(`gieomo_confirmed_${orderCode}`) === "true";
      const localProof = localStorage.getItem(`gieomo_proof_${orderCode}`);
      if (localConfirmed) setHasConfirmedPayment(true);
      if (localProof && !proofImage) setProofImage(localProof);
    } catch {
      // ignore
    }
  }, [orderCode]);

  const isPaid = (order?.payment_status === "paid") || hasConfirmedPayment || paymentMethod === "cod";

  // Polling for VietQR payment confirmation (every 2.5s)
  useEffect(() => {
    if (isPaid || !orderCode || paymentMethod !== "banking") return;
    const interval = setInterval(() => {
      fetch(`/api/orders?code=${encodeURIComponent(orderCode)}`)
        .then((r) => r.json())
        .then((data) => {
          if (data?.success && Array.isArray(data.orders) && data.orders.length > 0) {
            const latest = data.orders[0];
            if (latest.payment_status === "paid") {
              setOrder((prev) => (prev ? { ...prev, payment_status: "paid" } : latest));
              setHasConfirmedPayment(true);

              // Send order confirmation email upon successful payment detection
              fetch("/api/notify/email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  type: "payment_received",
                  order: latest,
                  toEmail: latest.buyer_email || undefined,
                }),
              }).catch(() => {});
            }
          }
        })
        .catch(() => {});
    }, 2500);

    return () => clearInterval(interval);
  }, [isPaid, orderCode, paymentMethod]);

  const finalAmount = order ? order.final_amount : urlAmount;

  const bankAccount = {
    bankName: settings.bankName || "Ngân hàng MB Bank (Quân Đội)",
    accountNumber: settings.bankNumber || "0888670637",
    accountHolder: settings.bankHolder || "NGUYEN THI TRUC HAN",
    transferMemo: orderCode,
  };

  // VietQR Napas247 Dynamic QR Code with exact amount and order memo
  const vietQrUrl =
    settings.qrMode === "upload" && settings.qrImageUrl
      ? settings.qrImageUrl
      : `https://img.vietqr.io/image/MB-${bankAccount.accountNumber}-compact2.png?amount=${finalAmount}&addInfo=${orderCode}&accountName=${encodeURIComponent(bankAccount.accountHolder)}`;

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedItem(label);
    setTimeout(() => setCopiedItem(null), 2000);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file, { maxWidth: 1200, maxHeight: 1200, quality: 0.8 });
      const reader = new FileReader();
      reader.onload = (event) => {
        setProofImage(event.target?.result as string);
      };
      reader.readAsDataURL(compressed);
    } catch {
      const reader = new FileReader();
      reader.onload = (event) => {
        setProofImage(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleConfirmPaymentSubmit = async () => {
    setHasConfirmedPayment(true);
    setIsConfirmModalOpen(false);

    if (orderCode) {
      try {
        localStorage.setItem(`gieomo_confirmed_${orderCode}`, "true");
        if (proofImage) {
          localStorage.setItem(`gieomo_proof_${orderCode}`, proofImage);
          updateStoredPaymentProof(orderCode, proofImage);
        }
        updateStoredPaymentStatus(orderCode, "paid");
        updateStoredOrderStatus(orderCode, "confirmed");

        setOrder((prev) =>
          prev
            ? {
                ...prev,
                payment_status: "paid",
                order_status: "confirmed",
                payment_proof: proofImage || prev.payment_proof,
              }
            : prev
        );

        const payload: any = {
          order_code: orderCode,
          payment_status: "paid",
          order_status: "confirmed",
        };
        if (proofImage) {
          payload.internal_note = `[Khách đính kèm ảnh biên lai CK]`;
          payload.payment_proof = proofImage;
        }
        await fetch("/api/orders", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        // Trigger confirmation email upon payment confirmation
        if (order) {
          fetch("/api/notify/email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "order_confirmation",
              order: { ...order, payment_status: "paid" },
              toEmail: order.buyer_email || undefined,
            }),
          }).catch(() => {});
        }
      } catch (err) {
        console.warn("Error updating payment confirmation:", err);
      }
    }
  };

  // Check gift voucher eligibility
  const giftVoucher = useMemo(() => {
    const vouchers = getStoredVouchers().filter((v) => v.status === "active" && v.is_gift_voucher);
    return vouchers.find((v) => finalAmount >= (v.gift_min_order_value || 0)) || null;
  }, [finalAmount]);

  // State for card generation
  const [isGeneratingCard, setIsGeneratingCard] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  // Generate High-Res 9:16 Social Story Canvas (1080 x 1920)
  const generateShareCanvas = async (): Promise<HTMLCanvasElement | null> => {
    // Wait for custom fonts to be ready
    try {
      if (typeof document !== "undefined" && document.fonts) {
        await document.fonts.ready;
      }
    } catch {
      // ignore
    }

    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const customerName = (order?.buyer_name || "Bạn đọc hảo tâm").trim();
    const now = new Date();
    const dateStr = `${now.getDate().toString().padStart(2, "0")}/${(now.getMonth() + 1).toString().padStart(2, "0")}/${now.getFullYear()}`;
    const orderItems = order?.items && order.items.length > 0
      ? order.items
      : [{ item_name_snapshot: "Pouch May Thủ Công Gieo Mơ", quantity: 1 }];

    // 1. Background Gradient (warm artisanal parchment paper)
    const bgGrad = ctx.createLinearGradient(0, 0, 0, 1920);
    bgGrad.addColorStop(0, "#FFFDF7");
    bgGrad.addColorStop(0.5, "#FAF4E8");
    bgGrad.addColorStop(1, "#F3ECE0");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1080, 1920);

    // Subtle paper edge border
    ctx.strokeStyle = "#E8DEC8";
    ctx.lineWidth = 20;
    ctx.strokeRect(30, 30, 1020, 1860);

    // Handcrafted sewing stitch border (dark green dashed)
    ctx.strokeStyle = "#2D6338";
    ctx.lineWidth = 4;
    ctx.setLineDash([18, 14]);
    ctx.strokeRect(60, 60, 960, 1800);
    ctx.setLineDash([]);

    // Inner parchment letter container
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.roundRect(85, 85, 910, 1750, 32);
    ctx.fill();
    ctx.strokeStyle = "#F0E5D8";
    ctx.lineWidth = 3;
    ctx.stroke();

    // Top-right Wax Seal (Con dấu sáp Gieo Mơ)
    ctx.save();
    ctx.fillStyle = "#22542B";
    ctx.beginPath();
    ctx.arc(880, 190, 65, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#D4AF37";
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(880, 190, 52, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 26px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("🌿", 880, 180);
    ctx.font = "bold 13px 'Montserrat', sans-serif";
    ctx.fillText("GIEO MƠ", 880, 212);
    ctx.restore();

    // PHÂN KHU 1: HEADER (Nhận diện & Lời chào)
    // Logo & Brand Name
    ctx.fillStyle = "#BFE9C3";
    ctx.beginPath();
    ctx.roundRect(140, 140, 420, 54, 27);
    ctx.fill();

    ctx.fillStyle = "#16381D";
    ctx.font = "bold 22px 'Montserrat', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("🌿 TẠP HÓA GIEO MƠ", 350, 175);

    ctx.fillStyle = "#7E7068";
    ctx.font = "italic 20px 'Montserrat', sans-serif";
    ctx.fillText("Dự án bán hàng gây quỹ của Mầm Mơ", 350, 225);

    // Main Big Headline: CẢM ƠN NGƯỜI GIEO MẦM
    ctx.fillStyle = "#16381D";
    ctx.font = "bold 46px 'Playfair Display', Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText("CẢM ƠN NGƯỜI GIEO MẦM", 540, 315);

    ctx.fillStyle = "#65B374";
    ctx.font = "30px sans-serif";
    ctx.fillText("✨  🌿  🌱  🌿  ✨", 540, 365);

    // PHÂN KHU 2: SPOTLIGHT - TÔN VINH KHÁCH HÀNG (Trọng tâm)
    // Ribbon / Spotlight Box
    ctx.fillStyle = "#FFFDF9";
    ctx.beginPath();
    ctx.roundRect(120, 420, 840, 390, 32);
    ctx.fill();
    ctx.strokeStyle = "#BFE9C3";
    ctx.lineWidth = 3;
    ctx.stroke();

    // Small intro label
    ctx.fillStyle = "#7E7068";
    ctx.font = "bold 18px 'Montserrat', sans-serif";
    ctx.fillText("GỬI TẶNG BẠN", 540, 470);

    // Customer Name (LỚN NHẤT & Cursive Handwriting with responsive scale)
    ctx.fillStyle = "#16381D";
    const nameLen = customerName.length;
    const nameFontSize = nameLen > 24 ? 60 : nameLen > 16 ? 70 : 82;
    ctx.font = `bold ${nameFontSize}px 'Caveat', cursive, sans-serif`;
    ctx.fillText(customerName, 540, 565);

    // Inspiring message text
    ctx.fillStyle = "#342A24";
    ctx.font = "italic 25px 'Playfair Display', Georgia, serif";
    const safeShortName = nameLen > 20 ? customerName.slice(0, 18) + "..." : customerName;
    const quoteLine1 = `“ ${safeShortName} vừa cùng Gieo Mơ gieo một hạt mơ,`;
    const quoteLine2 = "thắp một hy vọng cho trẻ em khó khăn 🌱 ”";
    ctx.fillText(quoteLine1, 540, 660);
    ctx.fillText(quoteLine2, 540, 705);

    ctx.fillStyle = "#65B374";
    ctx.font = "20px 'Montserrat', sans-serif";
    ctx.fillText("Từng món quà nhỏ trao đi là thêm cơ hội đến trường cho các em.", 540, 765);

    // PHÂN KHU 3: BẰNG CHỨNG HÀNH ĐỘNG (Tem bưu chính / Vintage Postal Stamp)
    ctx.fillStyle = "#FAF6F0";
    ctx.beginPath();
    ctx.roundRect(120, 850, 840, 360, 28);
    ctx.fill();
    ctx.strokeStyle = "#E8DEC8";
    ctx.lineWidth = 3;
    ctx.stroke();

    // Vintage Postmark circle stamp (Dấu mộc bưu điện)
    ctx.save();
    ctx.translate(820, 955);
    ctx.rotate(-0.15);
    ctx.strokeStyle = "rgba(45, 99, 56, 0.4)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 65, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 52, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#2D6338";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("GIEO MƠ POST", 0, -25);
    ctx.font = "bold 14px monospace";
    ctx.fillText(dateStr, 0, 5);
    ctx.font = "bold 11px sans-serif";
    ctx.fillText("VIỆT NAM", 0, 30);
    ctx.restore();

    // Action Evidence Details
    ctx.textAlign = "left";
    ctx.fillStyle = "#5C4D44";
    ctx.font = "bold 20px 'Montserrat', sans-serif";
    ctx.fillText("📦 GÓI QUÀ BẠN ĐÃ CHỌN:", 160, 915);

    // Products list
    ctx.font = "24px 'Montserrat', sans-serif";
    ctx.fillStyle = "#231B16";
    let curY = 965;
    orderItems.slice(0, 3).forEach((it: any) => {
      const name = it.item_name_snapshot || it.product_name_snapshot || "Sản phẩm Mầm Mơ";
      const truncated = name.length > 32 ? name.slice(0, 30) + "..." : name;
      ctx.fillText(`• ${truncated}`, 160, curY);
      ctx.textAlign = "right";
      ctx.fillText(`x${it.quantity}`, 720, curY);
      ctx.textAlign = "left";
      curY += 46;
    });

    // Date of Sowing
    ctx.fillStyle = "#5C4D44";
    ctx.font = "bold 20px 'Montserrat', sans-serif";
    ctx.fillText("📅 NGÀY GIEO HẠT:", 160, 1140);
    ctx.fillStyle = "#16381D";
    ctx.font = "bold 24px 'Montserrat', sans-serif";
    ctx.fillText(dateStr, 380, 1140);

    // PHÂN KHU 4: THÚC ĐẨY BÁN HÀNG & CTA LAN TỎA
    // Trust Badge (Bảo chứng niềm tin)
    ctx.fillStyle = "#EBF7EE";
    ctx.beginPath();
    ctx.roundRect(120, 1250, 840, 85, 42.5);
    ctx.fill();
    ctx.strokeStyle = "#A5D6A7";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.fillStyle = "#16381D";
    ctx.font = "bold 24px 'Montserrat', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("🌱 100% LỢI NHUẬN ĐƯỢC ĐÓNG GÓP VÀO QUỸ CỦA MẦM MƠ", 540, 1303);

    // Spread the word CTA & QR Code Container
    ctx.fillStyle = "#FFFDF9";
    ctx.beginPath();
    ctx.roundRect(120, 1375, 840, 240, 28);
    ctx.fill();
    ctx.strokeStyle = "#F0E5D8";
    ctx.lineWidth = 2;
    ctx.stroke();

    // CTA Text on the left
    ctx.textAlign = "left";
    ctx.fillStyle = "#16381D";
    ctx.font = "bold 28px 'Playfair Display', Georgia, serif";
    ctx.fillText("Cùng lan tỏa mầm xanh!", 160, 1450);

    ctx.fillStyle = "#5C4D44";
    ctx.font = "22px 'Montserrat', sans-serif";
    const safeCTAname = nameLen > 18 ? customerName.slice(0, 16) + "..." : customerName;
    ctx.fillText(`Quét mã để cùng ${safeCTAname}`, 160, 1500);
    ctx.fillText("gieo thêm những mầm xanh mới nhé! 🌱", 160, 1538);

    // Load and draw QR Code
    try {
      const qrImg = new window.Image();
      qrImg.crossOrigin = "anonymous";
      qrImg.src = "https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=https%3A%2F%2Fgieomo.store&color=16-56-29&bgcolor=255-253-249";

      await new Promise<void>((resolve) => {
        qrImg.onload = () => {
          ctx.drawImage(qrImg, 740, 1395, 200, 200);
          resolve();
        };
        qrImg.onerror = () => {
          ctx.fillStyle = "#2D6338";
          ctx.fillRect(740, 1395, 200, 200);
          ctx.fillStyle = "#FFFFFF";
          ctx.font = "bold 18px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("gieomo.store", 840, 1500);
          resolve();
        };
        setTimeout(resolve, 1500);
      });
    } catch {
      // ignore
    }

    // FOOTER
    ctx.fillStyle = "#7E7068";
    ctx.font = "bold 22px 'Montserrat', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("gieomo.store  •  facebook.com/BanHangGieoMo", 540, 1695);

    return canvas;
  };

  // Explicit Download: ONLY downloads when user clicks "Tải thẻ Story (PNG)"
  const handleDownloadShareCard = async () => {
    setIsGeneratingCard(true);
    try {
      const canvas = await generateShareCanvas();
      if (!canvas) return;
      const customerName = (order?.buyer_name || "Bạn đọc hảo tâm").trim();
      const link = document.createElement("a");
      link.download = `Chung-Nhan-Nguoi-Gieo-Mam-${customerName.replace(/\s+/g, "-")}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      console.warn("Download share card error:", err);
    } finally {
      setIsGeneratingCard(false);
    }
  };

  // Smart Social Share: Does NOT auto-download to disk; uses Web Share API on mobile to share directly to Instagram Story / Facebook
  const handleNativeShare = async () => {
    setIsSharing(true);
    try {
      const customerName = (order?.buyer_name || "Bạn đọc hảo tâm").trim();
      const canvas = await generateShareCanvas();
      if (!canvas) {
        setIsSharing(false);
        setIsShareModalOpen(true);
        return;
      }

      canvas.toBlob(async (blob) => {
        if (!blob) {
          setIsSharing(false);
          setIsShareModalOpen(true);
          return;
        }

        const file = new File([blob], `Chung-Nhan-Gieo-Mo-${customerName.replace(/\s+/g, "-")}.png`, {
          type: "image/png",
        });

        // If native Web Share supports file sharing (mobile Instagram, Facebook Stories, Zalo, etc.)
        if (typeof navigator !== "undefined" && navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: "Chứng nhận người gieo mầm — Gieo Mơ",
              text: `Tôi vừa cùng Gieo Mơ gieo một hạt mơ cho trẻ em khó khăn 🌱 gieomo.store`,
            });
            setIsSharing(false);
            return;
          } catch {
            // User dismissed the share sheet
            setIsSharing(false);
            return;
          }
        }

        // If native share only supports text/url
        if (typeof navigator !== "undefined" && navigator.share) {
          try {
            await navigator.share({
              title: "Chứng nhận người gieo mầm — Gieo Mơ",
              text: `${customerName} vừa cùng Gieo Mơ gieo một hạt mơ cho trẻ em khó khăn 🌱`,
              url: "https://gieomo.store",
            });
            setIsSharing(false);
            return;
          } catch {
            setIsSharing(false);
            return;
          }
        }

        // On desktop browser: open the Story modal preview with sharing guides
        setIsSharing(false);
        setIsShareModalOpen(true);
      }, "image/png");
    } catch {
      setIsSharing(false);
      setIsShareModalOpen(true);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 text-center">
      {/* Status Header */}
      {paymentMethod === "banking" && !isPaid ? (
        <>
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-amber-100 text-amber-900 font-extrabold text-4xl shadow-md animate-pulse">
            💳
          </div>
          <div className="space-y-2">
            <div className="inline-block px-3 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-extrabold mb-1 whitespace-nowrap">
              ⏳ ĐANG CHỜ CHUYỂN KHOẢN VIETQR
            </div>
            <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-emerald-950 text-balance">
              Đơn hàng đang chờ thanh toán
            </h1>
            <p className="text-gray-600 text-sm sm:text-base max-w-lg mx-auto text-balance">
              Vui lòng quét mã VietQR bên dưới để hoàn tất giao dịch. Sau khi nhận được chuyển khoản, hệ thống sẽ tự động xác nhận đặt hàng thành công!
            </p>
          </div>
        </>
      ) : (
        <>
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-soft-green text-emerald-950 font-extrabold text-4xl shadow-md animate-bounce">
            🎉
          </div>
          <div className="space-y-2">
            <div className="inline-block px-3 py-1 rounded-full bg-[#E6F7EC] text-[#1B5E20] text-xs font-extrabold mb-1 whitespace-nowrap">
              ✓ ĐÃ XÁC NHẬN ĐƠN HÀNG
            </div>
            <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-emerald-950 text-balance">
              Đặt hàng thành công!
            </h1>
            <p className="text-gray-600 text-sm sm:text-base text-balance">
              Cảm ơn bạn đã đồng hành cùng <strong>Gieo Mơ</strong>. Mối nhân duyên này mang lại thật nhiều giá trị tốt đẹp!
            </p>
          </div>
        </>
      )}

      {/* Summary Box */}
      <div className="bg-white rounded-3xl p-6 border border-emerald-100 shadow-xs text-left space-y-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-gray-100 gap-2">
          <div>
            <span className="text-xs text-gray-500 font-medium block">Mã đơn hàng của bạn:</span>
            <span className="font-heading font-extrabold text-2xl text-emerald-950 tracking-wider font-mono">
              {orderCode}
            </span>
          </div>
          <div className="text-left sm:text-right">
            <span className="text-xs text-gray-500 font-medium block">Tổng tiền thanh toán:</span>
            <MoneyDisplay amount={finalAmount} className="text-2xl font-extrabold text-emerald-950" />
          </div>
        </div>

        {/* Customer & Shipping Information Display */}
        <div className="p-4 rounded-2xl bg-[#FFFDF9] border border-[#F0E5D8] space-y-3">
          <h3 className="font-heading font-bold text-sm text-[#231B16] flex items-center gap-2 pb-2 border-b border-[#F0E5D8]">
            <span>📦</span> Thông tin nhận hàng & Người đặt:
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-gray-500 block">Họ tên người nhận:</span>
              <span className="font-bold text-gray-900 text-sm">
                {order?.recipient_name || order?.buyer_name || "Khách hàng"}
              </span>
            </div>

            <div>
              <span className="text-gray-500 block">Số điện thoại:</span>
              <span className="font-bold text-[#16381D] text-sm font-mono">
                {order?.recipient_phone || order?.buyer_phone || "Đang cập nhật"}
              </span>
            </div>

            <div className="sm:col-span-2 space-y-1 pt-1 border-t border-gray-100">
              <span className="text-gray-500 block">Địa chỉ nhận hàng:</span>
              <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-white border border-[#F0E5D8]">
                <span className="font-semibold text-gray-800 text-xs">
                  {order?.delivery_type === "home_delivery"
                    ? `${order.address_detail}, ${order.province}`
                    : order?.delivery_type === "pickup_point"
                    ? `Nhận tại điểm hẹn: ${order.address_detail}`
                    : (order?.address_detail || "Giao qua tay thành viên Mầm Mơ")}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    handleCopy(
                      `${order?.recipient_name || order?.buyer_name} - ${order?.recipient_phone || order?.buyer_phone} - ${order?.address_detail}, ${order?.province}`,
                      "address"
                    )
                  }
                  className="shrink-0 px-2 py-1 rounded-lg bg-gray-50 hover:bg-[#BFE9C3] text-gray-700 hover:text-[#16381D] border border-gray-200 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors"
                  title="Sao chép địa chỉ"
                >
                  {copiedItem === "address" ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedItem === "address" ? "Đã chép" : "Chép"}</span>
                </button>
              </div>
            </div>

            {order?.introducer_info && (
              <div className="sm:col-span-2 pt-1">
                <span className="text-gray-500 block">Người quen / Nguồn giới thiệu:</span>
                <span className="inline-block mt-0.5 px-2.5 py-0.5 rounded-full bg-[#BFE9C3] text-[#16381D] font-bold text-[11px]">
                  🌱 {order.introducer_info}
                </span>
              </div>
            )}

            {order?.customer_note && (
              <div className="sm:col-span-2 pt-1">
                <span className="text-gray-500 block">Ghi chú cho Mầm Mơ:</span>
                <p className="italic text-gray-700 text-xs bg-white p-2 rounded-xl border border-gray-100 mt-1">
                  &ldquo;{order.customer_note}&rdquo;
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Payment Instructions if Banking */}
        {paymentMethod === "banking" ? (
          <div className="space-y-4 pt-2">
            {/* QR Code — Primary, Top, Large */}
            <div className="flex flex-col items-center justify-center p-5 rounded-2xl bg-white border-2 border-[#BFE9C3] text-center shadow-soft">
              <p className="text-sm font-extrabold text-[#231B16] mb-1">
                📱 Quét mã VietQR chuyển khoản
              </p>
              <p className="text-xs text-[#7E7068] mb-3">
                Đã tự động điền <strong>{finalAmount.toLocaleString("vi-VN")}đ</strong> & nội dung <strong>{orderCode}</strong>
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={vietQrUrl}
                alt="VietQR"
                className="w-56 sm:w-64 h-auto object-contain rounded-xl shadow-xs border border-[#F0E5D8]"
              />
              <div className="pt-2.5 flex items-center gap-4 text-xs font-bold">
                <a
                  href={vietQrUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#2D6338] hover:underline inline-flex items-center gap-1"
                >
                  <span>Mở ảnh to</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
                <a
                  href={vietQrUrl}
                  download={`QR-${orderCode}.png`}
                  className="text-[#7E7068] hover:text-[#231B16] inline-flex items-center gap-1"
                >
                  <Download className="w-3 h-3" />
                  <span>Tải ảnh QR</span>
                </a>
              </div>
            </div>

            {/* Direct Bank Details */}
            <div className="rounded-2xl border border-[#F0E5D8] bg-[#FFFDF9] p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-[#F0E5D8]">
                <span className="font-bold text-[#5C4D44] text-xs">🏦 Chuyển khoản thủ công:</span>
                <span className="text-[11px] text-gray-500 font-semibold">{bankAccount.bankName}</span>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <div>
                  <span className="text-gray-500 block text-[11px]">Chủ tài khoản:</span>
                  <span className="font-bold text-gray-900 text-xs">{bankAccount.accountHolder}</span>
                </div>
                <div>
                  <span className="text-gray-500 block text-[11px]">Số tài khoản:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-emerald-950 text-sm">{bankAccount.accountNumber}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(bankAccount.accountNumber, "stk")}
                      className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 cursor-pointer"
                    >
                      {copiedItem === "stk" ? "Đã chép" : "Chép"}
                    </button>
                  </div>
                </div>
                <div>
                  <span className="text-gray-500 block text-[11px]">Số tiền:</span>
                  <span className="font-extrabold text-emerald-950 text-sm">{finalAmount.toLocaleString("vi-VN")}đ</span>
                </div>
                <div>
                  <span className="text-gray-500 block text-[11px]">Nội dung CK:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-200 text-xs tracking-wider">
                      {bankAccount.transferMemo}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(bankAccount.transferMemo, "memo")}
                      className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 hover:bg-red-200 text-red-800 cursor-pointer"
                    >
                      {copiedItem === "memo" ? "Đã chép" : "Chép"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Customer Payment Confirmation CTA */}
            <div className="pt-3 border-t border-gray-100">
              {hasConfirmedPayment ? (
                <div className="p-3.5 rounded-2xl bg-[#E6F7EC] border border-[#A5D6A7] text-xs text-[#1B5E20] flex items-center justify-center gap-2 font-bold animate-in fade-in">
                  <span>✅</span>
                  <span>Đã nhận thông tin thanh toán! Đơn hàng đang được chuẩn bị.</span>
                </div>
              ) : (
                <div className="space-y-2 text-center">
                  <p className="text-xs text-[#7E7068]">
                    Đã chuyển khoản thành công trên App ngân hàng?
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsConfirmModalOpen(true)}
                    className="w-full sm:w-auto px-6 py-2.5 rounded-full bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-xs shadow-sm border border-[#9ed4a3] transition-all active:scale-95 cursor-pointer inline-flex items-center justify-center gap-2"
                  >
                    <span>✓ Tôi đã chuyển khoản xong</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* POST-CHECKOUT GIFT VOUCHER BOX */}
      {giftVoucher && (
        <div className="bg-linear-to-r from-amber-50 via-emerald-50 to-amber-50 rounded-3xl p-6 border-2 border-amber-300 shadow-sm text-left space-y-3 animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl animate-bounce">🎁</span>
            <div>
              <h3 className="font-heading font-extrabold text-base text-emerald-950">
                Món quà tri ân đặc biệt từ Mầm Mơ dành cho bạn!
              </h3>
              <p className="text-xs text-emerald-800 mt-0.5">
                Vì bạn đã gieo mầm đơn hàng trên {(giftVoucher.gift_min_order_value || 0).toLocaleString("vi-VN")}đ, Mầm Mơ xin gửi tặng bạn voucher cho lần mua tiếp theo:
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-white/90 border border-amber-200">
            <div className="flex items-center gap-3">
              <span className="font-mono font-extrabold text-base text-amber-700 bg-amber-100 px-3 py-1.5 rounded-xl border border-amber-300 tracking-wider">
                {giftVoucher.code}
              </span>
              <span className="text-xs text-gray-700 font-bold">
                {giftVoucher.discount_type === "freeship"
                  ? "Miễn phí vận chuyển toàn quốc"
                  : giftVoucher.discount_type === "percentage"
                  ? `Giảm ngay ${giftVoucher.discount_value}%`
                  : `Giảm ngay ${giftVoucher.discount_value.toLocaleString("vi-VN")}đ`}
              </span>
            </div>

            <button
              type="button"
              onClick={() => handleCopy(giftVoucher.code, "gift_voucher")}
              className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-500 text-amber-950 font-bold text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-2xs self-end sm:self-auto"
            >
              {copiedItem === "gift_voucher" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedItem === "gift_voucher" ? "Đã sao chép" : "Sao chép mã quà"}</span>
            </button>
          </div>
        </div>
      )}

      {/* AWAITING PAYMENT NOTICE */}
      {!isPaid && paymentMethod === "banking" && (
        <div className="p-4.5 rounded-3xl bg-amber-50/90 border border-amber-200 text-center space-y-1.5 animate-in fade-in">
          <div className="flex items-center justify-center gap-2 text-xs font-bold text-amber-900">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping inline-block" />
            <span>Đang chờ nhận chuyển khoản qua VietQR (Tự động cập nhật tức thì)</span>
          </div>
          <p className="text-[11.5px] text-amber-700">
            Thẻ chứng nhận gây quỹ &amp; quà tặng sẽ xuất hiện tại đây ngay khi giao dịch được xác nhận.
          </p>
        </div>
      )}

      {/* SOCIAL SHARE CARD & STORY SECTION — ONLY SHOWN ONCE PAID */}
      {isPaid && (
        <div className="bg-white rounded-3xl p-6 sm:p-7 border-2 border-emerald-200 shadow-md text-left space-y-5 animate-in zoom-in-95">
          {/* Success Banner */}
          <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center gap-3">
            <span className="text-2xl">🎉</span>
            <div>
              <span className="text-xs font-extrabold text-emerald-950 block">
                Thanh toán thành công! Gieo Mơ chân thành cảm ơn tấm lòng của bạn!
              </span>
              <span className="text-[11px] text-emerald-700">
                Dưới đây là Thẻ chứng nhận mua hàng gây quỹ dành riêng cho bạn:
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="relative w-10 h-10 rounded-full overflow-hidden border-2 border-emerald-400 shadow-xs bg-white shrink-0">
                <Image src="/images/logo.png" alt="Gieo Mơ" fill sizes="40px" className="object-cover" />
              </div>
              <div>
                <h3 className="font-heading font-extrabold text-base text-emerald-950 flex items-center gap-1.5">
                  <span>Thẻ mua hàng gây quỹ &amp; Lan tỏa cùng Mầm Mơ</span>
                </h3>
                <p className="text-xs text-gray-500 italic mt-0.5">&ldquo;{shareQuote}&rdquo;</p>
              </div>
            </div>
          </div>

          {/* Card Preview Banner Mockup (Story 9:16 Style) */}
          <div className="relative rounded-3xl overflow-hidden border-2 border-dashed border-[#BFE9C3] bg-linear-to-b from-[#FFFDF8] via-[#FAF4E8] to-[#F3ECE0] p-6 text-center space-y-4 shadow-inner max-w-md mx-auto">
            {/* Wax Seal with Gieo Mơ Logo */}
            <div className="absolute top-4 right-4 w-12 h-12 rounded-full bg-[#22542B] border-2 border-[#D4AF37] shadow-md flex flex-col items-center justify-center text-white rotate-12 z-10">
              <div className="relative w-5 h-5 rounded-full overflow-hidden bg-white">
                <Image src="/images/logo.png" alt="Gieo Mơ" fill sizes="20px" className="object-cover" />
              </div>
              <span className="text-[7px] font-extrabold tracking-tight mt-0.5">GIEO MƠ</span>
            </div>

            {/* Header: Brand and Big Typography */}
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#BFE9C3] text-[#16381D] text-[11px] font-extrabold">
                <span>🌿</span>
                <span>TẠP HÓA GIEO MƠ</span>
              </div>
              <p className="text-[10.5px] text-[#7E7068] italic">Dự án bán hàng gây quỹ của Mầm Mơ</p>
              <h3 className="font-serif text-xl sm:text-2xl font-black text-[#16381D] tracking-wide pt-1">
                CẢM ƠN NGƯỜI GIEO MẦM
              </h3>
              <div className="text-xs text-[#65B374]">✨ 🌿 🌱 🌿 ✨</div>
            </div>

            {/* Spotlight Customer Box */}
            <div className="p-4 rounded-2xl bg-white/95 border border-[#E8DEC8] shadow-xs space-y-2">
              <span className="text-[10px] font-bold text-[#7E7068] uppercase tracking-widest block">Gửi tặng bạn</span>
              <h2 className="font-handwriting text-4xl sm:text-5xl font-bold text-[#16381D] tracking-wide leading-tight py-1">
                {order?.buyer_name || "Bạn đọc hảo tâm"}
              </h2>
              <p className="font-serif italic text-xs sm:text-sm text-[#342A24] leading-relaxed">
                &ldquo;{order?.buyer_name || "Bạn"} vừa cùng Gieo Mơ gieo một hạt mơ, thắp một hy vọng cho trẻ em khó khăn 🌱&rdquo;
              </p>
            </div>

            {/* Postal Stamp / Evidence Box */}
            <div className="p-3.5 rounded-2xl bg-[#FFFDF9] border border-dashed border-[#DED1BC] text-left text-xs space-y-2 relative overflow-hidden">
              {/* Postmark stamp */}
              <div className="absolute right-2 top-2 w-16 h-16 rounded-full border-2 border-emerald-900/20 text-[8px] font-mono text-emerald-900/60 flex flex-col items-center justify-center -rotate-12 pointer-events-none">
                <span className="font-bold">GIEO MƠ</span>
                <span>{(() => { const d = new Date(); return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth()+1).toString().padStart(2, "0")}`; })()}</span>
                <span>POST</span>
              </div>

              <div>
                <span className="text-[10.5px] text-[#5C4D44] font-bold block">📦 Gói quà bạn đã chọn:</span>
                <span className="font-bold text-gray-900 text-xs block truncate pr-16">
                  {order?.items && order.items.length > 0
                    ? order.items.map((it: any) => it.item_name_snapshot || it.product_name_snapshot || "Sản phẩm Mầm Mơ").join(", ")
                    : "Pouch May Thủ Công Gieo Mơ"}
                </span>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-gray-100 text-[11px]">
                <div>
                  <span className="text-gray-500">📅 Ngày gieo hạt: </span>
                  <span className="font-bold text-[#16381D]">
                    {(() => {
                      const d = new Date();
                      return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear()}`;
                    })()}
                  </span>
                </div>
              </div>
            </div>

            {/* Trust Badge */}
            <div className="px-3 py-1.5 rounded-full bg-[#EBF7EE] border border-[#A5D6A7] text-[10.5px] sm:text-[11px] font-extrabold text-[#16381D]">
              🌱 100% LỢI NHUẬN ĐƯỢC ĐÓNG GÓP VÀO QUỸ CỦA MẦM MƠ
            </div>

            {/* CTA & QR Code */}
            <div className="p-3 rounded-2xl bg-white/90 border border-[#F0E5D8] flex items-center justify-between gap-3 text-left">
              <div>
                <span className="font-serif font-bold text-xs text-[#16381D] block">Cùng lan tỏa mầm xanh!</span>
                <span className="text-[10.5px] text-[#5C4D44] leading-tight block mt-0.5">
                  Quét mã để cùng <strong>{order?.buyer_name || "bạn"}</strong> gieo thêm những mầm xanh nhé! 🌱
                </span>
              </div>
              <div className="shrink-0 w-16 h-16 rounded-xl border border-[#F0E5D8] overflow-hidden bg-white p-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=https%3A%2F%2Fgieomo.store&color=16-56-29&bgcolor=255-255-255"
                  alt="QR Code"
                  className="w-full h-full object-contain"
                />
              </div>
            </div>

            <p className="text-[10px] text-[#7E7068] font-medium">
              gieomo.store • facebook.com/BanHangGieoMo
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => setIsShareModalOpen(true)}
              className="px-4 py-3 rounded-2xl bg-cream hover:bg-emerald-50 border border-emerald-200 text-emerald-950 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-98 shadow-2xs"
            >
              <span>👁️ Xem trước thẻ Story (9:16)</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadShareCard}
              disabled={isGeneratingCard}
              className="px-4 py-3 rounded-2xl bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all border border-[#9ed4a3] active:scale-98 shadow-2xs disabled:opacity-60"
            >
              <Download className="w-4 h-4" />
              <span>{isGeneratingCard ? "Đang chuẩn bị ảnh..." : "Tải thẻ Story (PNG)"}</span>
            </button>

            <button
              type="button"
              onClick={handleNativeShare}
              disabled={isSharing}
              className="px-4 py-3 rounded-2xl bg-[#1877F2] hover:bg-[#166fe5] text-white font-extrabold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-98 shadow-2xs disabled:opacity-60"
            >
              <Share2 className="w-4 h-4" />
              <span>{isSharing ? "Đang mở chia sẻ..." : "Đăng Story / Chia sẻ"}</span>
            </button>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
        <Link href={`/track?code=${orderCode}`} className="w-full sm:w-auto">
          <Button variant="outline" size="lg" fullWidth>
            🔍 Tra cứu tiến độ đơn hàng
          </Button>
        </Link>
        <Link href="/" className="w-full sm:w-auto">
          <Button variant="primary" size="lg" fullWidth>
            🌱 Về trang chủ
          </Button>
        </Link>
      </div>

      {/* MODAL: XEM TRƯỚC THẺ CHIA SẺ STORY */}
      {isShareModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 border border-[#F0E5D8] shadow-2xl space-y-4 animate-in zoom-in-95 text-left max-h-[95vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#F0E5D8] pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">📸</span>
                <h3 className="font-heading font-extrabold text-base text-[#231B16]">
                  Thẻ chứng nhận tự hào (Story 9:16)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsShareModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 cursor-pointer text-sm"
              >
                ✕
              </button>
            </div>

            {/* Story Card Mockup Container */}
            <div
              id="story-card-mockup"
              className="relative p-6 rounded-3xl bg-linear-to-b from-[#FFFDF8] via-[#FAF4E8] to-[#F3ECE0] border-4 border-dashed border-[#BFE9C3] shadow-md space-y-4 text-center overflow-hidden"
            >
              {/* Wax Seal with Gieo Mơ Logo */}
              <div className="absolute top-4 right-4 w-12 h-12 rounded-full bg-[#22542B] border-2 border-[#D4AF37] shadow-md flex flex-col items-center justify-center text-white rotate-12 z-10">
                <div className="relative w-5 h-5 rounded-full overflow-hidden bg-white">
                  <Image src="/images/logo.png" alt="Gieo Mơ" fill sizes="20px" className="object-cover" />
                </div>
                <span className="text-[7px] font-extrabold tracking-tight mt-0.5">GIEO MƠ</span>
              </div>

              {/* Header */}
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#BFE9C3] text-[#16381D] text-[11px] font-extrabold">
                  <span>🌿</span>
                  <span>TẠP HÓA GIEO MƠ</span>
                </div>
                <p className="text-[10.5px] text-[#7E7068] italic">Dự án bán hàng gây quỹ của Mầm Mơ</p>
                <h3 className="font-serif text-xl sm:text-2xl font-black text-[#16381D] tracking-wide pt-1">
                  CẢM ƠN NGƯỜI GIEO MẦM
                </h3>
                <div className="text-xs text-[#65B374]">✨ 🌿 🌱 🌿 ✨</div>
              </div>

              {/* Customer Spotlight Box */}
              <div className="p-4 rounded-2xl bg-white/95 border border-[#E8DEC8] shadow-xs space-y-2">
                <span className="text-[10px] font-bold text-[#7E7068] uppercase tracking-widest block">Gửi tặng bạn</span>
                <h2 className="font-handwriting text-4xl sm:text-5xl font-bold text-[#16381D] tracking-wide leading-tight py-1">
                  {order?.buyer_name || "Bạn đọc hảo tâm"}
                </h2>
                <p className="font-serif italic text-xs sm:text-sm text-[#342A24] leading-relaxed">
                  &ldquo;{order?.buyer_name || "Bạn"} vừa cùng Gieo Mơ gieo một hạt mơ, thắp một hy vọng cho trẻ em khó khăn 🌱&rdquo;
                </p>
              </div>

              {/* Postal Stamp / Action Evidence */}
              <div className="p-3.5 rounded-2xl bg-[#FFFDF9] border border-dashed border-[#DED1BC] text-left text-xs space-y-2 relative overflow-hidden">
                {/* Postmark stamp */}
                <div className="absolute right-2 top-2 w-16 h-16 rounded-full border-2 border-emerald-900/20 text-[8px] font-mono text-emerald-900/60 flex flex-col items-center justify-center -rotate-12 pointer-events-none">
                  <span className="font-bold">GIEO MƠ</span>
                  <span>{(() => { const d = new Date(); return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth()+1).toString().padStart(2, "0")}`; })()}</span>
                  <span>POST</span>
                </div>

                <div>
                  <span className="text-[10.5px] text-[#5C4D44] font-bold block">📦 Gói quà bạn đã chọn:</span>
                  <span className="font-bold text-gray-900 text-xs block truncate pr-16">
                    {order?.items && order.items.length > 0
                      ? order.items.map((it: any) => it.item_name_snapshot || it.product_name_snapshot || "Sản phẩm Mầm Mơ").join(", ")
                      : "Pouch May Thủ Công Gieo Mơ"}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-gray-100 text-[11px]">
                  <div>
                    <span className="text-gray-500">📅 Ngày gieo hạt: </span>
                    <span className="font-bold text-[#16381D]">
                      {(() => {
                        const d = new Date();
                        return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear()}`;
                      })()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Trust Badge */}
              <div className="px-3 py-1.5 rounded-full bg-[#EBF7EE] border border-[#A5D6A7] text-[10.5px] sm:text-[11px] font-extrabold text-[#16381D]">
                🌱 100% LỢI NHUẬN ĐƯỢC ĐÓNG GÓP VÀO QUỸ CỦA MẦM MƠ
              </div>

              {/* QR Code CTA */}
              <div className="p-3 rounded-2xl bg-white/90 border border-[#F0E5D8] flex items-center justify-between gap-3 text-left">
                <div>
                  <span className="font-serif font-bold text-xs text-[#16381D] block">Cùng lan tỏa mầm xanh!</span>
                  <span className="text-[10.5px] text-[#5C4D44] leading-tight block mt-0.5">
                    Quét mã để cùng <strong>{order?.buyer_name || "bạn"}</strong> gieo thêm những mầm xanh nhé! 🌱
                  </span>
                </div>
                <div className="shrink-0 w-16 h-16 rounded-xl border border-[#F0E5D8] overflow-hidden bg-white p-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=https%3A%2F%2Fgieomo.store&color=16-56-29&bgcolor=255-255-255"
                    alt="QR Code"
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>

              <p className="text-[10px] text-[#7E7068] font-medium">
                gieomo.store • facebook.com/BanHangGieoMo
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-2 border-t border-gray-100">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <a
                  href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent("https://gieomo.store")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 sm:flex-initial px-3.5 py-2.5 rounded-full bg-[#1877F2] hover:bg-[#166fe5] text-white font-bold text-xs inline-flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Facebook</span>
                </a>
                <button
                  type="button"
                  onClick={handleNativeShare}
                  disabled={isSharing}
                  className="flex-1 sm:flex-initial px-3.5 py-2.5 rounded-full bg-linear-to-r from-[#833ab4] via-[#fd1d1d] to-[#fcb045] hover:opacity-90 text-white font-bold text-xs inline-flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-60"
                >
                  <span>📸 Instagram Story</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleDownloadShareCard}
                disabled={isGeneratingCard}
                className="w-full sm:w-auto px-5 py-2.5 rounded-full bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-xs inline-flex items-center justify-center gap-1.5 shadow-xs cursor-pointer border border-[#9ed4a3] disabled:opacity-60"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isGeneratingCard ? "Đang xuất ảnh..." : "Tải ảnh PNG"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: XÁC NHẬN ĐÃ CHUYỂN KHOẢN */}
      {isConfirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 border border-emerald-100 shadow-2xl space-y-4 animate-in zoom-in-95 text-left">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">💳</span>
                <h3 className="font-heading font-extrabold text-base text-emerald-950">
                  Xác nhận chuyển khoản VietQR
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                className="p-1 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 cursor-pointer text-sm"
              >
                ✕
              </button>
            </div>

            <div className="p-3 rounded-2xl bg-cream/70 border border-emerald-100 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">Mã đơn hàng:</span>
                <span className="font-mono font-bold text-emerald-950">{orderCode}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Số tiền:</span>
                <span className="font-extrabold text-emerald-950">{finalAmount.toLocaleString("vi-VN")}đ</span>
              </div>
            </div>

            {/* Proof image upload input */}
            <div className="space-y-2 text-xs">
              <label className="font-bold text-gray-700 block">
                Ảnh biên lai chuyển khoản (Tùy chọn):
              </label>

              {proofImage ? (
                <div className="relative inline-block rounded-2xl overflow-hidden border border-emerald-300 bg-gray-50 shadow-2xs">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={proofImage} alt="Biên lai" className="w-32 h-32 object-cover" />
                  <button
                    type="button"
                    onClick={() => setProofImage(null)}
                    className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/60 text-white hover:bg-black text-[10px] cursor-pointer"
                    title="Xóa ảnh"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center p-4 rounded-2xl border-2 border-dashed border-emerald-200 hover:border-emerald-400 bg-emerald-50/40 hover:bg-emerald-50/70 transition-colors cursor-pointer text-center group">
                  <span className="text-lg mb-1 group-hover:scale-110 transition-transform">📷</span>
                  <span className="text-xs font-bold text-emerald-900">Tải ảnh biên lai lên</span>
                  <span className="text-[10px] text-gray-500 mt-0.5">Hỗ trợ JPG, PNG (tối đa 5MB)</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-gray-500 hover:bg-gray-100 cursor-pointer"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={handleConfirmPaymentSubmit}
                className="px-5 py-2.5 rounded-full bg-soft-green hover:bg-emerald-300 text-emerald-950 font-extrabold text-xs shadow-xs border border-emerald-300 transition-all cursor-pointer"
              >
                Đã chuyển khoản xong ➔
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OrderSuccessPage() {
  return (
    <div className="min-h-screen flex flex-col bg-cream/60">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl py-12 md:py-16">
        <Suspense fallback={<div className="text-center py-12">Đang tải thông tin đơn hàng...</div>}>
          <OrderSuccessContent />
        </Suspense>
      </main>

      <Footer />
    </div>
  );
}
