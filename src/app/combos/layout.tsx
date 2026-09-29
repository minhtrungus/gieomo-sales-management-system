import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Combo quà tặng",
  description:
    "Các set quà tặng và combo sản phẩm may vá thủ công Gieo Mơ với mức giá ưu đãi đặc biệt. Món quà trọn vẹn yêu thương đồng hành cùng dự án thiện nguyện Mầm Mơ.",
  alternates: {
    canonical: "/combos",
  },
  openGraph: {
    title: "Gieo Mơ | Combo quà tặng",
    description:
      "Các set quà tặng và combo sản phẩm may vá thủ công Gieo Mơ với mức giá ưu đãi đặc biệt. Món quà trọn vẹn yêu thương đồng hành cùng dự án thiện nguyện Mầm Mơ.",
  },
};

export default function CombosLayout({ children }: { children: React.ReactNode }) {
  return children;
}
