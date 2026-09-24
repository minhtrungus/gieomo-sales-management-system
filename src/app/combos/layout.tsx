import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Combo tiết kiệm & Quà tặng ý nghĩa | Gieo Mơ",
  description:
    "Các set quà tặng và combo sản phẩm may vá thủ công Gieo Mơ với mức giá ưu đãi đặc biệt. Món quà trọn vẹn yêu thương đồng hành cùng quỹ Mầm Mơ.",
  alternates: {
    canonical: "/combos",
  },
  openGraph: {
    title: "Combo tiết kiệm & Quà tặng ý nghĩa | Gieo Mơ",
    description:
      "Các set quà tặng và combo sản phẩm may vá thủ công Gieo Mơ với mức giá ưu đãi đặc biệt. Món quà trọn vẹn yêu thương đồng hành cùng quỹ Mầm Mơ.",
  },
};

export default function CombosLayout({ children }: { children: React.ReactNode }) {
  return children;
}
