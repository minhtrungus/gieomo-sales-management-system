import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Câu Hỏi Thường Gặp (FAQ) & Hướng Dẫn Mua Hàng Gây Quỹ",
  description:
    "Giải đáp các thắc mắc phổ biến về dự án gây quỹ Gieo Mơ, chất lượng sản phẩm may vá thủ công, quy trình giao nhận và các câu hỏi về Mầm Mơ.",
  alternates: {
    canonical: "/faq",
  },
  openGraph: {
    title: "Câu Hỏi Thường Gặp (FAQ) & Hướng Dẫn Mua Hàng Gây Quỹ | Gieo Mơ",
    description:
      "Giải đáp các thắc mắc phổ biến về dự án gây quỹ Gieo Mơ, chất lượng sản phẩm may vá thủ công, quy trình giao nhận và các câu hỏi về Mầm Mơ.",
  },
};

export default function FAQLayout({ children }: { children: React.ReactNode }) {
  return children;
}
