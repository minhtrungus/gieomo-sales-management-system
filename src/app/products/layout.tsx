import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sản Phẩm May Vá Thủ Công Gây Quỹ",
  description:
    "Khám phá các sản phẩm may vá độc bản tại Gieo Mơ: túi pouch vải, ví sen đá, kẹp tóc và phụ kiện may vá thủ công. 100% lợi nhuận đồng hành cùng dự án thiện nguyện Mầm Mơ.",
  alternates: {
    canonical: "/products",
  },
  openGraph: {
    title: "Sản Phẩm May Vá Thủ Công Gây Quỹ | Gieo Mơ",
    description:
      "Khám phá các sản phẩm may vá độc bản tại Gieo Mơ: túi pouch vải, ví sen đá, kẹp tóc và phụ kiện may vá thủ công. 100% lợi nhuận đồng hành cùng dự án thiện nguyện Mầm Mơ.",
  },
};

export default function ProductsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
