import type { OrderStatus, PaymentStatus, DeliveryStatus } from "@/types/database";

export const DEFAULT_SITE_URL = "https://www.gieomo.store";

/**
 * Official store schema configuration and social media profiles (Mầm Mơ).
 */
export const OFFICIAL_STORE_CONFIG = {
  name: "Gieo Mơ",
  alternateName: "Tạp hoá Gây quỹ Mầm Mơ",
  url: "https://www.gieomo.store",
  logo: "https://www.gieomo.store/images/logo_gieo%20m%C6%A1.jpg",
  description:
    "Gieo Mơ là tạp hoá gây quỹ của Mầm Mơ với các sản phẩm may vá handmade độc bản. Mỗi sản phẩm bạn rước về là một điều ước được gieo cho các em nhỏ vùng cao.",
  socialLinks: {
    facebook:
      process.env.NEXT_PUBLIC_FACEBOOK_URL || "https://www.facebook.com/mammo.project",
    tiktok:
      process.env.NEXT_PUBLIC_TIKTOK_URL || "https://www.tiktok.com/@mammo.project",
    instagram:
      process.env.NEXT_PUBLIC_INSTAGRAM_URL || "https://www.instagram.com/mammo.project",
  },
} as const;

export const OFFICIAL_SAME_AS: string[] = [
  OFFICIAL_STORE_CONFIG.socialLinks.facebook,
  OFFICIAL_STORE_CONFIG.socialLinks.tiktok,
  OFFICIAL_STORE_CONFIG.socialLinks.instagram,
];

/**
 * Returns the canonical base URL of the site, preventing vercel.app domain leaks.
 */
export function getSiteUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (envUrl && !envUrl.includes("vercel.app")) {
    return envUrl.replace(/\/$/, "");
  }
  if (process.env.NODE_ENV === "development" && envUrl?.includes("localhost")) {
    return envUrl.replace(/\/$/, "");
  }
  return DEFAULT_SITE_URL;
}

/**
 * Customer-facing labels for order statuses (Vietnamese).
 */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Chờ xác nhận",
  confirmed: "Đã xác nhận",
  processing: "Đang chuẩn bị",
  ready_to_ship: "Sẵn sàng giao",
  shipping: "Đang giao",
  completed: "Hoàn thành",
  cancelled: "Đã hủy",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "Chờ thanh toán",
  paid: "Đã thanh toán",
  refunded: "Đã hoàn tiền",
  failed: "Thanh toán thất bại",
};

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  not_ready: "Chưa sẵn sàng",
  packed: "Đã đóng gói",
  handed_to_carrier: "Đã giao vận chuyển",
  in_transit: "Đang vận chuyển",
  out_for_delivery: "Đang giao hàng",
  delivered: "Đã giao",
  failed_delivery: "Giao không thành công",
  returned: "Đã hoàn hàng",
  ready_for_pickup: "Sẵn sàng nhận",
  picked_up: "Đã nhận hàng",
};

/**
 * Customer-facing timeline steps (simplified).
 */
export const CUSTOMER_TIMELINE_STEPS: { key: OrderStatus; label: string }[] = [
  { key: "pending", label: "Đã đặt hàng" },
  { key: "confirmed", label: "Đang xác nhận" },
  { key: "processing", label: "Đang chuẩn bị hàng" },
  { key: "shipping", label: "Đang giao" },
  { key: "completed", label: "Giao thành công" },
];

/**
 * Valid order status transitions.
 */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["ready_to_ship", "cancelled"],
  ready_to_ship: ["shipping"],
  shipping: ["completed"],
  completed: [],
  cancelled: [],
};

/**
 * Status colors for badges.
 */
export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  pending: "bg-warning-light text-yellow-800",
  confirmed: "bg-info-light text-blue-800",
  processing: "bg-info-light text-blue-800",
  ready_to_ship: "bg-soft-green/30 text-green-800",
  shipping: "bg-soft-green/50 text-green-800",
  completed: "bg-success-light text-green-800",
  cancelled: "bg-danger-light text-red-800",
};

export const PAYMENT_STATUS_COLORS: Record<PaymentStatus, string> = {
  pending: "bg-warning-light text-yellow-800",
  paid: "bg-success-light text-green-800",
  refunded: "bg-info-light text-blue-800",
  failed: "bg-danger-light text-red-800",
};

/**
 * Order source labels.
 */
export const ORDER_SOURCE_LABELS = {
  landing_page: "Landing page",
  member_referral: "Thành viên giới thiệu",
  social_media: "Fanpage MXH",
  admin_manual: "BTC nhập hộ",
  other: "Khác",
} as const;

/**
 * Delivery type labels.
 */
export const DELIVERY_TYPE_LABELS = {
  home_delivery: "Giao tận nơi",
  pickup_point: "Nhận tại điểm",
  self_pickup: "Tự đến lấy",
} as const;

/**
 * Payment method labels.
 */
export const PAYMENT_METHOD_LABELS = {
  cod: "Thanh toán khi nhận hàng",
  banking: "Chuyển khoản ngân hàng",
  momo: "Ví MoMo",
} as const;

/**
 * Product badge types.
 */
export const PRODUCT_BADGES = {
  new: { label: "Mới", color: "bg-soft-green text-green-800" },
  best_seller: { label: "Bán chạy", color: "bg-warm-orange text-orange-800" },
  limited: { label: "Giới hạn", color: "bg-soft-pink text-pink-800" },
  out_of_stock: { label: "Hết hàng", color: "bg-gray-200 text-gray-600" },
} as const;

/**
 * Site defaults.
 */
export const SITE_CONFIG = {
  name: "Gieo Mơ",
  tagline: "Little Pieces, Bigger Dreams",
  description: "Mỗi món hàng, một điều tốt đẹp",
  currency: "VND",
  currencySymbol: "đ",
  locale: "vi-VN",
  maxCartQuantity: 99,
  searchDebounceMs: 300,
} as const;
