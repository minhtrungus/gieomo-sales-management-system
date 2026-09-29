"use client";

import { useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

function ReferralTrackerInner() {
  const searchParams = useSearchParams();

  useEffect(() => {
    // Hỗ trợ các định dạng tham số phổ biến: ref, refby, referrer, gioithieu
    const ref =
      searchParams.get("ref") ||
      searchParams.get("refby") ||
      searchParams.get("referrer") ||
      searchParams.get("gioithieu");

    if (ref && typeof window !== "undefined") {
      const cleanRef = ref.trim().toUpperCase();

      // 1. Lưu vào localStorage để tồn tại lâu dài kể cả khi chuyển trang hoặc tắt mở lại
      localStorage.setItem("gieomo_referral_code", cleanRef);
      localStorage.setItem("gieomo_referral_tracked_at", new Date().toISOString());

      // 2. Lưu vào cookie 30 ngày (SameSite=Lax) để sẵn sàng cho cả SSR/Client
      const maxAge = 30 * 24 * 60 * 60; // 30 ngày
      document.cookie = `gieomo_referral_code=${encodeURIComponent(
        cleanRef
      )}; path=/; max-age=${maxAge}; SameSite=Lax`;

      // 3. Bắn event thông báo nếu các component khác cần phản hồi tức thì
      window.dispatchEvent(
        new CustomEvent("gieomo_referral_detected", { detail: cleanRef })
      );
    }
  }, [searchParams]);

  return null;
}

export function ReferralTracker() {
  return (
    <Suspense fallback={null}>
      <ReferralTrackerInner />
    </Suspense>
  );
}
