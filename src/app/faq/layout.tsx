import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Câu hỏi thường gặp (FAQ) | Gieo Mơ",
  description:
    "Giải đáp các thắc mắc phổ biến về dự án gây quỹ Gieo Mơ, chất lượng sản phẩm thủ công, quy trình giao nhận và các câu hỏi về Mầm Mơ.",
  alternates: {
    canonical: "/faq",
  },
  openGraph: {
    title: "Câu hỏi thường gặp (FAQ) | Gieo Mơ",
    description:
      "Giải đáp các thắc mắc phổ biến về dự án gây quỹ Gieo Mơ, chất lượng sản phẩm thủ công, quy trình giao nhận và các câu hỏi về Mầm Mơ.",
  },
};

export default function FAQLayout({ children }: { children: React.ReactNode }) {
  return children;
}
