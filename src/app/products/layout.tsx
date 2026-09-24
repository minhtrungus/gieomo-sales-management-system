import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Danh mục sản phẩm thủ công gây quỹ | Gieo Mơ",
  description:
    "Khám phá các sản phẩm thủ công may vá độc đáo: túi pouch, kẹp tóc nơ, túi tote canvas, bộ kim chỉ mộc. 100% lợi nhuận ủng hộ quỹ trẻ em Mầm Mơ.",
  alternates: {
    canonical: "/products",
  },
  openGraph: {
    title: "Danh mục sản phẩm thủ công gây quỹ | Gieo Mơ",
    description:
      "Khám phá các sản phẩm thủ công may vá độc đáo: túi pouch, kẹp tóc nơ, túi tote canvas, bộ kim chỉ mộc. 100% lợi nhuận ủng hộ quỹ trẻ em Mầm Mơ.",
  },
};

export default function ProductsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
