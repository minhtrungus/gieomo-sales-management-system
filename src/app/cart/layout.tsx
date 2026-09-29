import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Giỏ hàng",
  description: "Xem lại giỏ hàng và danh sách sản phẩm quà tặng may vá gây quỹ tại Gieo Mơ.",
  openGraph: {
    title: "Gieo Mơ | Giỏ hàng",
    description: "Xem lại giỏ hàng và danh sách sản phẩm quà tặng may vá gây quỹ tại Gieo Mơ.",
  },
};

export default function CartLayout({ children }: { children: React.ReactNode }) {
  return children;
}
