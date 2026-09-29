import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Đặt hàng thành công",
  description: "Cảm ơn bạn đã đồng hành và ủng hộ dự án gây quỹ thiện nguyện Gieo Mơ — Mầm Mơ.",
  openGraph: {
    title: "Gieo Mơ | Đặt hàng thành công",
    description: "Cảm ơn bạn đã đồng hành và ủng hộ dự án gây quỹ thiện nguyện Gieo Mơ — Mầm Mơ.",
  },
};

export default function OrderSuccessLayout({ children }: { children: React.ReactNode }) {
  return children;
}
