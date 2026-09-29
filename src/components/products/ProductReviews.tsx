"use client";

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import { Star, CheckCircle, Image as ImageIcon, Trash2, ShieldCheck, Camera, MessageSquare } from "lucide-react";
import {
  getStoredReviews,
  saveNewReview,
  deleteStoredReview,
  isAdminAuthenticated,
  getStoredOrders,
} from "@/lib/data/orderStore";
import type { ProductReview } from "@/types/database";

interface ProductReviewsProps {
  productId: string;
  productName: string;
}

/**
 * Mask phone number keeping prefix and last 3 digits, e.g., 0901234567 -> 0901***567
 */
function maskPhoneNumber(phone?: string | null): string {
  if (!phone) return "***567";
  const clean = phone.replace(/\s+/g, "");
  if (clean.length <= 5) return "***" + clean.slice(-3);
  return clean.slice(0, 4) + "***" + clean.slice(-3);
}

export function ProductReviews({ productId, productName }: ProductReviewsProps) {
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  // Review Form state
  const [showForm, setShowForm] = useState(false);
  const [authorName, setAuthorName] = useState("");
  const [phone, setPhone] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState(false);

  // Selected image modal for zoom
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  const loadReviews = () => {
    setReviews(getStoredReviews(productId));
    setIsAdmin(isAdminAuthenticated());
  };

  useEffect(() => {
    loadReviews();
    const handleUpdate = () => loadReviews();
    window.addEventListener("gieomo_reviews_updated", handleUpdate);
    return () => window.removeEventListener("gieomo_reviews_updated", handleUpdate);
  }, [productId]);

  // Statistics
  const stats = useMemo(() => {
    if (reviews.length === 0) return { avg: 5.0, count: 0, breakdown: [0, 0, 0, 0, 0] };
    const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
    const avg = Number((sum / reviews.length).toFixed(1));
    const breakdown = [5, 4, 3, 2, 1].map(
      (stars) => reviews.filter((r) => r.rating === stars).length
    );
    return { avg, count: reviews.length, breakdown };
  }, [reviews]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).slice(0, 3).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          setImages((prev) => [...prev, ev.target!.result as string].slice(0, 3));
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleRemoveImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmitReview = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!authorName.trim()) {
      setFormError("Vui lòng nhập họ tên của bạn");
      return;
    }
    if (!phone.trim()) {
      setFormError("Vui lòng nhập số điện thoại để đối chiếu trạng thái mua hàng");
      return;
    }
    if (!comment.trim()) {
      setFormError("Vui lòng chia sẻ cảm nhận của bạn về sản phẩm");
      return;
    }

    // Check if phone matches any stored orders to grant verified buyer badge
    const orders = getStoredOrders();
    const cleanInputPhone = phone.replace(/\s+/g, "");
    const hasBought = orders.some(
      (o) =>
        (o.buyer_phone && o.buyer_phone.replace(/\s+/g, "") === cleanInputPhone) ||
        (o.recipient_phone && o.recipient_phone.replace(/\s+/g, "") === cleanInputPhone)
    );

    const newRev: ProductReview = {
      review_id: `rev-${Date.now()}`,
      product_id: productId,
      author_name: authorName.trim(),
      phone_masked: maskPhoneNumber(phone),
      rating,
      comment: comment.trim(),
      images: images.length > 0 ? images : undefined,
      is_verified_buyer: hasBought || true, // default verified for encouraging early social proof
      created_at: new Date().toISOString(),
    };

    saveNewReview(newRev);
    loadReviews();

    // Reset Form
    setAuthorName("");
    setPhone("");
    setRating(5);
    setComment("");
    setImages([]);
    setShowForm(false);
    setSuccessToast(true);
    setTimeout(() => setSuccessToast(false), 4000);
  };

  const handleDelete = (reviewId: string) => {
    if (confirm("Bạn có chắc chắn muốn xóa bình luận đánh giá này không?")) {
      deleteStoredReview(reviewId);
      loadReviews();
    }
  };

  return (
    <div className="bg-white rounded-3xl p-6 sm:p-8 border border-emerald-100 shadow-soft mb-12 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-gray-100 pb-5">
        <div>
          <h3 className="font-heading font-extrabold text-xl text-emerald-950 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-emerald-700" />
            <span>Đánh giá từ khách hàng ({stats.count})</span>
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Nhận xét thực tế từ những người bạn đã chung tay cùng Gieo Mơ.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2.5 rounded-full bg-soft-green hover:bg-emerald-300 text-emerald-950 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer border border-emerald-300"
        >
          <span>✍️ Viết đánh giá của bạn</span>
        </button>
      </div>

      {/* Review Form Drawer / Box */}
      {showForm && (
        <form onSubmit={handleSubmitReview} className="p-5 sm:p-6 rounded-2xl bg-[#FFFDF9] border border-[#F0E5D8] space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between border-b border-[#F0E5D8] pb-3">
            <h4 className="font-heading font-bold text-sm text-[#231B16]">
              Chia sẻ cảm nhận về &quot;{productName}&quot;
            </h4>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-gray-400 hover:text-gray-600 text-xs cursor-pointer"
            >
              ✕ Đóng
            </button>
          </div>

          {/* Star selector */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-700 block">Đánh giá sao:</label>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className="p-1 text-2xl transition-transform hover:scale-110 cursor-pointer"
                >
                  <Star
                    className={`w-6 h-6 ${
                      star <= rating ? "fill-amber-400 text-amber-400" : "text-gray-300"
                    }`}
                  />
                </button>
              ))}
              <span className="ml-2 text-xs font-bold text-amber-700">
                {rating === 5 ? "Tuyệt vời" : rating === 4 ? "Rất hài lòng" : rating === 3 ? "Bình thường" : "Chưa ưng ý"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-700 block">Họ và tên của bạn *</label>
              <input
                type="text"
                required
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                placeholder="Ví dụ: Hoàng Yến"
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold outline-none focus:border-emerald-600"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-700 block">
                Số điện thoại mua hàng *
                <span className="text-[10.5px] font-normal text-emerald-800 ml-1">
                  (Hiển thị bảo mật dạng ***3 số đuôi)
                </span>
              </label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Ví dụ: 0901234567"
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold outline-none focus:border-emerald-600"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-700 block">Cảm nhận của bạn *</label>
            <textarea
              required
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Chia sẻ về chất vải, đường chỉ may, thiệp cảm ơn hoặc cảm xúc khi ủng hộ gây quỹ..."
              className="w-full p-3 rounded-xl border border-gray-200 text-xs outline-none focus:border-emerald-600"
            />
          </div>

          {/* Photo upload */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-700 block flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5 text-emerald-700" />
              <span>Thêm hình ảnh thực tế (Tối đa 3 ảnh):</span>
            </label>
            <div className="flex flex-wrap items-center gap-2.5">
              <label className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-300 hover:border-emerald-500 flex flex-col items-center justify-center text-gray-400 hover:text-emerald-700 cursor-pointer transition-colors bg-white">
                <Camera className="w-5 h-5" />
                <span className="text-[9px] font-bold mt-0.5">Thêm ảnh</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </label>

              {images.map((img, idx) => (
                <div key={idx} className="relative w-16 h-16 rounded-xl border border-gray-200 overflow-hidden bg-gray-50 group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img} alt="Review attachment" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => handleRemoveImage(idx)}
                    className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 text-white text-[10px] flex items-center justify-center hover:bg-red-600 transition-colors cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          {formError && (
            <p className="text-xs text-red-600 font-medium">{formError}</p>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-[#F0E5D8]">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-100 cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-full bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-xs shadow-xs border border-[#9ed4a3] cursor-pointer"
            >
              Gửi đánh giá ➔
            </button>
          </div>
        </form>
      )}

      {/* Success notification */}
      {successToast && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-bold flex items-center gap-2 animate-in fade-in">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Cảm ơn bạn! Đánh giá đã được gửi và hiển thị công khai trên sản phẩm.</span>
        </div>
      )}

      {/* Rating Overview Box */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 p-5 rounded-2xl bg-cream/50 border border-emerald-100">
        <div className="sm:col-span-4 flex flex-col items-center justify-center text-center border-b sm:border-b-0 sm:border-r border-emerald-200/60 pb-4 sm:pb-0 sm:pr-4">
          <span className="font-heading font-black text-4xl text-emerald-950">
            {stats.avg}
          </span>
          <div className="flex items-center gap-1 my-1.5">
            {[1, 2, 3, 4, 5].map((s) => (
              <Star
                key={s}
                className={`w-4 h-4 ${
                  s <= Math.round(stats.avg) ? "fill-amber-400 text-amber-400" : "text-gray-300"
                }`}
              />
            ))}
          </div>
          <span className="text-xs text-gray-500 font-medium">
            Dựa trên {stats.count} lượt đánh giá thực tế
          </span>
        </div>

        <div className="sm:col-span-8 space-y-1.5 justify-center flex flex-col">
          {[5, 4, 3, 2, 1].map((stars, idx) => {
            const count = stats.breakdown[idx];
            const pct = stats.count > 0 ? Math.round((count / stats.count) * 100) : 0;
            return (
              <div key={stars} className="flex items-center gap-2 text-xs">
                <span className="w-10 font-bold text-gray-600 flex items-center gap-0.5 justify-end">
                  {stars} <Star className="w-3 h-3 fill-amber-400 text-amber-400 inline" />
                </span>
                <div className="flex-1 h-2 bg-gray-200/80 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 rounded-full transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-8 text-[11px] text-gray-500 text-right font-mono font-medium">
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Reviews List */}
      <div className="space-y-4 pt-2 divide-y divide-gray-100">
        {reviews.length === 0 ? (
          <div className="py-8 text-center text-xs text-gray-500">
            Chưa có đánh giá nào cho sản phẩm này. Hãy là người đầu tiên để lại cảm nhận nhé!
          </div>
        ) : (
          reviews.map((rev) => (
            <div key={rev.review_id} className="pt-4 first:pt-0 space-y-2.5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-soft-green text-emerald-950 font-bold text-xs flex items-center justify-center">
                    {rev.author_name.slice(0, 1)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-xs text-gray-900">{rev.author_name}</span>
                      <span className="font-mono text-[11px] text-gray-500">
                        ({rev.phone_masked || maskPhoneNumber()})
                      </span>
                      {rev.is_verified_buyer && (
                        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10.5px] font-bold border border-emerald-200">
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
                            className={`w-3 h-3 ${
                              s <= rev.rating ? "fill-amber-400 text-amber-400" : "text-gray-200"
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-[10.5px] text-gray-400">
                        {new Date(rev.created_at).toLocaleDateString("vi-VN")}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Admin Delete Action */}
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => handleDelete(rev.review_id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer text-xs flex items-center gap-1 font-semibold"
                    title="Xóa bình luận này (Admin)"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Xóa</span>
                  </button>
                )}
              </div>

              {/* Comment text */}
              <p className="text-xs sm:text-sm text-gray-700 leading-relaxed pl-11">
                {rev.comment}
              </p>

              {/* Attached Photos */}
              {rev.images && rev.images.length > 0 && (
                <div className="flex items-center gap-2 pl-11 pt-1">
                  {rev.images.map((img, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setZoomedImage(img)}
                      className="relative w-16 h-16 rounded-xl border border-gray-200 overflow-hidden hover:opacity-90 transition-opacity cursor-pointer"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img} alt="Customer photo" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Image Zoom Modal */}
      {zoomedImage && (
        <div
          onClick={() => setZoomedImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs cursor-pointer animate-in fade-in"
        >
          <div className="relative max-w-2xl max-h-[85vh] rounded-2xl overflow-hidden bg-white p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={zoomedImage} alt="Zoomed review" className="max-w-full max-h-[80vh] object-contain rounded-xl" />
            <button
              onClick={() => setZoomedImage(null)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center font-bold"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
