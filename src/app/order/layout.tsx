import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Đơn hàng",
  description: "Thông tin và trạng thái đơn hàng gây quỹ Gieo Mơ.",
  openGraph: {
    title: "Gieo Mơ | Đơn hàng",
    description: "Thông tin và trạng thái đơn hàng gây quỹ Gieo Mơ.",
  },
};

export default function OrderLayout({ children }: { children: React.ReactNode }) {
  return children;
}
