"use client";

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  MessageSquare,
  Mail,
  Phone,
  Clock,
  Check,
  Reply,
  Search,
  Filter,
  Star,
  Trash2,
  CheckCircle,
  ExternalLink,
  ShieldCheck,
  Image as ImageIcon,
  AlertTriangle,
  X,
} from "lucide-react";
import {
  getStoredContactMessages,
  updateContactMessageStatus,
  deleteStoredContactMessage,
  getStoredReviews,
  deleteStoredReview,
  getStoredProducts,
  syncProductsFromServer,
} from "@/lib/data/orderStore";
import type { ContactMessage, ProductReview } from "@/types/database";
import type { ExtendedProduct } from "@/lib/data/mockData";
import { AdminSearchInput } from "@/components/admin/AdminSearchInput";

export default function AdminMessagesPage() {
  // Top Tab: "messages" | "reviews"
  const [activeMainTab, setActiveMainTab] = useState<"messages" | "reviews">("messages");

  // Contact Messages State
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "unread" | "read" | "replied">("all");
  const [selectedMessage, setSelectedMessage] = useState<ContactMessage | null>(null);
  const [messageToDelete, setMessageToDelete] = useState<ContactMessage | null>(null);

  // Product Reviews State
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [products, setProducts] = useState<ExtendedProduct[]>([]);
  const [reviewSearch, setReviewSearch] = useState("");
  const [reviewRatingFilter, setReviewRatingFilter] = useState<"all" | "5" | "4" | "3" | "low" | "with_image">("all");
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [reviewToDelete, setReviewToDelete] = useState<ProductReview | null>(null);
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null);

  const loadData = async () => {
    // 1. Load initial cache & sync products
    syncProductsFromServer(true);
    setMessages(getStoredContactMessages());
    setReviews(getStoredReviews());
    setProducts(getStoredProducts());

    // 2. Fetch fresh contact messages from Supabase
    try {
      const msgRes = await fetch("/api/contact/messages");
      const msgData = await msgRes.json();
      if (msgData?.success && Array.isArray(msgData.messages)) {
        setMessages((prev) => {
          const map = new Map<string, ContactMessage>();
          for (const m of prev) map.set(m.id, m);
          for (const m of msgData.messages) map.set(m.id, m);
          return Array.from(map.values()).sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        });
      }
    } catch {}

    // 3. Fetch fresh reviews from Supabase
    try {
      const revRes = await fetch("/api/reviews");
      const revData = await revRes.json();
      if (revData?.success && Array.isArray(revData.reviews)) {
        setReviews(revData.reviews);
      }
    } catch {}
  };

  useEffect(() => {
    loadData();
    const handleMsgUpdate = () => setMessages(getStoredContactMessages());
    const handleRevUpdate = () => setReviews(getStoredReviews());
    const handleProdUpdate = () => setProducts(getStoredProducts());

    window.addEventListener("gieomo_messages_updated", handleMsgUpdate);
    window.addEventListener("gieomo_reviews_updated", handleRevUpdate);
    window.addEventListener("gieomo_products_updated", handleProdUpdate);

    return () => {
      window.removeEventListener("gieomo_messages_updated", handleMsgUpdate);
      window.removeEventListener("gieomo_reviews_updated", handleRevUpdate);
      window.removeEventListener("gieomo_products_updated", handleProdUpdate);
    };
  }, []);

  // Contact Messages Handlers
  const handleStatusChange = (id: string, newStatus: "unread" | "read" | "replied") => {
    updateContactMessageStatus(id, newStatus);
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, status: newStatus } : m))
    );
    if (selectedMessage && selectedMessage.id === id) {
      setSelectedMessage((prev) => (prev ? { ...prev, status: newStatus } : null));
    }

    // Sync to Supabase
    fetch("/api/contact/messages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: newStatus }),
    }).catch((err) => console.warn("Could not update message status on server:", err));
  };

  const handleConfirmDeleteMessage = () => {
    if (!messageToDelete) return;
    const targetId = messageToDelete.id;
    deleteStoredContactMessage(targetId);
    setMessages((prev) => prev.filter((m) => m.id !== targetId));
    if (selectedMessage?.id === targetId) {
      setSelectedMessage(null);
    }
    setMessageToDelete(null);

    // Sync deletion to Supabase
    fetch(`/api/contact/messages?id=${encodeURIComponent(targetId)}`, {
      method: "DELETE",
    }).catch((err) => console.warn("Could not delete message on server:", err));
  };

  const filteredMessages = useMemo(() => {
    return messages.filter((m) => {
      const matchesSearch =
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.phone && m.phone.includes(searchQuery)) ||
        m.message.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = statusFilter === "all" || m.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [messages, searchQuery, statusFilter]);

  const unreadCount = messages.filter((m) => m.status === "unread").length;
  const repliedCount = messages.filter((m) => m.status === "replied").length;

  // Product Reviews Helpers
  const productMap = useMemo(() => {
    const map = new Map<string, ExtendedProduct>();
    for (const p of products) {
      map.set(p.product_id, p);
      if (p.slug) map.set(p.slug, p);
    }
    return map;
  }, [products]);

  const filteredReviews = useMemo(() => {
    return reviews.filter((r) => {
      const prod = productMap.get(r.product_id) || (r.product_slug ? productMap.get(r.product_slug) : undefined);
      const prodName = prod?.name || "";
      const matchesSearch =
        !reviewSearch.trim() ||
        r.author_name.toLowerCase().includes(reviewSearch.toLowerCase()) ||
        (r.phone_masked && r.phone_masked.includes(reviewSearch)) ||
        r.comment.toLowerCase().includes(reviewSearch.toLowerCase()) ||
        prodName.toLowerCase().includes(reviewSearch.toLowerCase());

      let matchesRating = true;
      if (reviewRatingFilter === "5") matchesRating = r.rating === 5;
      else if (reviewRatingFilter === "4") matchesRating = r.rating === 4;
      else if (reviewRatingFilter === "3") matchesRating = r.rating === 3;
      else if (reviewRatingFilter === "low") matchesRating = r.rating <= 2;
      else if (reviewRatingFilter === "with_image") matchesRating = Array.isArray(r.images) && r.images.length > 0;

      return matchesSearch && matchesRating;
    });
  }, [reviews, reviewSearch, reviewRatingFilter, productMap]);

  // Review statistics
  const reviewStats = useMemo(() => {
    if (reviews.length === 0) return { avg: 0, count: 0, stars5: 0, withImages: 0 };
    const sum = reviews.reduce((acc, r) => acc + (r.rating || 5), 0);
    const avg = Number((sum / reviews.length).toFixed(1));
    const stars5 = reviews.filter((r) => r.rating === 5).length;
    const withImages = reviews.filter((r) => r.images && r.images.length > 0).length;
    return { avg, count: reviews.length, stars5, withImages };
  }, [reviews]);

  const handleConfirmDeleteReview = () => {
    if (!reviewToDelete) return;
    deleteStoredReview(reviewToDelete.review_id);
    setReviewToDelete(null);
    setDeleteNotice("✓ Đã xóa bình luận khỏi hệ thống thành công!");
    setTimeout(() => setDeleteNotice(null), 4000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-[#231B16] flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-[#2D6338]" />
            Tin nhắn &amp; Đánh giá khách hàng
          </h1>
          <p className="text-xs text-[#7E7068] mt-0.5">
            Quản lý tập trung các phản hồi từ form liên hệ và toàn bộ bình luận, đánh giá của người mua.
          </p>
        </div>

        {/* Main Tab Switcher */}
        <div className="flex items-center gap-2 p-1 rounded-2xl bg-white border border-[#F0E5D8] shadow-2xs">
          <button
            type="button"
            onClick={() => setActiveMainTab("messages")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeMainTab === "messages"
                ? "bg-[#2D6338] text-white shadow-xs"
                : "text-[#7E7068] hover:text-[#231B16] hover:bg-[#FFF8EE]"
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Tin nhắn liên hệ</span>
            {unreadCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-mono">
                {unreadCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveMainTab("reviews")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeMainTab === "reviews"
                ? "bg-[#2D6338] text-white shadow-xs"
                : "text-[#7E7068] hover:text-[#231B16] hover:bg-[#FFF8EE]"
            }`}
          >
            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
            <span>Bình luận &amp; Đánh giá ({reviews.length})</span>
          </button>
        </div>
      </div>

      {deleteNotice && (
        <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold animate-in fade-in">
          {deleteNotice}
        </div>
      )}

      {/* ========================================================
          TAB 1: CONTACT MESSAGES
          ======================================================== */}
      {activeMainTab === "messages" && (
        <div className="space-y-6">
          {/* Filter and Search Bar */}
          <div className="bg-white rounded-3xl p-4 border border-[#F0E5D8] shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="w-full sm:w-80">
              <AdminSearchInput
                placeholder="Tìm theo tên, email, SĐT, nội dung..."
                onSearch={setSearchQuery}
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
              <Filter className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              {[
                { id: "all", label: "Tất cả" },
                { id: "unread", label: "Chưa đọc" },
                { id: "read", label: "Đã xem" },
                { id: "replied", label: "Đã phản hồi" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                    statusFilter === tab.id
                      ? "bg-[#2D6338] text-white"
                      : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Messages Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Message List */}
            <div className="lg:col-span-5 bg-white rounded-3xl border border-[#F0E5D8] shadow-soft overflow-hidden">
              <div className="p-4 border-b border-[#F0E5D8] bg-[#FFF8EE] flex items-center justify-between">
                <span className="font-bold text-xs text-[#542B07]">
                  Danh sách tin nhắn ({filteredMessages.length})
                </span>
                <span className="text-[11px] text-[#7E7068]">Mới nhất xếp trên</span>
              </div>

              <div className="divide-y divide-[#F0E5D8] max-h-[600px] overflow-y-auto">
                {filteredMessages.length === 0 ? (
                  <div className="p-8 text-center text-xs text-gray-400">
                    Không tìm thấy tin nhắn nào phù hợp bộ lọc.
                  </div>
                ) : (
                  filteredMessages.map((msg) => {
                    const isSelected = selectedMessage?.id === msg.id;
                    return (
                      <div
                        key={msg.id}
                        onClick={() => {
                          setSelectedMessage(msg);
                          if (msg.status === "unread") {
                            handleStatusChange(msg.id, "read");
                          }
                        }}
                        className={`p-4 transition-colors cursor-pointer text-left relative ${
                          isSelected ? "bg-[#FFF4E5]" : "hover:bg-[#FFFDF9]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span
                            className={`font-bold text-xs truncate ${
                              msg.status === "unread" ? "text-[#231B16]" : "text-gray-600"
                            }`}
                          >
                            {msg.name}
                          </span>
                          <span className="text-[10px] text-[#A89B92] shrink-0 font-mono">
                            {msg.created_at}
                          </span>
                        </div>

                        <p className="text-xs text-[#7E7068] line-clamp-2 leading-relaxed mb-2">
                          {msg.message}
                        </p>

                        <div className="flex items-center gap-1.5 flex-wrap">
                          {msg.status === "unread" && (
                            <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold">
                              Chưa đọc
                            </span>
                          )}
                          {msg.status === "read" && (
                            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[10px] font-medium">
                              Đã xem
                            </span>
                          )}
                          {msg.status === "replied" && (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold flex items-center gap-1">
                              <Check className="w-3 h-3" />
                              <span>Đã phản hồi</span>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Message Detail View */}
            <div className="lg:col-span-7">
              {selectedMessage ? (
                <div className="bg-white rounded-3xl p-6 border border-[#F0E5D8] shadow-soft space-y-5">
                  <div className="flex items-start justify-between gap-4 border-b border-[#F0E5D8] pb-4">
                    <div>
                      <h2 className="font-heading font-extrabold text-lg text-[#231B16]">
                        {selectedMessage.name}
                      </h2>
                      <span className="text-xs text-[#7E7068] block mt-0.5">
                        Gửi lúc: {selectedMessage.created_at}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={selectedMessage.status}
                        onChange={(e) =>
                          handleStatusChange(selectedMessage.id, e.target.value as any)
                        }
                        className="p-1.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 bg-white outline-none focus:border-[#2D6338]"
                      >
                        <option value="unread">Chưa đọc</option>
                        <option value="read">Đã xem</option>
                        <option value="replied">Đã phản hồi</option>
                      </select>
                    </div>
                  </div>

                  {/* Contact Info Card */}
                  <div className="p-4 rounded-2xl bg-[#FFF8EE] border border-[#F0E5D8] space-y-2 text-xs">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-[#7E7068] shrink-0" />
                      <a
                        href={`mailto:${selectedMessage.email}`}
                        className="font-bold text-[#2D6338] hover:underline"
                      >
                        {selectedMessage.email}
                      </a>
                    </div>
                    {selectedMessage.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-[#7E7068] shrink-0" />
                        <a
                          href={`tel:${selectedMessage.phone}`}
                          className="font-bold text-[#2D6338] hover:underline"
                        >
                          {selectedMessage.phone}
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Message Content */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-bold text-[#342A24] block uppercase tracking-wider">
                      Nội dung lời nhắn:
                    </span>
                    <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200 text-xs text-[#342A24] leading-relaxed whitespace-pre-line text-left">
                      {selectedMessage.message}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-2 border-t border-[#F0E5D8] flex flex-col sm:flex-row gap-2">
                    <a
                      href={`mailto:${selectedMessage.email}?subject=Phản hồi từ Mầm Mơ - Dự án Gieo Mơ&body=Chào ${encodeURIComponent(selectedMessage.name)},\n\nCảm ơn bạn đã gửi lời nhắn cho Mầm Mơ.\n\n`}
                      onClick={() => handleStatusChange(selectedMessage.id, "replied")}
                      className="flex-1 py-2.5 px-4 rounded-xl bg-[#2D6338] hover:bg-[#23502d] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer text-center"
                    >
                      <Reply className="w-4 h-4" />
                      <span>Soạn email trả lời</span>
                    </a>

                    {selectedMessage.phone && (
                      <a
                        href={`tel:${selectedMessage.phone}`}
                        className="py-2.5 px-4 rounded-xl bg-[#FFF8EE] hover:bg-[#f6ebd9] border border-[#F0E5D8] text-[#542B07] font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer text-center"
                      >
                        <Phone className="w-4 h-4 text-[#2D6338]" />
                        <span>Gọi điện</span>
                      </a>
                    )}

                    <button
                      type="button"
                      onClick={() => setMessageToDelete(selectedMessage)}
                      className="py-2.5 px-3.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-red-200"
                      title="Xóa tin nhắn này"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Xóa</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-3xl p-12 border border-[#F0E5D8] shadow-soft text-center text-gray-400 space-y-2">
                  <Mail className="w-10 h-10 mx-auto text-gray-300" />
                  <p className="text-xs font-medium">Chọn một tin nhắn từ danh sách để xem chi tiết và phản hồi</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          TAB 2: PRODUCT REVIEWS & RATINGS MANAGEMENT
          ======================================================== */}
      {activeMainTab === "reviews" && (
        <div className="space-y-6">
          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-white border border-[#F0E5D8] shadow-2xs">
              <span className="text-[11px] font-bold text-[#7E7068] block">Tổng đánh giá</span>
              <span className="text-2xl font-extrabold text-[#231B16] font-mono mt-1 block">
                {reviewStats.count}
              </span>
            </div>
            <div className="p-4 rounded-2xl bg-white border border-[#F0E5D8] shadow-2xs">
              <span className="text-[11px] font-bold text-[#7E7068] block">Điểm trung bình</span>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-2xl font-extrabold text-[#2D6338] font-mono">
                  {reviewStats.count > 0 ? reviewStats.avg : "—"}
                </span>
                <span className="text-xs text-amber-500 font-bold">★ / 5.0</span>
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-white border border-[#F0E5D8] shadow-2xs">
              <span className="text-[11px] font-bold text-[#7E7068] block">Đánh giá 5 sao</span>
              <span className="text-2xl font-extrabold text-[#1B3622] font-mono mt-1 block">
                {reviewStats.stars5}
              </span>
            </div>
            <div className="p-4 rounded-2xl bg-white border border-[#F0E5D8] shadow-2xs">
              <span className="text-[11px] font-bold text-[#7E7068] block">Có ảnh đính kèm</span>
              <span className="text-2xl font-extrabold text-[#542B07] font-mono mt-1 block">
                {reviewStats.withImages}
              </span>
            </div>
          </div>

          {/* Search & Filter Controls */}
          <div className="bg-white rounded-3xl p-4 border border-[#F0E5D8] shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="w-full sm:w-80">
              <AdminSearchInput
                placeholder="Tìm theo tên khách, SĐT, tên SP, nội dung..."
                onSearch={setReviewSearch}
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
              <Filter className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              {[
                { id: "all", label: "Tất cả" },
                { id: "5", label: "5 sao" },
                { id: "4", label: "4 sao" },
                { id: "3", label: "3 sao" },
                { id: "low", label: "1-2 sao" },
                { id: "with_image", label: "Có ảnh" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setReviewRatingFilter(tab.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                    reviewRatingFilter === tab.id
                      ? "bg-[#2D6338] text-white"
                      : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Reviews List */}
          <div className="bg-white rounded-3xl border border-[#F0E5D8] shadow-soft overflow-hidden">
            <div className="p-4 border-b border-[#F0E5D8] bg-[#FFF8EE] flex items-center justify-between">
              <span className="font-bold text-xs text-[#542B07]">
                Danh sách đánh giá ({filteredReviews.length})
              </span>
              <span className="text-[11px] text-[#7E7068]">
                Bình luận hiển thị công khai trên website
              </span>
            </div>

            <div className="divide-y divide-[#F0E5D8]">
              {filteredReviews.length === 0 ? (
                <div className="p-12 text-center text-xs text-gray-400 space-y-2">
                  <Star className="w-8 h-8 text-gray-300 mx-auto" />
                  <p>Chưa có đánh giá nào phù hợp với bộ lọc hiện tại.</p>
                </div>
              ) : (
                filteredReviews.map((rev) => {
                  const prod = productMap.get(rev.product_id);
                  const prodName = prod?.name || `Sản phẩm (${rev.product_id})`;
                  const prodThumb = prod?.thumbnail || prod?.images?.[0] || "/images/products/pounch_1.png";

                  return (
                    <div key={rev.review_id} className="p-5 hover:bg-[#FFFDF9] transition-colors space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        {/* Author info */}
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-[#BFE9C3] text-[#16381D] font-bold text-sm flex items-center justify-center shrink-0">
                            {rev.author_name.slice(0, 1).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-sm text-[#231B16]">{rev.author_name}</span>
                              <span className="text-xs text-[#7E7068] font-mono">
                                ({rev.phone_masked || "***"})
                              </span>
                              {rev.is_verified_buyer && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[10px] font-bold border border-emerald-200">
                                  <CheckCircle className="w-3 h-3" />
                                  <span>Đã mua hàng</span>
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <div className="flex items-center gap-0.5">
                                {[1, 2, 3, 4, 5].map((s) => (
                                  <Star
                                    key={s}
                                    className={`w-3.5 h-3.5 ${
                                      s <= rev.rating ? "fill-amber-400 text-amber-400" : "text-gray-200"
                                    }`}
                                  />
                                ))}
                              </div>
                              <span className="text-[11px] text-[#A89B92]">
                                {new Date(rev.created_at).toLocaleDateString("vi-VN")}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Associated Product Pill */}
                        <div className="flex items-center gap-2 self-start sm:self-auto">
                          {prod && (
                            <Link
                              href={`/products/${prod.slug}`}
                              target="_blank"
                              className="inline-flex items-center gap-2 p-1.5 pr-3 rounded-full bg-gray-50 hover:bg-[#FFF4E5] border border-gray-200 text-xs transition-colors"
                              title="Xem sản phẩm ngoài web"
                            >
                              <div className="relative w-6 h-6 rounded-full overflow-hidden shrink-0 border border-gray-200 bg-white">
                                <Image src={prodThumb} alt="" fill className="object-cover" unoptimized />
                              </div>
                              <span className="font-bold text-[#342A24] truncate max-w-[160px]">
                                {prodName}
                              </span>
                              <ExternalLink className="w-3 h-3 text-gray-400 shrink-0" />
                            </Link>
                          )}

                          <button
                            type="button"
                            onClick={() => setReviewToDelete(rev)}
                            className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl transition-colors cursor-pointer text-xs font-bold flex items-center gap-1 border border-transparent hover:border-red-200"
                            title="Xóa bình luận này khỏi hệ thống"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Xóa</span>
                          </button>
                        </div>
                      </div>

                      {/* Comment text */}
                      <p className="text-xs sm:text-sm text-[#342A24] leading-relaxed text-left text-pretty bg-[#FFFDF9] p-3 rounded-2xl border border-[#F0E5D8]/60">
                        {rev.comment}
                      </p>

                      {/* Attached photos */}
                      {rev.images && rev.images.length > 0 && (
                        <div className="flex items-center gap-2 pt-1">
                          {rev.images.map((imgUrl, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setZoomedImage(imgUrl)}
                              className="relative w-16 h-16 rounded-xl overflow-hidden border border-gray-200 bg-white shadow-2xs hover:scale-105 transition-transform cursor-pointer"
                              title="Bấm để xem ảnh phóng to"
                            >
                              <Image src={imgUrl} alt="Review attachment" fill className="object-cover" unoptimized />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Review Confirmation Modal */}
      {reviewToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-red-200 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <div className="w-10 h-10 rounded-2xl bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-heading font-extrabold text-base text-[#231B16]">
                  Xác nhận xóa bình luận?
                </h3>
                <span className="text-xs text-[#7E7068]">Hành động này sẽ gỡ bỏ bình luận ngay lập tức</span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-200 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#342A24]">{reviewToDelete.author_name}</span>
                <span className="text-amber-500 font-bold">{reviewToDelete.rating} ★</span>
              </div>
              <p className="text-gray-600 italic line-clamp-3">&quot;{reviewToDelete.comment}&quot;</p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setReviewToDelete(null)}
                className="px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteReview}
                className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors cursor-pointer shadow-xs"
              >
                Xác nhận xóa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Contact Message Confirmation Modal */}
      {messageToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-2.5 rounded-2xl bg-red-100">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-heading font-extrabold text-base text-[#231B16]">
                  Xác nhận xóa lời nhắn?
                </h3>
                <span className="text-xs text-[#7E7068]">Hành động này sẽ gỡ bỏ tin nhắn này khỏi hệ thống</span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-200 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#342A24]">{messageToDelete.name}</span>
                <span className="text-gray-500 font-mono text-[11px]">{messageToDelete.email}</span>
              </div>
              <p className="text-gray-600 italic line-clamp-3">&quot;{messageToDelete.message}&quot;</p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setMessageToDelete(null)}
                className="px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteMessage}
                className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors cursor-pointer shadow-xs"
              >
                Xác nhận xóa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Zoom Image Modal */}
      {zoomedImage && (
        <div
          onClick={() => setZoomedImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm cursor-pointer"
        >
          <div className="relative max-w-2xl max-h-[85vh] w-full h-[70vh] rounded-3xl overflow-hidden bg-black p-2">
            <button
              onClick={() => setZoomedImage(null)}
              className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/40 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <Image src={zoomedImage} alt="Phóng to" fill className="object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}
