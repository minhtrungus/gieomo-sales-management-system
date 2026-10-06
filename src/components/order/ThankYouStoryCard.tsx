"use client";

import React, { useState } from "react";
import { Download, Share2, Sparkles } from "lucide-react";
import type { Order } from "@/types/database";

interface ThankYouStoryCardProps {
  order?: Order | null;
  defaultCustomerName?: string;
  onDownloadStart?: () => void;
  onDownloadEnd?: () => void;
}

/**
 * High-speed native Canvas 2D card generator.
 * Faithfully matches the Gieo Mơ Thank You Certificate artwork.
 * Runs in ~20ms directly on client-side.
 */
export async function generateThankYouCardCanvas(
  customerName: string,
  orderDate: string,
  items: Array<{ name: string; quantity: number }>,
  qrDataUrl?: string
): Promise<HTMLCanvasElement | null> {
  try {
    if (typeof document !== "undefined" && document.fonts) {
      await document.fonts.ready;
    }
  } catch {
    // continue if font API is not ready
  }

  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return null;

  // Helper to load image safely
  const loadImg = (src: string): Promise<HTMLImageElement | null> => {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
      setTimeout(() => resolve(null), 2000);
    });
  };

  const qrSrc =
    qrDataUrl ||
    `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=https%3A%2F%2Fgieomo.store&color=22-56-29&bgcolor=255-255-255`;
  const qrImg = await loadImg(qrSrc);

  // 1. BASE BACKGROUND: Warm artisanal parchment paper with watercolor aura
  const bgGrad = ctx.createLinearGradient(0, 0, 0, 1920);
  bgGrad.addColorStop(0, "#FBF7ED");
  bgGrad.addColorStop(0.3, "#FAF4E8");
  bgGrad.addColorStop(0.7, "#F5EDE0");
  bgGrad.addColorStop(1, "#EFE4D2");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 1080, 1920);

  // Soft watercolor botanical washes in four corners
  const drawCornerLeaves = (x: number, y: number, rot: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = "rgba(163, 197, 155, 0.25)";
    ctx.beginPath();
    ctx.ellipse(0, 0, 70, 35, Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(189, 219, 180, 0.3)";
    ctx.beginPath();
    ctx.ellipse(30, -20, 50, 25, -Math.PI / 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  drawCornerLeaves(80, 80, 0);
  drawCornerLeaves(1000, 80, Math.PI / 2);
  drawCornerLeaves(80, 1840, -Math.PI / 2);
  drawCornerLeaves(1000, 1840, Math.PI);

  // Paper sewing stitch dashed border
  ctx.strokeStyle = "#8EB88B";
  ctx.lineWidth = 3.5;
  ctx.setLineDash([16, 12]);
  ctx.strokeRect(42, 42, 996, 1836);

  ctx.strokeStyle = "#E2D3B8";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([8, 8]);
  ctx.strokeRect(54, 54, 972, 1812);
  ctx.setLineDash([]);

  // 2. TOP LEFT: WASHI TAPE BANNER
  ctx.save();
  ctx.translate(90, 95);
  ctx.rotate(-0.035); // -2 deg
  // Washi tape body
  ctx.fillStyle = "rgba(163, 203, 160, 0.9)";
  ctx.beginPath();
  ctx.roundRect(0, 0, 390, 54, 6);
  ctx.fill();
  ctx.strokeStyle = "#7CA679";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Jagged tape corners
  ctx.fillStyle = "#FAF4E8";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(8, 12);
  ctx.lineTo(0, 24);
  ctx.lineTo(8, 36);
  ctx.lineTo(0, 54);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(390, 0);
  ctx.lineTo(382, 12);
  ctx.lineTo(390, 24);
  ctx.lineTo(382, 36);
  ctx.lineTo(390, 54);
  ctx.closePath();
  ctx.fill();

  // Washi text
  ctx.fillStyle = "#16381D";
  ctx.font = "bold 24px 'Montserrat', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("🌱  TẠP HÓA GIEO MƠ", 195, 37);
  ctx.restore();

  // Subtitle directly under washi tape
  ctx.fillStyle = "#5C4D44";
  ctx.font = "italic 20px 'Montserrat', sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Dự án bán hàng gây quỹ của Mầm Mơ,  🌱", 92, 180);

  // 3. TOP RIGHT: OFFICIAL ROUND SEAL BADGE
  ctx.save();
  ctx.translate(890, 145);
  // Outer circle
  ctx.fillStyle = "#1E4B27";
  ctx.beginPath();
  ctx.arc(0, 0, 72, 0, Math.PI * 2);
  ctx.fill();
  // Gold ring
  ctx.strokeStyle = "#D4AF37";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, 64, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, 58, 0, Math.PI * 2);
  ctx.stroke();

  // Sprout icon & GIEO MƠ text
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 32px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("🌱", 0, -6);
  ctx.font = "bold 16px 'Montserrat', sans-serif";
  ctx.letterSpacing = "2px";
  ctx.fillText("GIEO MƠ", 0, 34);
  ctx.restore();

  // 4. MAIN HEADLINE: "Cảm ơn người Gieo Mầm"
  ctx.save();
  ctx.textAlign = "center";
  // Line 1: Cảm ơn người
  ctx.fillStyle = "#1E4B27";
  ctx.font = "bold 48px 'Playfair Display', Georgia, serif";
  ctx.fillText("Cảm ơn người", 540, 270);

  // Line 2: Gieo Mầm (With warm green shadow)
  ctx.font = "900 78px 'Playfair Display', Georgia, serif";
  ctx.fillStyle = "rgba(101, 179, 116, 0.35)";
  ctx.fillText("Gieo Mầm", 544, 354);
  ctx.fillStyle = "#1E4B27";
  ctx.fillText("Gieo Mầm", 540, 350);

  // Sprout growing on right + Yellow heart
  ctx.font = "34px sans-serif";
  ctx.fillText("🌱", 745, 345);
  ctx.font = "26px sans-serif";
  ctx.fillText("💛", 335, 340);
  ctx.fillText("🌿", 710, 270);
  ctx.fillText("🍃", 370, 270);
  ctx.restore();

  // 5. BOX 1: RECIPIENT SPOTLIGHT ("GỬI TẶNG BẠN")
  const box1Y = 405;
  const box1H = 345;
  ctx.save();
  // Card background
  ctx.fillStyle = "#FFFEFB";
  ctx.beginPath();
  ctx.roundRect(85, box1Y, 910, box1H, 28);
  ctx.fill();
  // Dashed green stitch border
  ctx.strokeStyle = "#8EB88B";
  ctx.lineWidth = 3;
  ctx.setLineDash([14, 12]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Top pill: GỬI TẶNG BẠN
  ctx.fillStyle = "#CBE7C7";
  ctx.beginPath();
  ctx.roundRect(420, box1Y - 20, 240, 42, 21);
  ctx.fill();
  ctx.fillStyle = "#16381D";
  ctx.font = "bold 17px 'Montserrat', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("GỬI TẶNG BẠN", 540, box1Y + 7);

  // Customer Name in Cursive Handwritten Display
  ctx.fillStyle = "#16381D";
  const nameLen = customerName.length;
  const nameSize = nameLen > 24 ? 54 : nameLen > 16 ? 66 : 76;
  ctx.font = `bold ${nameSize}px 'Caveat', 'Playfair Display', cursive, sans-serif`;
  ctx.fillText(`✨  ${customerName}  ✨`, 540, box1Y + 95);

  // Quote
  ctx.fillStyle = "#332720";
  ctx.font = "italic 23px 'Playfair Display', Georgia, serif";
  const safeName = nameLen > 20 ? customerName.slice(0, 18) + "..." : customerName;
  ctx.fillText(`“ ${safeName} vừa cùng Gieo Mơ gieo một hạt mơ,`, 540, box1Y + 175);
  ctx.fillText("thắp một hy vọng cho trẻ em khó khăn 🌱 ”", 540, box1Y + 220);

  // Subtext
  ctx.fillStyle = "#6B8569";
  ctx.font = "18px 'Montserrat', sans-serif";
  ctx.fillText("Từng món quà nhỏ trao đi là thêm cơ hội đến trường cho các em.", 540, box1Y + 285);
  ctx.restore();

  // 6. BOX 2: PACKAGE & EVIDENCE ("GÓI QUÀ BẠN ĐÃ CHỌN")
  const box2Y = 790;
  const box2H = 345;
  ctx.save();
  ctx.fillStyle = "#FFFEFB";
  ctx.beginPath();
  ctx.roundRect(85, box2Y, 910, box2H, 28);
  ctx.fill();
  ctx.strokeStyle = "#DCCDB8";
  ctx.lineWidth = 3;
  ctx.setLineDash([14, 12]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Title: GÓI QUÀ BẠN ĐÃ CHỌN
  ctx.textAlign = "left";
  ctx.fillStyle = "#5C4D44";
  ctx.font = "bold 23px 'Montserrat', sans-serif";
  ctx.fillText("🌱 GÓI QUÀ BẠN ĐÃ CHỌN:", 135, box2Y + 60);

  // Items list
  ctx.fillStyle = "#231B16";
  ctx.font = "bold 24px 'Montserrat', sans-serif";
  let itemY = box2Y + 115;
  items.slice(0, 3).forEach((it) => {
    const truncated = it.name.length > 28 ? it.name.slice(0, 26) + "..." : it.name;
    ctx.fillText(`• ${truncated}`, 135, itemY);
    ctx.textAlign = "right";
    ctx.fillText(`x${it.quantity}`, 620, itemY);
    ctx.textAlign = "left";
    itemY += 46;
  });

  // Date of Sowing
  ctx.fillStyle = "#5C4D44";
  ctx.font = "bold 20px 'Montserrat', sans-serif";
  ctx.fillText("📅 NGÀY GIEO HẠT:", 135, box2Y + 250);
  ctx.fillStyle = "#16381D";
  ctx.font = "bold 23px 'Montserrat', sans-serif";
  ctx.fillText(orderDate, 380, box2Y + 250);

  // Contribution
  ctx.fillStyle = "#5C4D44";
  ctx.font = "bold 20px 'Montserrat', sans-serif";
  ctx.fillText("🌱 ĐỒNG GÓP QUỸ:", 135, box2Y + 295);
  ctx.fillStyle = "#2D6338";
  ctx.font = "bold 22px 'Montserrat', sans-serif";
  ctx.fillText("100% Lợi nhuận vì trẻ em", 380, box2Y + 295);

  // Right Side: Vintage Postmark Cancellation Stamp
  ctx.save();
  ctx.translate(805, box2Y + 165);
  ctx.rotate(-0.1);
  ctx.strokeStyle = "rgba(38, 82, 46, 0.75)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, 72, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, 56, 0, Math.PI * 2);
  ctx.stroke();

  // Sprout in center
  ctx.fillStyle = "#26522E";
  ctx.font = "30px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("🌱", 0, 8);

  // Curved stamp text
  ctx.font = "bold 13px 'Montserrat', sans-serif";
  ctx.fillText("GIEO MƠ", 0, -32);
  ctx.font = "bold 9.5px 'Montserrat', sans-serif";
  ctx.fillText("TỪ NHỮNG ĐIỀU NHỎ BÉ", 0, 42);

  // Wavy cancellation lines
  ctx.strokeStyle = "rgba(38, 82, 46, 0.65)";
  ctx.lineWidth = 2.5;
  for (let l = -20; l <= 20; l += 18) {
    ctx.beginPath();
    ctx.moveTo(80, l);
    ctx.bezierCurveTo(95, l - 10, 110, l + 10, 125, l);
    ctx.bezierCurveTo(140, l - 10, 155, l + 10, 170, l);
    ctx.stroke();
  }
  ctx.restore();
  ctx.restore();

  // 7. TRUST BANNER (100% LỢI NHUẬN)
  const bannerY = 1170;
  ctx.save();
  ctx.fillStyle = "#D7ECD0";
  ctx.beginPath();
  ctx.roundRect(85, bannerY, 910, 72, 36);
  ctx.fill();
  ctx.strokeStyle = "#A4D59C";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.fillStyle = "#16381D";
  ctx.font = "bold 23px 'Montserrat', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("🌱  100% LỢI NHUẬN ĐƯỢC ĐÓNG GÓP VÀO QUỸ CỦA MẦM MƠ  🌱", 540, bannerY + 45);
  ctx.restore();

  // 8. BOTTOM SECTION: MASCOT IN POUCH + QR CODE + SLOGAN TAG
  const btmBoxY = 1275;
  const btmBoxH = 460;
  ctx.save();
  ctx.fillStyle = "#FFFEFB";
  ctx.beginPath();
  ctx.roundRect(85, btmBoxY, 910, btmBoxH, 28);
  ctx.fill();
  ctx.strokeStyle = "#E8D8C3";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Draw Cute Mầm Mascot in Canvas Pouch (Left side)
  ctx.save();
  ctx.translate(110, btmBoxY + 70);

  // 1) Thread Spool beside pouch
  ctx.fillStyle = "#D4AF85";
  ctx.beginPath();
  ctx.roundRect(220, 240, 60, 45, 8);
  ctx.fill();
  ctx.fillStyle = "#5C9B66";
  ctx.fillRect(230, 244, 40, 37);

  // 2) Pouch Bag (Handmade linen fabric)
  ctx.fillStyle = "#E5D4BE";
  ctx.beginPath();
  ctx.moveTo(30, 150);
  ctx.bezierCurveTo(20, 220, 35, 290, 80, 305);
  ctx.bezierCurveTo(140, 320, 220, 315, 250, 285);
  ctx.bezierCurveTo(270, 220, 260, 160, 240, 140);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#A48666";
  ctx.lineWidth = 3;
  ctx.stroke();

  // Pouch stitching dashed line
  ctx.strokeStyle = "#8A6D4F";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(48, 170);
  ctx.bezierCurveTo(45, 230, 60, 280, 95, 290);
  ctx.bezierCurveTo(150, 305, 210, 295, 235, 270);
  ctx.stroke();
  ctx.setLineDash([]);

  // Pouch label tag
  ctx.fillStyle = "#FFF9F0";
  ctx.beginPath();
  ctx.roundRect(90, 205, 52, 50, 6);
  ctx.fill();
  ctx.strokeStyle = "#A48666";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = "#2D6338";
  ctx.font = "bold 13px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("🌱", 116, 228);
  ctx.font = "bold 9px 'Montserrat', sans-serif";
  ctx.fillText("GIEO MƠ", 116, 245);

  // Tiny cute heart on pouch
  ctx.fillStyle = "#E5A088";
  ctx.font = "16px sans-serif";
  ctx.fillText("💛", 195, 235);

  // 3) Cute Mầm Mascot Peeking Out
  ctx.fillStyle = "#BCE58E";
  ctx.beginPath();
  ctx.arc(145, 120, 75, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#86B758";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Sprout Antenna on Mascot's Head
  ctx.fillStyle = "#46883F";
  ctx.beginPath();
  ctx.arc(130, 35, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(160, 35, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#2D6338";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(145, 55);
  ctx.quadraticCurveTo(145, 40, 145, 30);
  ctx.stroke();

  // Smiling Eyes (^_^)
  ctx.strokeStyle = "#1E3B1E";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(125, 115, 10, Math.PI, 0, false);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(165, 115, 10, Math.PI, 0, false);
  ctx.stroke();

  // Rosy Blushing Cheeks
  ctx.fillStyle = "rgba(255, 145, 145, 0.75)";
  ctx.beginPath();
  ctx.arc(108, 130, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(182, 130, 13, 0, Math.PI * 2);
  ctx.fill();

  // Happy Little Smile
  ctx.strokeStyle = "#1E3B1E";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(145, 132, 6, 0, Math.PI);
  ctx.stroke();

  // Paws holding pouch rim
  ctx.fillStyle = "#BCE58E";
  ctx.beginPath();
  ctx.arc(95, 160, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(195, 160, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.restore();

  // Center/Right: "Cùng lan tỏa mầm xanh!"
  ctx.textAlign = "left";
  ctx.fillStyle = "#16381D";
  ctx.font = "bold 30px 'Playfair Display', Georgia, serif";
  ctx.fillText("Cùng lan tỏa mầm xanh! 💛", 420, btmBoxY + 80);

  ctx.fillStyle = "#5C4D44";
  ctx.font = "21px 'Montserrat', sans-serif";
  const ctaName = nameLen > 18 ? customerName.slice(0, 16) + "..." : customerName;
  ctx.fillText(`Quét mã để cùng ${ctaName}`, 420, btmBoxY + 130);
  ctx.fillText("gieo thêm những mầm xanh mới nhé! 🌱", 420, btmBoxY + 168);

  // QR Code on right
  if (qrImg) {
    ctx.drawImage(qrImg, 720, btmBoxY + 50, 220, 220);
    ctx.strokeStyle = "#E8D8C3";
    ctx.lineWidth = 2;
    ctx.strokeRect(720, btmBoxY + 50, 220, 220);
  } else {
    ctx.fillStyle = "#1E4B27";
    ctx.beginPath();
    ctx.roundRect(720, btmBoxY + 50, 220, 220, 16);
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 20px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("gieomo.store", 830, btmBoxY + 165);
  }

  // Bottom-Right Artisanal Tag: "Gom từng mảnh nhỏ, dệt thành ước mơ 💛"
  ctx.save();
  ctx.translate(615, btmBoxY + 348);
  ctx.rotate(-0.04);
  // Tag shadow
  ctx.fillStyle = "rgba(0, 0, 0, 0.04)";
  ctx.beginPath();
  ctx.roundRect(2, 4, 330, 64, 14);
  ctx.fill();
  // Tag background
  ctx.fillStyle = "#FFFBF2";
  ctx.beginPath();
  ctx.roundRect(0, 0, 330, 64, 14);
  ctx.fill();
  ctx.strokeStyle = "#DCCDB8";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Tag Text: Gom từng mảnh nhỏ, dệt thành ước mơ 💛
  ctx.fillStyle = "#4A3B32";
  ctx.font = "italic bold 17px 'Playfair Display', Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillText("Gom từng mảnh nhỏ,", 165, 27);
  ctx.fillText("dệt thành ước mơ 💛", 165, 50);
  ctx.restore();

  ctx.restore();

  // 9. FOOTER BAR
  ctx.fillStyle = "#6B5E55";
  ctx.font = "bold 22px 'Montserrat', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("🌐 gieomo.store    •    📘 facebook.com/BanHangGieoMo", 540, 1795);

  return canvas;
}

export const ThankYouStoryCard = React.memo(function ThankYouStoryCard({
  order,
  defaultCustomerName = "Bạn đọc hảo tâm",
  onDownloadStart,
  onDownloadEnd,
}: ThankYouStoryCardProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  const customerName = (order?.buyer_name || defaultCustomerName).trim();
  const orderDate = (() => {
    const d = new Date();
    return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear()}`;
  })();

  const orderItems =
    order?.items && order.items.length > 0
      ? order.items.map((it: any) => ({
          name: it.item_name_snapshot || it.product_name_snapshot || "Pouch Gieo Mơ",
          quantity: it.quantity || 1,
        }))
      : [{ name: "Pouch Gieo Mơ", quantity: 1 }];

  // QR Code URL
  const qrUrl =
    "https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=https%3A%2F%2Fgieomo.store&color=16-56-29&bgcolor=255-255-255";

  // Handle Ultra-Fast Direct Canvas Download
  const handleDownloadCard = async () => {
    setIsGenerating(true);
    onDownloadStart?.();
    try {
      const canvas = await generateThankYouCardCanvas(customerName, orderDate, orderItems, qrUrl);
      if (!canvas) return;
      const cleanName = customerName.replace(/\s+/g, "-");
      const link = document.createElement("a");
      link.download = `Thiep-Cam-On-Nguoi-Gieo-Mam-${cleanName}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      console.warn("Card download error:", err);
    } finally {
      setIsGenerating(false);
      onDownloadEnd?.();
    }
  };

  // Handle Native Web Share (Mobile Story / Facebook)
  const handleShareCard = async () => {
    setIsSharing(true);
    try {
      const canvas = await generateThankYouCardCanvas(customerName, orderDate, orderItems, qrUrl);
      if (!canvas) {
        setIsSharing(false);
        return;
      }

      canvas.toBlob(async (blob) => {
        if (!blob) {
          setIsSharing(false);
          return;
        }

        const file = new File([blob], `Thiep-Cam-On-Gieo-Mo-${customerName.replace(/\s+/g, "-")}.png`, {
          type: "image/png",
        });

        if (typeof navigator !== "undefined" && navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: "Cảm ơn người Gieo Mầm — Gieo Mơ",
              text: `${customerName} vừa cùng Gieo Mơ gieo một hạt mơ cho trẻ em khó khăn 🌱 gieomo.store`,
            });
          } catch {
            // Dismissed
          }
        } else if (typeof navigator !== "undefined" && navigator.share) {
          try {
            await navigator.share({
              title: "Cảm ơn người Gieo Mầm — Gieo Mơ",
              text: `${customerName} vừa cùng Gieo Mơ gieo một hạt mơ cho trẻ em khó khăn 🌱`,
              url: "https://gieomo.store",
            });
          } catch {
            // Dismissed
          }
        } else {
          // Fallback download if no share sheet
          handleDownloadCard();
        }
        setIsSharing(false);
      }, "image/png");
    } catch {
      setIsSharing(false);
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto space-y-4">
      {/* 1:1 FAITHFUL ARTISANAL KRAFT/WATERCOLOR CARD PREVIEW */}
      <div
        id="gieomo-thankyou-card"
        className="relative rounded-3xl overflow-hidden border-3 border-dashed border-[#8EB88B] bg-gradient-to-b from-[#FBF7ED] via-[#FAF4E8] to-[#EFE4D2] p-5 sm:p-7 text-center shadow-xl space-y-5"
        style={{
          boxShadow: "0 10px 30px -5px rgba(50, 40, 30, 0.12), inset 0 0 40px rgba(180, 150, 110, 0.08)",
        }}
      >
        {/* Top-Left: Green Washi Tape */}
        <div className="flex items-start justify-between">
          <div className="text-left space-y-1">
            <div className="inline-flex items-center gap-1.5 px-4 py-1 rounded-sm bg-[#A3CBA0]/90 text-[#16381D] text-xs sm:text-sm font-extrabold shadow-2xs -rotate-2 border border-[#7CA679]/40">
              <span>🌱</span>
              <span className="tracking-wide">TẠP HÓA GIEO MƠ</span>
            </div>
            <p className="text-[11px] text-[#5C4D44] italic font-medium pt-0.5">
              Dự án bán hàng gây quỹ của Mầm Mơ, 🌿
            </p>
          </div>

          {/* Top-Right: Dark Green Circular Stamp Seal */}
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-[#1E4B27] border-2 border-[#D4AF37] shadow-md flex flex-col items-center justify-center text-white shrink-0 -rotate-3 p-1">
            <span className="text-sm sm:text-base">🌱</span>
            <span className="text-[8px] sm:text-[9px] font-extrabold tracking-widest text-[#FFFDF8]">GIEO MƠ</span>
          </div>
        </div>

        {/* Main Headline */}
        <div className="space-y-0.5 relative">
          <div className="absolute -top-3 left-6 text-sm">🍃</div>
          <div className="absolute -top-2 right-12 text-sm">🌿</div>
          <h2 className="font-heading font-extrabold text-2xl sm:text-3xl text-[#1E4B27] tracking-tight">
            Cảm ơn người
          </h2>
          <div className="flex items-center justify-center gap-2">
            <span className="text-base text-[#E2884E]">💛</span>
            <h1 className="font-heading font-black text-3xl sm:text-4xl text-[#1E4B27] tracking-tight drop-shadow-xs">
              Gieo Mầm
            </h1>
            <span className="text-xl">🌱</span>
          </div>
        </div>

        {/* Section 1: Customer Spotlight Box ("GỬI TẶNG BẠN") */}
        <div className="relative p-4 sm:p-5 rounded-2xl bg-[#FFFEFB] border-2 border-dashed border-[#8EB88B] shadow-xs space-y-2">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3.5 py-0.5 rounded-full bg-[#CBE7C7] text-[#16381D] text-[10.5px] font-extrabold uppercase tracking-wider border border-[#9ED4A3]">
            Gửi tặng bạn
          </div>
          <h3 className="font-handwriting text-4xl sm:text-5xl font-bold text-[#16381D] tracking-wide pt-2 pb-1">
            ✨ {customerName} ✨
          </h3>
          <p className="font-serif italic text-xs sm:text-sm text-[#332720] leading-relaxed max-w-sm mx-auto">
            &ldquo;<strong>{customerName}</strong> vừa cùng Gieo Mơ gieo một hạt mơ, thắp một hy vọng cho trẻ em khó khăn 🌱&rdquo;
          </p>
          <p className="text-[11px] text-[#6B8569] font-medium pt-1">
            Từng món quà nhỏ trao đi là thêm cơ hội đến trường cho các em.
          </p>
        </div>

        {/* Section 2: Package Evidence Box ("GÓI QUÀ BẠN ĐÃ CHỌN") */}
        <div className="relative p-4 rounded-2xl bg-[#FFFEFB] border-2 border-dashed border-[#DCCDB8] text-left text-xs space-y-2.5 overflow-hidden">
          {/* Postmark stamp in background/right */}
          <div className="absolute right-3 top-3 w-20 h-20 rounded-full border-2 border-[#26522E]/40 text-[#26522E] flex flex-col items-center justify-center -rotate-6 pointer-events-none p-1">
            <span className="text-xs font-bold">🌱</span>
            <span className="text-[8px] font-mono font-bold tracking-wider">GIEO MƠ</span>
            <span className="text-[6.5px] font-medium tracking-tight text-center leading-tight">TỪ NHỮNG ĐIỀU NHỎ BÉ</span>
          </div>

          <div className="space-y-1.5 pr-20">
            <span className="text-xs font-extrabold text-[#5C4D44] block">🌱 GÓI QUÀ BẠN ĐÃ CHỌN:</span>
            <div className="space-y-1 text-xs text-[#231B16]">
              {orderItems.map((it, idx) => (
                <div key={idx} className="flex items-center justify-between gap-2 font-bold">
                  <span className="truncate">• {it.name}</span>
                  <span className="shrink-0 text-emerald-900 font-mono">x{it.quantity}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-2 border-t border-[#F0E5D8] flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] text-[#5C4D44]">
            <div>
              <span>📅 NGÀY GIEO HẠT: </span>
              <strong className="text-[#16381D]">{orderDate}</strong>
            </div>
            <div>
              <span>🌱 ĐỒNG GÓP QUỸ: </span>
              <strong className="text-[#2D6338]">100% Lợi nhuận</strong>
            </div>
          </div>
        </div>

        {/* Section 3: Mint Trust Banner */}
        <div className="px-4 py-2 rounded-full bg-[#D7ECD0] border border-[#A4D59C] text-[11px] sm:text-xs font-black text-[#16381D] tracking-wide">
          🌱 100% LỢI NHUẬN ĐƯỢC ĐÓNG GÓP VÀO QUỸ CỦA MẦM MƠ 🌱
        </div>

        {/* Section 4: Mascot Mầm in Pouch & QR Code */}
        <div className="p-3.5 rounded-2xl bg-[#FFFEFB] border border-[#E8D8C3] flex items-center justify-between gap-3 text-left">
          {/* Mascot in Pouch graphic */}
          <div className="relative w-24 h-24 shrink-0 flex items-center justify-center">
            <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-xs">
              {/* Spool */}
              <rect x="70" y="70" width="20" height="15" rx="3" fill="#D4AF85" />
              <rect x="74" y="72" width="12" height="11" fill="#5C9B66" />
              {/* Pouch */}
              <path
                d="M15,50 C10,75 15,95 35,98 C55,101 80,98 88,88 C93,70 90,52 82,46 C75,44 25,44 15,50 Z"
                fill="#E5D4BE"
                stroke="#A48666"
                strokeWidth="2"
              />
              <path
                d="M22,58 C18,78 22,90 38,93 C55,96 75,93 82,82"
                fill="none"
                stroke="#8A6D4F"
                strokeWidth="1.5"
                strokeDasharray="3,2"
              />
              {/* Label */}
              <rect x="36" y="68" width="22" height="18" rx="2" fill="#FFF9F0" stroke="#A48666" strokeWidth="1" />
              <text x="47" y="77" fontSize="7" textAnchor="middle" fill="#2D6338" fontWeight="bold">🌱</text>
              <text x="47" y="83" fontSize="4" textAnchor="middle" fill="#2D6338" fontWeight="bold">GIEO MƠ</text>
              {/* Mầm Body */}
              <circle cx="50" cy="38" r="24" fill="#BCE58E" stroke="#86B758" strokeWidth="1.5" />
              {/* Sprout Head Antenna */}
              <circle cx="45" cy="12" r="5" fill="#46883F" />
              <circle cx="55" cy="12" r="5" fill="#46883F" />
              <path d="M50,18 Q50,14 50,11" stroke="#2D6338" strokeWidth="1.5" fill="none" />
              {/* Smiling Eyes */}
              <path d="M42,36 Q46,32 50,36" stroke="#1E3B1E" strokeWidth="1.5" fill="none" />
              <path d="M54,36 Q58,32 62,36" stroke="#1E3B1E" strokeWidth="1.5" fill="none" />
              {/* Cheeks */}
              <circle cx="39" cy="40" r="4" fill="#FFAAA6" opacity="0.8" />
              <circle cx="63" cy="40" r="4" fill="#FFAAA6" opacity="0.8" />
              {/* Paws */}
              <circle cx="34" cy="50" r="4.5" fill="#BCE58E" stroke="#86B758" strokeWidth="1" />
              <circle cx="68" cy="50" r="4.5" fill="#BCE58E" stroke="#86B758" strokeWidth="1" />
            </svg>
          </div>

          {/* CTA & Slogan */}
          <div className="flex-1 space-y-1">
            <span className="font-heading font-extrabold text-xs text-[#16381D] block">
              Cùng lan tỏa mầm xanh! 💛
            </span>
            <span className="text-[10.5px] text-[#5C4D44] leading-tight block">
              Quét mã để cùng <strong>{customerName}</strong> gieo thêm những mầm xanh mới nhé! 🌱
            </span>
            <div className="inline-block mt-1 px-2.5 py-0.5 rounded-md bg-[#FFFBF2] border border-[#DCCDB8] text-[9.5px] text-[#4A3B32] font-serif italic -rotate-1">
              Gom từng mảnh nhỏ, dệt thành ước mơ 💛
            </div>
          </div>

          {/* QR Code */}
          <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-xl border border-[#DCCDB8] bg-white p-1 shrink-0 overflow-hidden shadow-2xs">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrUrl} alt="QR Gieo Mơ" className="w-full h-full object-contain" loading="lazy" decoding="async" />
          </div>
        </div>

        {/* Footer info */}
        <p className="text-[10px] sm:text-[11px] text-[#6B5E55] font-bold tracking-wide">
          🌐 gieomo.store  •  📘 facebook.com/BanHangGieoMo
        </p>
      </div>

      {/* ACTION BUTTONS: TẢI NHANH & CHIA SẺ STORY */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
        <button
          type="button"
          onClick={handleDownloadCard}
          disabled={isGenerating}
          className="w-full py-3 px-4 rounded-2xl bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer transition-all border border-[#9ed4a3] active:scale-98 shadow-sm disabled:opacity-60"
        >
          <Download className="w-4 h-4" />
          <span>{isGenerating ? "Đang xuất ảnh..." : "Tải thẻ thiệp cảm ơn (PNG)"}</span>
        </button>

        <button
          type="button"
          onClick={handleShareCard}
          disabled={isSharing}
          className="w-full py-3 px-4 rounded-2xl bg-[#1877F2] hover:bg-[#166fe5] text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-98 shadow-sm disabled:opacity-60"
        >
          <Share2 className="w-4 h-4" />
          <span>{isSharing ? "Đang chia sẻ..." : "Đăng Story / Chia sẻ"}</span>
        </button>
      </div>
    </div>
  );
});
