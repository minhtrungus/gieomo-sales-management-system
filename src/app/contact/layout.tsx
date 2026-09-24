import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Liên hệ & Hỗ trợ khách hàng | Gieo Mơ",
  description:
    "Liên hệ với đội ngũ dự án Gieo Mơ — Mầm Mơ. Chúng tôi luôn sẵn sàng lắng nghe, giải đáp thắc mắc đơn hàng và tiếp nhận hợp tác thiện nguyện.",
  alternates: {
    canonical: "/contact",
  },
  openGraph: {
    title: "Liên hệ & Hỗ trợ khách hàng | Gieo Mơ",
    description:
      "Liên hệ với đội ngũ dự án Gieo Mơ — Mầm Mơ. Chúng tôi luôn sẵn sàng lắng nghe, giải đáp thắc mắc đơn hàng và tiếp nhận hợp tác thiện nguyện.",
  },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
