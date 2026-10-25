"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, QrCode, Banknote, CheckCircle, RefreshCw, Copy, Check, Sparkles } from "lucide-react";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import {
  saveNewOrder,
  getStoredProducts,
  getActiveReferralMembers,
  getStoredSettings,
  syncStoredPaymentStatusLocal,
  syncStoredOrderStatusLocal,
  type StoredMember,
  type ExtendedProduct,
} from "@/lib/data/orderStore";
import { confirmPaymentServerFirst } from "@/lib/data/paymentConfirm";
import type { Order, OrderItem, OrderStatus } from "@/types/database";

export default function AdminPosPage() {
  const [products, setProducts] = useState<ExtendedProduct[]>([]);
  const [members, setMembers] = useState<StoredMember[]>([]);
  const [settings, setSettings] = useState(getStoredSettings());

  useEffect(() => {
    setProducts(getStoredProducts().filter((p) => p.status === "active"));
    setMembers(getActiveReferralMembers());
    setSettings(getStoredSettings());
  }, []);

  // Quick info
  const [quickCustomerName, setQuickCustomerName] = useState("");
  const [quickPhone, setQuickPhone] = useState("");
  const [sellerId, setSellerId] = useState("");
  const [quickNote, setQuickNote] = useState("");
  const [paymentMode, setPaymentMode] = useState<"cash" | "vietqr">("cash");

  // Cart items
  const [cartItems, setCartItems] = useState<
    Array<{
      productId: string;
      variantId?: string;
      name: string;
      variantName?: string;
      price: number;
      quantity: number;
    }>
  >([]);

  // Modals & Status
  const [activeQrModal, setActiveQrModal] = useState<{
    orderCode: string;
    orderId: string;
    amount: number;
    qrUrl: string;
  } | null>(null);

  const [lastCompletedOrder, setLastCompletedOrder] = useState<string | null>(null);
  const [copiedMemo, setCopiedMemo] = useState(false);

  // Batch 3A.2 — server-first: chặn double-submit, theo dõi lỗi, và trạng thái
  // cash-confirm dang dở (đơn ĐÃ tạo server nhưng CHƯA xác nhận thu tiền —
  // retry confirm chứ KHÔNG tạo lại đơn).
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isConfirmingPaid, setIsConfirmingPaid] = useState(false);
  const [paidConfirmError, setPaidConfirmError] = useState<string | null>(null);
  const [pendingCashConfirm, setPendingCashConfirm] = useState<{
    serverOrderCode: string;
    amount: number;
  } | null>(null);

  // Initialize with first product if cart empty
  useEffect(() => {
    if (products.length > 0 && cartItems.length === 0) {
      const firstProd = products[0];
      const firstVar = firstProd.variants?.[0];
      setCartItems([
        {
          productId: firstProd.product_id,
          variantId: firstVar?.variant_id || "",
          name: firstProd.name,
          variantName: firstVar?.name || "",
          price: firstProd.price,
          quantity: 1,
        },
      ]);
    }
  }, [products]);

  const subtotal = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }, [cartItems]);

  const handleAddItem = (prodId?: string) => {
    const targetProd = prodId
      ? products.find((p) => p.product_id === prodId)
      : products[0];
    if (!targetProd) return;

    const firstVar = targetProd.variants?.[0];
    // Check if already in cart with same product and variant
    const existingIndex = cartItems.findIndex(
      (it) => it.productId === targetProd.product_id && (!firstVar || it.variantId === firstVar.variant_id)
    );
    if (existingIndex >= 0) {
      setCartItems((prev) =>
        prev.map((it, i) => (i === existingIndex ? { ...it, quantity: it.quantity + 1 } : it))
      );
    } else {
      setCartItems((prev) => [
        ...prev,
        {
          productId: targetProd.product_id,
          variantId: firstVar?.variant_id || "",
          name: targetProd.name,
          variantName: firstVar?.name || "",
          price: targetProd.price,
          quantity: 1,
        },
      ]);
    }
  };

  const handleProductSelect = (index: number, newProdId: string) => {
    const prod = products.find((p) => p.product_id === newProdId);
    if (!prod) return;
    const firstVar = prod.variants?.[0];
    setCartItems((prev) =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              productId: prod.product_id,
              variantId: firstVar?.variant_id || "",
              name: prod.name,
              variantName: firstVar?.name || "",
              price: prod.price,
            }
          : item
      )
    );
  };

  const handleVariantSelect = (index: number, newVariantId: string) => {
    setCartItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const prod = products.find((p) => p.product_id === item.productId);
        const matchedVar = prod?.variants?.find((v) => v.variant_id === newVariantId);
        return {
          ...item,
          variantId: newVariantId,
          variantName: matchedVar?.name || item.variantName,
        };
      })
    );
  };

  const handleQuantityChange = (index: number, qty: number) => {
    setCartItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, quantity: Math.max(1, qty) } : item))
    );
  };

  const handleRemoveItem = (index: number) => {
    setCartItems((prev) => prev.filter((_, i) => i !== index));
  };

  const resetFormForNextCustomer = () => {
    setQuickCustomerName("");
    setQuickPhone("");
    setQuickNote("");
    setSubmitError(null);
    setPaidConfirmError(null);
    setPendingCashConfirm(null);
    if (products.length > 0) {
      setCartItems([
        {
          productId: products[0].product_id,
          name: products[0].name,
          price: products[0].price,
          quantity: 1,
        },
      ]);
    } else {
      setCartItems([]);
    }
    setActiveQrModal(null);
  };

  // Batch 3A.2 — cash confirm server-first: gọi /api/orders/payment action=confirm
  // với paymentMethod=cod + amount. Atomic RPC ghi payment/order/history/audit
  // cùng transaction và trả trạng thái canonical; client không chọn lifecycle.
  const performCashConfirm = async (serverOrderCode: string, amount: number) => {
    if (isConfirmingPaid) return;
    setIsConfirmingPaid(true);
    setPaidConfirmError(null);
    try {
      const outcome = await confirmPaymentServerFirst(serverOrderCode, {
        paymentMethod: "cod",
        amount,
      });

      if (outcome.ok || outcome.kind === "already_paid") {
        // Đồng bộ đúng trạng thái canonical server trả về; payment RPC chỉ
        // chuyển pending -> confirmed, không tự ý hoàn tất đơn bán hàng.
        syncStoredPaymentStatusLocal(serverOrderCode, "paid");
        syncStoredOrderStatusLocal(serverOrderCode, outcome.ok && outcome.orderStatus
          ? outcome.orderStatus as OrderStatus
          : "confirmed");
        setLastCompletedOrder(serverOrderCode);
        resetFormForNextCustomer();
        return;
      }

      // Thất bại: đơn ĐÃ tồn tại trên server (banking/pending) — KHÔNG tạo lại.
      // Giữ pendingCashConfirm để hiển thị nút "Thử xác nhận lại".
      setPaidConfirmError(outcome.message);
    } catch {
      setPaidConfirmError("Lỗi kết nối — vui lòng thử lại.");
    } finally {
      setIsConfirmingPaid(false);
    }
  };

  // Batch 3A.2 — tạo đơn SERVER-FIRST. newOrder dùng trạng thái khớp server
  // (banking/pending/pending/not_ready) cho CẢ cash lẫn QR — server luôn tạo
  // banking/pending/pending; cash được chuyển sang cod/paid/completed SAU khi
  // confirm pipeline thành công (không còn local-first paid/completed).
  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cartItems.length === 0 || subtotal <= 0) return;
    // Chặn double-submit + chặn tạo đơn mới khi cash-confirm còn dang dở.
    if (isSubmitting || pendingCashConfirm) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const randomCode = `GM-${Math.floor(100000 + Math.random() * 900000)}`;
      const newOrderId = `ord-${Date.now()}`;
      const matchedSeller = members.find((m) => m.memberId === sellerId);

      const orderItemsSnapshot: OrderItem[] = cartItems.map((item, idx) => {
        const prod = products.find((p) => p.product_id === item.productId);
        const variant = prod?.variants?.find((v) => v.variant_id === item.variantId) || prod?.variants?.[0];
        return {
          order_item_id: `item-${newOrderId}-${idx + 1}`,
          order_id: newOrderId,
          product_id: item.productId,
          variant_id: item.variantId || variant?.variant_id || null,
          combo_id: null,
          product_name_snapshot: item.name,
          item_name_snapshot: item.name,
          variant_name_snapshot: item.variantName || variant?.name || null,
          price_snapshot: item.price,
          quantity: item.quantity,
          subtotal: item.price * item.quantity,
          created_at: new Date().toISOString(),
        };
      });

      const isCash = paymentMode === "cash";

      // Trạng thái TẠO ĐƠN khớp server (RPC path hardcode banking/pending/
      // pending/not_ready). isCash chỉ quyết định đường xác nhận SAU tạo.
      const newOrder: Order = {
        order_id: newOrderId,
        order_code: randomCode,
        source_type: "event_sale",
        buyer_name: quickCustomerName.trim() || "Khách tại quầy",
        buyer_phone: quickPhone.trim() || "",
        buyer_email: "",
        recipient_name: quickCustomerName.trim() || "Khách tại quầy",
        recipient_phone: quickPhone.trim() || "",
        delivery_type: "member_delivery",
        address_detail: "Bán trực tiếp tại sự kiện / Quầy Mầm Mơ",
        district: "",
        province: "TP. Hồ Chí Minh",
        payment_method: "banking",
        payment_status: "pending",
        order_status: "pending",
        delivery_status: "not_ready",
        subtotal: subtotal,
        discount_amount: 0,
        shipping_fee: 0,
        final_amount: subtotal,
        total_cost: Math.round(subtotal * 0.4),
        seller_id: matchedSeller ? matchedSeller.memberId : null,
        introducer_info: matchedSeller
          ? `${matchedSeller.fullName} (${matchedSeller.referralCode})`
          : "Ban tổ chức trực quầy",
        referral_code: matchedSeller?.referralCode || null,
        created_by_member_id: matchedSeller ? matchedSeller.memberId : null,
        customer_note: quickNote ? `[Bán sự kiện] ${quickNote}` : "Bán trực tiếp tại sự kiện",
        items: orderItemsSnapshot,
        created_at: new Date().toISOString(),
        completed_at: null,
        updated_at: new Date().toISOString(),
      };

      const result = await saveNewOrder(newOrder, { attemptScope: "pos-create" });

      if (!result.success) {
        setSubmitError(result.error || "Không thể tạo đơn hàng. Vui lòng thử lại.");
        return;
      }

      const serverCode = result.serverOrderCode!;
      const serverAmount = result.finalAmount ?? subtotal;

      if (isCash) {
        // Đơn ĐÃ tạo server → vào trạng thái cash-confirm (retry confirm,
        // KHÔNG tạo lại đơn nếu confirm fail).
        setPendingCashConfirm({ serverOrderCode: serverCode, amount: serverAmount });
        await performCashConfirm(serverCode, serverAmount);
      } else {
        // QR: dùng server orderCode cho nội dung chuyển khoản + confirm.
        const qrUrl =
          settings.qrMode === "upload" && settings.qrImageUrl
            ? settings.qrImageUrl
            : `https://img.vietqr.io/image/MB-${settings.bankNumber || "03456789999"}-compact2.png?amount=${serverAmount}&addInfo=${serverCode}&accountName=${encodeURIComponent(
                settings.bankHolder || "CLB MAM MO GIEO MO"
              )}`;

        setActiveQrModal({
          orderCode: serverCode,
          orderId: result.serverOrderId!,
          amount: serverAmount,
          qrUrl,
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Batch 3A.2 — QR confirm server-first: /api/orders/payment action=confirm
  // với amount + mã ngân hàng thật. Không còn bypass payment pipeline.
  const handleConfirmQrPaid = async () => {
    if (!activeQrModal || isConfirmingPaid) return;
    const referenceNumber = window.prompt("Nhập mã giao dịch ngân hàng để đối soát:")?.trim();
    if (!referenceNumber) {
      setPaidConfirmError("Bắt buộc mã giao dịch ngân hàng thật để xác nhận thanh toán.");
      return;
    }
    setIsConfirmingPaid(true);
    setPaidConfirmError(null);
    try {
      const outcome = await confirmPaymentServerFirst(activeQrModal.orderCode, {
        amount: activeQrModal.amount,
        referenceNumber,
      });

      if (outcome.ok || outcome.kind === "already_paid") {
        syncStoredPaymentStatusLocal(activeQrModal.orderCode, "paid");
        syncStoredOrderStatusLocal(activeQrModal.orderCode, outcome.ok && outcome.orderStatus
          ? outcome.orderStatus as OrderStatus
          : "confirmed");
        setLastCompletedOrder(activeQrModal.orderCode);
        resetFormForNextCustomer();
        return;
      }

      if (outcome.paymentStatusIsPaid) {
        syncStoredPaymentStatusLocal(activeQrModal.orderCode, "paid");
      }
      setPaidConfirmError(outcome.message);
    } catch {
      setPaidConfirmError("Lỗi kết nối — vui lòng thử lại.");
    } finally {
      setIsConfirmingPaid(false);
    }
  };

  const handleCopyMemo = (memo: string) => {
    navigator.clipboard.writeText(memo);
    setCopiedMemo(true);
    setTimeout(() => setCopiedMemo(false), 2000);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Top Banner / Navigation */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/admin/orders" className="p-2 rounded-xl text-gray-500 hover:bg-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 font-extrabold text-[11px] border border-emerald-300">
                ⚡ POS BÁN TẠI SỰ KIỆN
              </span>
              <h1 className="font-heading font-extrabold text-2xl text-[#231B16]">
                Bán hàng trực tiếp tại quầy
              </h1>
            </div>
            <p className="text-xs text-[#7E7068] mt-0.5">
              Giao diện tối ưu chốt đơn nhanh: không cần địa chỉ, xuất mã VietQR tức thì hoặc thu tiền mặt trao tay.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/admin/orders/create"
            className="px-4 py-2 rounded-xl bg-white hover:bg-gray-50 text-[#5C4D44] font-bold text-xs border border-gray-200 shadow-2xs transition-colors"
          >
            📝 Nhập đơn đặt hộ (Giao hàng)
          </Link>
        </div>
      </div>

      {/* Success Notification Bar */}
      {lastCompletedOrder && (
        <div className="p-3.5 rounded-2xl bg-[#E6F7EC] border border-[#A5D6A7] text-xs text-[#1B5E20] flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2 font-bold">
            <CheckCircle className="w-4 h-4 text-emerald-700" />
            <span>Đã tạo & hoàn tất đơn hàng <strong>{lastCompletedOrder}</strong> thành công!</span>
          </div>
          <button
            onClick={() => setLastCompletedOrder(null)}
            className="text-[11px] underline text-emerald-800 font-bold hover:text-emerald-950 cursor-pointer"
          >
            Đóng thông báo
          </button>
        </div>
      )}

      {/* Batch 3A.2 — cash-confirm dang dở: đơn ĐÃ tạo server nhưng CHƯA xác
          nhận thu tiền. Retry confirm (KHÔNG tạo lại đơn). */}
      {pendingCashConfirm && (
        <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 text-xs text-amber-900 space-y-2">
          <div className="font-bold flex items-center gap-1.5">
            <span>⚠️</span>
            <span>
              Đơn <strong>{pendingCashConfirm.serverOrderCode}</strong> (
              {pendingCashConfirm.amount.toLocaleString("vi-VN")}đ) đã tạo trên máy chủ
              nhưng CHƯA xác nhận thu tiền mặt.
            </span>
          </div>
          {paidConfirmError && <p className="text-amber-800">{paidConfirmError}</p>}
          <button
            type="button"
            onClick={() => performCashConfirm(pendingCashConfirm.serverOrderCode, pendingCashConfirm.amount)}
            disabled={isConfirmingPaid}
            className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isConfirmingPaid ? "Đang xác nhận..." : "Thử xác nhận thu tiền lại"}
          </button>
        </div>
      )}

      {/* Batch 3A.2 — lỗi tạo đơn (server chưa tạo) */}
      {submitError && !pendingCashConfirm && (
        <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-700">
          {submitError}
        </div>
      )}

      {/* Main Grid */}
      <form onSubmit={handleCheckoutSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Product Table & Fast Add */}
        <div className="lg:col-span-7 space-y-6">
          {/* Quick Item Picker Chips */}
          <div className="bg-white rounded-3xl p-5 border border-[#F0E5D8] shadow-soft space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#7E7068] uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-600" /> Chọn nhanh món đang hot:
              </span>
              <span className="text-[11px] text-gray-400">Bấm để thêm vào đơn</span>
            </div>

            <div className="flex flex-wrap gap-2">
              {products.map((p) => (
                <button
                  key={p.product_id}
                  type="button"
                  onClick={() => handleAddItem(p.product_id)}
                  className="px-3 py-1.5 rounded-xl bg-[#FFFDF9] hover:bg-[#BFE9C3]/50 text-xs font-bold text-[#342A24] border border-[#F0E5D8] hover:border-[#9ed4a3] transition-all cursor-pointer active:scale-95 shadow-2xs"
                >
                  <span>{p.name}</span>
                  <span className="ml-1.5 text-emerald-800 font-mono text-[11px]">
                    {p.price.toLocaleString("vi-VN")}đ
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Cart Table */}
          <div className="bg-white rounded-3xl p-6 border border-[#F0E5D8] shadow-soft space-y-4">
            <div className="flex items-center justify-between border-b border-[#F0E5D8] pb-3">
              <h2 className="font-heading font-extrabold text-base text-[#231B16] flex items-center gap-2">
                <span>🛒</span> Danh sách món khách lấy ({cartItems.length})
              </h2>
              <button
                type="button"
                onClick={() => handleAddItem()}
                className="px-3 py-1 rounded-xl bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" /> Thêm dòng
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[550px] text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-500 font-bold text-[10px]">
                    <th className="py-2 px-2 w-10 text-center whitespace-nowrap">STT</th>
                    <th className="py-2 px-2 whitespace-nowrap">Sản phẩm</th>
                    <th className="py-2 px-2 text-right w-24 whitespace-nowrap">Đơn giá</th>
                    <th className="py-2 px-2 text-center w-28 whitespace-nowrap">Số lượng</th>
                    <th className="py-2 px-2 text-right w-28 whitespace-nowrap">Thành tiền</th>
                    <th className="py-2 px-2 w-10 text-center whitespace-nowrap">Xóa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cartItems.map((item, idx) => (
                    <tr key={idx} className="hover:bg-[#FFFDF9]">
                      <td className="py-3 px-2 text-center font-bold text-gray-400">
                        {idx + 1}
                      </td>
                      <td className="py-3 px-2">
                        {(() => {
                          const currentProd = products.find((p) => p.product_id === item.productId);
                          const hasVariants = currentProd?.variants && currentProd.variants.length > 0;
                          return (
                            <div className="space-y-1">
                              <select
                                value={item.productId}
                                onChange={(e) => handleProductSelect(idx, e.target.value)}
                                className="w-full p-2 rounded-xl border border-gray-200 text-xs font-bold bg-white text-gray-900 outline-none focus:border-emerald-500"
                              >
                                {products.map((p) => (
                                  <option key={p.product_id} value={p.product_id}>
                                    {p.name} ({p.price.toLocaleString("vi-VN")}đ)
                                  </option>
                                ))}
                              </select>
                              {hasVariants && (
                                <select
                                  value={item.variantId}
                                  onChange={(e) => handleVariantSelect(idx, e.target.value)}
                                  className="w-full p-1.5 rounded-lg border border-emerald-200 text-[11px] font-semibold bg-emerald-50/50 text-emerald-900 outline-none focus:border-emerald-500"
                                >
                                  {currentProd.variants?.map((v) => (
                                    <option key={v.variant_id} value={v.variant_id}>
                                      Phân loại: {v.name}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-3 px-2 text-right font-mono font-semibold text-gray-700">
                        {item.price.toLocaleString("vi-VN")}đ
                      </td>
                      <td className="py-3 px-2">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleQuantityChange(idx, item.quantity - 1)}
                            className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 font-bold text-gray-700 flex items-center justify-center cursor-pointer"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) => handleQuantityChange(idx, Number(e.target.value))}
                            className="w-10 text-center font-bold font-mono text-xs border border-gray-200 rounded-lg p-1 outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleQuantityChange(idx, item.quantity + 1)}
                            className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 font-bold text-gray-700 flex items-center justify-center cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-2 text-right font-bold text-[#1B3622] font-mono text-sm">
                        {(item.price * item.quantity).toLocaleString("vi-VN")}đ
                      </td>
                      <td className="py-3 px-2 text-center">
                        {cartItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="p-1 text-gray-400 hover:text-red-600 transition-colors cursor-pointer"
                            title="Xóa món này"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column: Checkout Info & Payment Action */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-[#F0E5D8] shadow-soft space-y-5 sticky top-20">
            {/* Quick Customer Note / Seller Assignment */}
            <div className="space-y-3.5">
              <h3 className="font-heading font-bold text-sm text-[#231B16] flex items-center justify-between">
                <span>📝 Thông tin nhanh (Không bắt buộc)</span>
                <span className="text-[10px] text-gray-400 font-normal">Để trống cũng được</span>
              </h3>

              <div>
                <label className="text-[11px] font-bold text-gray-700 block mb-1">
                  Tên khách / Ghi chú nhanh:
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: Anh Tuấn, Chị áo đỏ, hoặc để trống..."
                  value={quickCustomerName}
                  onChange={(e) => setQuickCustomerName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs outline-none focus:border-emerald-500 bg-[#FFFDF9]"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-700 block mb-1">
                  Số điện thoại khách (nếu khách muốn lưu bảo hành/tích điểm):
                </label>
                <input
                  type="tel"
                  placeholder="Ví dụ: 0901234567 (hoặc để trống)"
                  value={quickPhone}
                  onChange={(e) => setQuickPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs outline-none focus:border-emerald-500 bg-[#FFFDF9]"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-700 block mb-1">
                  Thành viên trực quầy / Chốt đơn (Tính doanh số gây quỹ):
                </label>
                <select
                  value={sellerId}
                  onChange={(e) => setSellerId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-800 outline-none focus:border-emerald-500 bg-[#FFFDF9]"
                >
                  <option value="">-- Trực tiếp Ban Tổ Chức --</option>
                  {members.map((m) => (
                    <option key={m.memberId} value={m.memberId}>
                      {m.fullName} ({m.referralCode})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-700 block mb-1">
                  Địa điểm nhận hàng:
                </label>
                <div className="px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-xs font-semibold text-gray-600">
                  📍 Bán trực tiếp tại sự kiện / Quầy Mầm Mơ (Giao tại chỗ)
                </div>
              </div>
            </div>

            {/* Total Calculation */}
            <div className="p-4 rounded-2xl bg-[#FFF8EE] border border-[#F0E5D8] space-y-2">
              <div className="flex justify-between text-xs text-gray-600">
                <span>Tổng tiền hàng:</span>
                <span className="font-bold text-gray-900 font-mono text-sm">
                  {subtotal.toLocaleString("vi-VN")}đ
                </span>
              </div>
              <div className="flex justify-between text-xs text-gray-600">
                <span>Phí giao hàng:</span>
                <span className="text-emerald-700 font-bold">Miễn phí (Tại chỗ)</span>
              </div>
              <div className="pt-2 border-t border-[#F0E5D8] flex justify-between items-center">
                <span className="font-extrabold text-[#231B16] text-sm">CẦN THU KHÁCH:</span>
                <span className="font-heading font-extrabold text-2xl text-[#1B3622] font-mono">
                  {subtotal.toLocaleString("vi-VN")}đ
                </span>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-2 pt-1">
              <span className="text-[11px] font-bold text-gray-700 uppercase block">
                Phương thức thu tiền:
              </span>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setPaymentMode("cash")}
                  className={`p-3 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center gap-1 ${
                    paymentMode === "cash"
                      ? "bg-emerald-50 border-emerald-600 text-emerald-950 ring-2 ring-emerald-500/20 font-extrabold"
                      : "bg-white border-gray-200 text-gray-700 hover:border-gray-300 font-semibold"
                  }`}
                >
                  <Banknote className="w-5 h-5 text-emerald-700" />
                  <span className="text-xs">Tiền mặt</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMode("vietqr")}
                  className={`p-3 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center gap-1 ${
                    paymentMode === "vietqr"
                      ? "bg-emerald-50 border-emerald-600 text-emerald-950 ring-2 ring-emerald-500/20 font-extrabold"
                      : "bg-white border-gray-200 text-gray-700 hover:border-gray-300 font-semibold"
                  }`}
                >
                  <QrCode className="w-5 h-5 text-emerald-700" />
                  <span className="text-xs">Quét VietQR</span>
                </button>
              </div>
            </div>

            {/* Action Submit Button */}
            <div className="pt-2">
              {paymentMode === "cash" ? (
                <button
                  type="submit"
                  disabled={subtotal <= 0 || isSubmitting || !!pendingCashConfirm}
                  className="w-full py-3.5 px-4 rounded-full bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-sm shadow-md transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2 border border-[#9ed4a3] disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Banknote className="w-4 h-4" />
                  <span>
                    {isSubmitting
                      ? "Đang tạo đơn & xác nhận trên máy chủ..."
                      : `Thu tiền mặt ${subtotal.toLocaleString("vi-VN")}đ & Hoàn tất`}
                  </span>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={subtotal <= 0 || isSubmitting || !!pendingCashConfirm}
                  className="w-full py-3.5 px-4 rounded-full bg-[#16381D] hover:bg-[#204e2a] text-white font-extrabold text-sm shadow-md transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <QrCode className="w-4 h-4 text-[#BFE9C3]" />
                  <span>
                    {isSubmitting ? "Đang tạo đơn trên máy chủ..." : "Xuất mã VietQR cho khách quét ➔"}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      </form>

      {/* MODAL: HIỆN MÃ VIETQR TẠI QUẦY */}
      {activeQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-in fade-in" style={{ willChange: "opacity" }}>
          <div
            className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-7 border border-[#F0E5D8] shadow-2xl space-y-5 text-center animate-in zoom-in-95 duration-200"
            style={{ willChange: "transform, opacity", transform: "translateZ(0)" }}
          >
            <div className="flex items-center justify-between border-b border-[#F0E5D8] pb-3 text-left">
              <div>
                <span className="text-xs font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                  MÃ ĐƠN: {activeQrModal.orderCode}
                </span>
                <h3 className="font-heading font-extrabold text-lg text-[#231B16] mt-1">
                  Khách quét VietQR thanh toán
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveQrModal(null)}
                className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* QR Image */}
            <div className="flex flex-col items-center justify-center p-4 rounded-2xl bg-white border-2 border-emerald-300 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={activeQrModal.qrUrl}
                alt="Mã VietQR"
                className="w-64 h-auto object-contain rounded-xl"
              />
              <span className="font-heading font-extrabold text-2xl text-emerald-950 mt-3 font-mono">
                {activeQrModal.amount.toLocaleString("vi-VN")}đ
              </span>
              <span className="text-xs text-gray-500">
                Tài khoản: {settings.bankHolder || "CLB MAM MO GIEO MO"} ({settings.bankNumber || "03456789999"})
              </span>
            </div>

            {/* Transfer Memo */}
            <div className="p-3 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-between text-xs">
              <div className="text-left">
                <span className="text-gray-500 block text-[10px]">Nội dung chuyển khoản:</span>
                <span className="font-mono font-bold text-red-600 text-sm">
                  {activeQrModal.orderCode}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleCopyMemo(activeQrModal.orderCode)}
                className="px-2.5 py-1 rounded-lg bg-white border border-gray-300 text-gray-700 font-bold hover:bg-gray-100 cursor-pointer flex items-center gap-1"
              >
                {copiedMemo ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedMemo ? "Đã chép" : "Chép"}</span>
              </button>
            </div>

            {/* Confirm Paid Action */}
            <div className="space-y-2 pt-2 border-t border-[#F0E5D8]">
              {paidConfirmError && (
                <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 text-left">
                  {paidConfirmError}
                </div>
              )}
              <button
                type="button"
                onClick={handleConfirmQrPaid}
                disabled={isConfirmingPaid}
                className="w-full py-3 px-4 rounded-full bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-sm shadow-md transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2 border border-[#9ed4a3] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <CheckCircle className="w-4 h-4 text-emerald-800" />
                <span>
                  {isConfirmingPaid
                    ? "Đang xác nhận thanh toán..."
                    : "✓ Khách đã chuyển khoản xong — Đã nhận tiền"}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveQrModal(null)}
                className="text-xs text-gray-500 hover:text-gray-800 font-semibold underline py-1 cursor-pointer"
              >
                Đóng / Khách hủy giao dịch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
