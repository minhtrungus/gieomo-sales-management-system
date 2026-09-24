import type { Metadata } from "next";
import Script from "next/script";
import { Montserrat } from "next/font/google";
import { getSiteUrl } from "@/lib/constants";
import { OrganizationJsonLd } from "@/components/seo/OrganizationJsonLd";
import "./globals.css";

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_ID || "G-P3MJB88K1K";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin", "vietnamese"],
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
});

// Note: Boldonse will be loaded via CSS @font-face when font file is provided.
// For now we use Montserrat as primary and will add Boldonse for display text later.

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: "Gieo Mơ — Tạp hoá Gây quỹ của Mầm Mơ | Sản phẩm Handmade",
    template: "%s | Gieo Mơ",
  },
  description:
    "Gieo Mơ là tạp hoá gây quỹ của Mầm Mơ. Cung cấp các sản phẩm may vá handmade độc bản, dễ thương. Mỗi sản phẩm rước về là một điều ước được gieo cho các em nhỏ khó khăn.",
  keywords: [
    "Gieo Mơ",
    "gieo mo",
    "Mầm Mơ",
    "mam mo",
    "Tổ chức thiện nguyện Mầm Mơ",
    "Chiến dịch Mầm Mơ",
    "Tạp hoá Gây quỹ Mầm Mơ",
    "Bán hàng gây quỹ",
    "gây quỹ Mầm Mơ",
    "đồ handmade gây quỹ",
    "thiện nguyện",
    "tình nguyện",
    "cộng đồng",
    "Sản phẩm Handmade",
    "may vá thủ công",
    "túi pouch",
    "túi handmade",
    "kẹp tóc handmade",
    "phụ kiện handmade",
    "quà tặng",
    "quà lưu niệm",
    "set quà tặng ý nghĩa",
    "Little Pieces Bigger Dreams",
  ],
  openGraph: {
    title: "Gieo Mơ — Tạp hoá Gây quỹ của Mầm Mơ | Sản phẩm Handmade",
    description:
      "Tạp hoá gây quỹ của Mầm Mơ. Những sản phẩm handmade nhỏ xinh mang theo ước mơ lớn cho trẻ em khó khăn.",
    type: "website",
    locale: "vi_VN",
    siteName: "Gieo Mơ",
    url: "https://www.gieomo.store",
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [
      { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className={`${montserrat.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col antialiased" suppressHydrationWarning>
        <OrganizationJsonLd />
        {children}
        {GA_MEASUREMENT_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_MEASUREMENT_ID}', {
                  page_path: window.location.pathname,
                });
              `}
            </Script>
          </>
        )}
      </body>
    </html>
  );
}
