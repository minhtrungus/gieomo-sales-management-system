import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Câu hỏi thường gặp",
  description:
    "Giải đáp các thắc mắc phổ biến về dự án gây quỹ Gieo Mơ, chất lượng sản phẩm may vá thủ công, quy trình giao nhận và các câu hỏi về Mầm Mơ.",
  alternates: {
    canonical: "/faq",
  },
  openGraph: {
    title: "Gieo Mơ | Câu hỏi thường gặp",
    description:
      "Giải đáp các thắc mắc phổ biến về dự án gây quỹ Gieo Mơ, chất lượng sản phẩm may vá thủ công, quy trình giao nhận và các câu hỏi về Mầm Mơ.",
  },
};

export default function FAQLayout({ children }: { children: React.ReactNode }) {
  return children;
}
