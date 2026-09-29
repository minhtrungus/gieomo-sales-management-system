import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Thanh toán",
  description: "Thanh toán đơn hàng gây quỹ Mầm Mơ an toàn, nhanh chóng qua chuyển khoản VietQR.",
  openGraph: {
    title: "Gieo Mơ | Thanh toán",
    description: "Thanh toán đơn hàng gây quỹ Mầm Mơ an toàn, nhanh chóng qua chuyển khoản VietQR.",
  },
};

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
