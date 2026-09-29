import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Gieo Mơ | Combo Gieo Mơ| ",
  description:
    "Các set quà tặng và combo sản phẩm may vá Gieo Mơ với mức giá ưu đãi đặc biệt. Món quà trọn vẹn yêu thương đồng hành cùng quỹ Mầm Mơ.",
  alternates: {
    canonical: "/combos",
  },
  openGraph: {
    title: "Gieo Mơ | Combo Gieo Mơ",
    description:
      "Các set quà tặng và combo sản phẩm may vá Gieo Mơ với mức giá ưu đãi đặc biệt. Món quà trọn vẹn yêu thương đồng hành cùng quỹ Mầm Mơ.",
  },
};

export default function CombosLayout({ children }: { children: React.ReactNode }) {
  return children;
}
