import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Gieo Mơ",
  description:
    "Khám phá các sản phẩm may vá độc đáo: túi pouch, kẹp tóc... Lợi nhuận gây quỹ cho dự án Mầm Mơ.",
  alternates: {
    canonical: "/products",
  },
  openGraph: {
    title: "Gieo Mơ",
    description:
      "Khám phá các sản phẩm may vá độc đáo: túi pouch, kẹp tóc... Lợi nhuận gây quỹ cho dự án Mầm Mơ.",
  },
};

export default function ProductsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
