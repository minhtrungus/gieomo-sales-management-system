import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tra cứu đơn hàng trực tuyến | Gieo Mơ",
  description:
    "Kiểm tra tình trạng đơn hàng, lộ trình vận chuyển và thông tin thanh toán đơn hàng Gieo Mơ nhanh chóng qua mã đơn hoặc số điện thoại.",
  alternates: {
    canonical: "/track",
  },
  openGraph: {
    title: "Tra cứu đơn hàng trực tuyến | Gieo Mơ",
    description:
      "Kiểm tra tình trạng đơn hàng, lộ trình vận chuyển và thông tin thanh toán đơn hàng Gieo Mơ nhanh chóng qua mã đơn hoặc số điện thoại.",
  },
};

export default function TrackLayout({ children }: { children: React.ReactNode }) {
  return children;
}
