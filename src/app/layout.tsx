import type { Metadata } from "next";
import Script from "next/script";
import { Montserrat } from "next/font/google";
import { getSiteUrl } from "@/lib/constants";
import { OrganizationJsonLd } from "@/components/seo/OrganizationJsonLd";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ReferralTracker } from "@/components/common/ReferralTracker";
import { SEO_KEYWORD_LIST } from "@/lib/seo/keywords";
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
  alternates: {
    canonical: "./",
  },
  title: {
    default: "Gieo Mơ",
    template: "Gieo Mơ | %s",
  },
  description:
    "Tạp hoá Gieo Mơ — Dự án bán hàng gây quỹ của tổ chức thiện nguyện Mầm Mơ. Cung cấp các sản phẩm may vá handmade độc bản: túi pouch, ví sen đá, kẹp tóc, set combo quà tặng ý nghĩa. 100% lợi nhuận đồng hành cùng trẻ em khó khăn.",
  keywords: SEO_KEYWORD_LIST,
  authors: [{ name: "Tổ chức thiện nguyện Mầm Mơ", url: "https://gieomo.store" }],
  creator: "Mầm Mơ",
  publisher: "Gieo Mơ",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    title: "Gieo Mơ",
    description:
      "Tạp hoá gây quỹ của Mầm Mơ. Cung cấp các sản phẩm handmade may vá độc bản. Mỗi sản phẩm trao đi là một điều ước được gieo cho các em nhỏ khó khăn.",
    type: "website",
    locale: "vi_VN",
    siteName: "Gieo Mơ",
    url: "https://gieomo.store",
    images: [
      {
        url: "/images/logo_gieo%20m%C6%A1.jpg",
        width: 1200,
        height: 630,
        alt: "Gieo Mơ — Tạp Hoá Gây Quỹ Mầm Mơ",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Gieo Mơ | Trang chủ",
    description: "Tạp hoá gây quỹ thiện nguyện của Mầm Mơ — Little Pieces, Bigger Dreams.",
    images: ["/images/logo_gieo%20m%C6%A1.jpg"],
  },
  robots: {
    index: true,
    follow: true,
  },
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [
      { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className={`${montserrat.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col antialiased" suppressHydrationWarning>
        <OrganizationJsonLd />
        <ReferralTracker />
        <ThemeProvider>{children}</ThemeProvider>
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
