"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Suspense, useState, useEffect, useMemo, useTransition } from "react";
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
import { Copy, Check, ExternalLink, Download, Share2, Sparkles, Gift, Maximize2, X, ZoomIn } from "lucide-react";
import { compressImage } from "@/lib/utils/imageCompressor";
import { ThankYouStoryCard } from "@/components/order/ThankYouStoryCard";

function OrderSuccessContent() {
  const searchParams = useSearchParams();
  const orderCode = searchParams.get("code") || "GM-369817";
  const paymentMethod = searchParams.get("payment") || "banking";
  const urlAmount = Number(searchParams.get("amount") || "110000");
  const urlToken = searchParams.get("token") || "";

  const [proofToken] = useState<string>(() => {
    if (urlToken) return urlToken;
    if (typeof window !== "undefined" && orderCode) {
      return localStorage.getItem(`gieomo_order_token_${orderCode}`) || "";
    }
    return "";
  });

  const [settings, setSettings] = useState<SiteSettings>(() => {
    return typeof window !== "undefined" ? getStoredSettings() : DEFAULT_SETTINGS;
  });

  const [order, setOrder] = useState<Order | null>(() => {
    if (typeof window === "undefined" || !orderCode) return null;
    try {
      const orders = getStoredOrders();
      return orders.find((o) => o.order_code === orderCode || o.order_id === orderCode) || null;
    } catch {
      return null;
    }
  });

  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  
  const [hasSubmittedProof, setHasSubmittedProof] = useState<boolean>(() => {
    if (typeof window === "undefined" || !orderCode) return false;
    try {
      const localSubmitted = localStorage.getItem(`gieomo_proof_submitted_${orderCode}`) === "true";
      const orders = getStoredOrders();
      const found = orders.find((o) => o.order_code === orderCode || o.order_id === orderCode);
      return (
        localSubmitted ||
        Boolean(found?.payment_proof) ||
        Boolean(found?.internal_note?.includes("[Khách đã nộp ảnh biên lai CK"))
      );
    } catch {
      return false;
    }
  });

  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  
  const [proofImage, setProofImage] = useState<string | null>(() => {
    if (typeof window === "undefined" || !orderCode) return null;
    try {
      const localProof = localStorage.getItem(`gieomo_proof_${orderCode}`);
      if (localProof) return localProof;
      const orders = getStoredOrders();
      const found = orders.find((o) => o.order_code === orderCode || o.order_id === orderCode);
      return found?.payment_proof || null;
    } catch {
      return null;
    }
  });

  const [proofFile, setProofFile] = useState<File | null>(null);
  const [isUploadingProof, setIsUploadingProof] = useState(false);
  const [zoomedProof, setZoomedProof] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Social Share Card states
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const shareQuote = "Tôi vừa cùng Mầm Mơ gieo một giấc mơ cho trẻ em khó khăn 🌱";

  useEffect(() => {
    setSettings(getStoredSettings());
    const handleUpdate = () => setSettings(getStoredSettings());
    window.addEventListener("gieomo_settings_updated", handleUpdate);
    return () => window.removeEventListener("gieomo_settings_updated", handleUpdate);
  }, []);

  // Fetch order from DB and local cache on mount
  useEffect(() => {
    if (!orderCode) return;

    // Fetch directly from server API (ensures cross-device sync on mobile/PC)
    fetch(`/api/orders?code=${encodeURIComponent(orderCode)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.success && Array.isArray(data.orders) && data.orders.length > 0) {
          const dbOrder = data.orders[0];
          setOrder((prev) => ({ ...(prev || {}), ...dbOrder }));
          if (
            dbOrder.payment_proof ||
            dbOrder.has_payment_proof ||
            dbOrder.payment_status === "paid" ||
            dbOrder.internal_note?.includes("[Khách đã nộp ảnh biên lai CK") ||
            dbOrder.internal_note?.includes("[Khách đính kèm ảnh biên lai CK]")
          ) {
            setHasSubmittedProof(true);
            if (dbOrder.payment_proof) setProofImage(dbOrder.payment_proof);
          }
        }
      })
      .catch((err) => console.warn("[OrderSuccess] Error fetching order from API:", err));
  }, [orderCode]);

  // isPaid is ONLY true if backend genuinely marked payment_status as "paid" or if COD
  const isPaid = (order?.payment_status === "paid") || paymentMethod === "cod";

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
    setProofFile(file);
    try {
      const compressed = await compressImage(file, { maxWidth: 900, maxHeight: 900, quality: 0.7 });
      setProofFile(compressed);
      const previewUrl = URL.createObjectURL(compressed);
      startTransition(() => {
        setProofImage(previewUrl);
      });
    } catch {
      const previewUrl = URL.createObjectURL(file);
      startTransition(() => {
        setProofImage(previewUrl);
      });
    }
  };

  const handleConfirmPaymentSubmit = async () => {
    setIsUploadingProof(true);
    setHasSubmittedProof(true);
    setIsConfirmModalOpen(false);

    if (orderCode) {
      try {
        const formData = new FormData();
        formData.append("orderCode", orderCode);
        const tokenToSend =
          proofToken ||
          (typeof window !== "undefined" ? localStorage.getItem(`gieomo_order_token_${orderCode}`) || "" : "");
        if (tokenToSend) {
          formData.append("token", tokenToSend);
        }

        const phone = order?.buyer_phone || order?.recipient_phone || "";
        if (phone) {
          formData.append("phone", phone);
        }

        if (proofFile) {
          formData.append("file", proofFile);
        } else if (proofImage && !proofImage.startsWith("blob:")) {
          formData.append("paymentProof", proofImage);
        }

        const res = await fetch("/api/orders/proof", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();
        if (data?.success) {
          const finalUrl = data.paymentProof || proofImage;
          localStorage.setItem(`gieomo_proof_submitted_${orderCode}`, "true");
          if (finalUrl) {
            localStorage.setItem(`gieomo_proof_${orderCode}`, finalUrl);
            setProofImage(finalUrl);
            updateStoredPaymentProof(orderCode, finalUrl);
          }

          const note = "[Khách đã nộp ảnh biên lai CK - Chờ BTC đối soát]";
          setOrder((prev) =>
            prev
              ? {
                  ...prev,
                  payment_proof: finalUrl || prev.payment_proof,
                  internal_note: note,
                }
              : prev
          );
        }
      } catch (err) {
        console.warn("Error updating payment confirmation:", err);
      } finally {
        setIsUploadingProof(false);
      }
    }
  };

  // Check gift voucher eligibility
  const giftVoucher = useMemo(() => {
    const vouchers = getStoredVouchers().filter((v) => v.status === "active" && v.is_gift_voucher);
    return vouchers.find((v) => finalAmount >= (v.gift_min_order_value || 0)) || null;
  }, [finalAmount]);



  return (
    <div className="max-w-2xl mx-auto space-y-6 text-center">
      {/* Status Header with stable min-height to prevent CLS */}
      <div className="min-h-[220px] flex flex-col items-center justify-center space-y-2">
      {paymentMethod === "banking" && !isPaid ? (
        hasSubmittedProof ? (
          <>
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-amber-100 text-amber-900 font-extrabold text-4xl shadow-md animate-pulse">
              🧾
            </div>
            <div className="space-y-2 text-center">
              <div className="inline-block px-3 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-extrabold mb-1 whitespace-nowrap border border-amber-300">
                ⏳ ĐÃ NỘP BIÊN LAI — CHỜ BTC ĐỐI SOÁT
              </div>
              <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-emerald-950">
                Đã tiếp nhận biên lai chuyển khoản!
              </h1>
              <p className="text-gray-600 text-sm sm:text-base max-w-lg mx-auto leading-relaxed">
                BTC Mầm Mơ đang kiểm tra đối soát với tài khoản ngân hàng. Đơn hàng sẽ tự động cập nhật ngay khi tài khoản nhận được tiền!
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-amber-100 text-amber-900 font-extrabold text-4xl shadow-md animate-pulse">
              💳
            </div>
            <div className="space-y-2 text-center">
              <div className="inline-block px-3 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-extrabold mb-1 whitespace-nowrap">
                ⏳ ĐANG CHỜ CHUYỂN KHOẢN VIETQR
              </div>
              <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-emerald-950">
                Đơn hàng đang chờ thanh toán
              </h1>
              <p className="text-gray-600 text-sm sm:text-base max-w-lg mx-auto leading-relaxed">
                Vui lòng quét mã VietQR bên dưới để hoàn tất giao dịch. Sau khi nhận được chuyển khoản, hệ thống sẽ tự động xác nhận đặt hàng thành công!
              </p>
            </div>
          </>
        )
      ) : (
        <>
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-soft-green text-emerald-950 font-extrabold text-4xl shadow-md animate-bounce">
            🎉
          </div>
          <div className="space-y-2 text-center">
            <div className="inline-block px-3 py-1 rounded-full bg-[#E6F7EC] text-[#1B5E20] text-xs font-extrabold mb-1 whitespace-nowrap border border-[#A5D6A7]">
              ✓ ĐÃ XÁC NHẬN THANH TOÁN
            </div>
            <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-emerald-950">
              Đặt hàng thành công!
            </h1>
            <p className="text-gray-600 text-sm sm:text-base leading-relaxed">
              Cảm ơn bạn đã đồng hành cùng <strong>Gieo Mơ</strong>. Mối nhân duyên này mang lại thật nhiều giá trị tốt đẹp!
            </p>
          </div>
        </>
      )}
      </div>

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

        {/* Payment Instructions if Banking and Not Paid Yet */}
        {paymentMethod === "banking" && !isPaid ? (
          <div className="space-y-4 pt-2">
            {/* QR Code — Primary, Top, Large */}
            <div className="flex flex-col items-center justify-center p-5 rounded-2xl bg-white border-2 border-[#BFE9C3] text-center shadow-soft">
              <p className="text-sm font-extrabold text-[#231B16] mb-1">
                📱 Quét mã VietQR chuyển khoản
              </p>
              <p className="text-xs text-[#7E7068] mb-3">
                Đã tự động điền <strong>{finalAmount.toLocaleString("vi-VN")}đ</strong> & nội dung <strong>{orderCode}</strong>
              </p>
              {/* Fixed Aspect-ratio Container to guarantee zero CLS */}
              <div className="w-56 sm:w-64 h-56 sm:h-64 aspect-square flex items-center justify-center bg-gray-50 rounded-xl overflow-hidden shadow-xs border border-[#F0E5D8] my-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={vietQrUrl}
                  alt="VietQR"
                  width={256}
                  height={256}
                  className="w-full h-full object-contain"
                  decoding="async"
                />
              </div>
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
              {hasSubmittedProof ? (
                <div className="p-4 rounded-2xl bg-amber-50/90 border border-amber-300 text-xs text-amber-950 space-y-2 animate-in fade-in text-left">
                  <div className="flex items-center gap-2 font-bold text-amber-900">
                    <span className="text-base">⏳</span>
                    <span>Đã nhận biên lai chuyển khoản — Chờ BTC đối soát</span>
                  </div>
                  <p className="text-[11.5px] text-amber-800 leading-relaxed">
                    Hệ thống đang chờ BTC Mầm Mơ kiểm tra khớp lệnh ngân hàng. Đơn hàng sẽ tự động chuyển sang trạng thái đã thanh toán ngay sau khi hoàn tất.
                  </p>
                  {proofImage && (
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => startTransition(() => setZoomedProof(proofImage))}
                        className="px-3 py-1.5 rounded-xl bg-white border border-amber-300 text-amber-900 font-bold text-[11px] hover:bg-amber-100 cursor-pointer inline-flex items-center gap-1.5 shadow-2xs transition-colors"
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                        <span>Xem lại ảnh biên lai đã gửi</span>
                      </button>
                    </div>
                  )}
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
                Dưới đây là Thẻ cảm ơn &amp; chứng nhận mua hàng gây quỹ dành riêng cho bạn:
              </span>
            </div>
          </div>

          <ThankYouStoryCard order={order} defaultCustomerName="Bạn đọc hảo tâm" />
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
                  <img src={proofImage} alt="Biên lai" className="w-32 h-32 object-cover" loading="lazy" decoding="async" />
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

      {/* LIGHTBOX MODAL: Xem ảnh biên lai phóng to cho khách hàng */}
      {zoomedProof && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 animate-in fade-in"
          onClick={() => startTransition(() => setZoomedProof(null))}
        >
          <div
            className="relative max-w-2xl w-full max-h-[90vh] bg-[#16381D] rounded-3xl p-4 border border-emerald-600/40 shadow-2xl flex flex-col items-center space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex items-center justify-between text-white pb-2 border-b border-white/10 px-2">
              <span className="font-heading font-bold text-sm">Ảnh biên lai đã gửi ({orderCode})</span>
              <button
                type="button"
                onClick={() => startTransition(() => setZoomedProof(null))}
                className="p-1 rounded-full hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="relative w-full flex-1 flex items-center justify-center overflow-auto max-h-[75vh] p-2 bg-black/30 rounded-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={zoomedProof}
                alt="Biên lai phóng to"
                decoding="async"
                loading="eager"
                className="max-w-full max-h-[72vh] object-contain rounded-xl shadow-md"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OrderSuccessSkeleton() {
  return (
    <div className="max-w-2xl mx-auto space-y-6 text-center animate-pulse">
      <div className="min-h-[220px] flex flex-col items-center justify-center space-y-3">
        <div className="w-20 h-20 rounded-3xl bg-amber-100/70" />
        <div className="w-48 h-6 rounded-full bg-amber-100/60" />
        <div className="w-72 h-8 rounded-2xl bg-gray-200" />
        <div className="w-96 max-w-full h-4 rounded-lg bg-gray-100" />
      </div>

      <div className="bg-white rounded-3xl p-6 border border-emerald-100 shadow-xs text-left space-y-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-gray-100 gap-2">
          <div className="space-y-1">
            <div className="w-32 h-3 bg-gray-100 rounded" />
            <div className="w-40 h-8 bg-gray-200 rounded-lg" />
          </div>
          <div className="space-y-1 sm:text-right">
            <div className="w-32 h-3 bg-gray-100 rounded" />
            <div className="w-32 h-8 bg-gray-200 rounded-lg" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#FFFDF9] border border-[#F0E5D8] h-32 bg-gray-50/50" />

        <div className="p-5 rounded-2xl bg-white border-2 border-[#BFE9C3] flex flex-col items-center justify-center space-y-3">
          <div className="w-56 sm:w-64 h-56 sm:h-64 rounded-xl bg-gray-100 aspect-square" />
        </div>
      </div>
    </div>
  );
}

export default function OrderSuccessPage() {
  return (
    <div className="min-h-screen flex flex-col bg-cream/60">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl py-12 md:py-16">
        <Suspense fallback={<OrderSuccessSkeleton />}>
          <OrderSuccessContent />
        </Suspense>
      </main>

      <Footer />
    </div>
  );
}
