import type { Metadata } from "next";
import Script from "next/script";
import { Montserrat } from "next/font/google";
import { getSiteUrl } from "@/lib/constants";
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
    default: "Gieo Mơ — Mỗi món hàng, một điều tốt đẹp",
    template: "%s | Gieo Mơ",
  },
  description:
    "Gieo Mơ là cửa hàng gây quỹ của Mầm Mơ. Mỗi sản phẩm bạn mua là một mảnh ghép nhỏ góp phần tạo nên giấc mơ lớn cho cộng đồng.",
  keywords: ["Gieo Mơ", "Mầm Mơ", "gây quỹ", "handmade", "may vá", "từ thiện"],
  openGraph: {
    title: "Gieo Mơ — Little Pieces, Bigger Dreams",
    description:
      "Cửa hàng gây quỹ của Mầm Mơ. Những mảnh ghép nhỏ, một giấc mơ lớn.",
    type: "website",
    locale: "vi_VN",
    siteName: "Gieo Mơ",
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon.png", sizes: "32x32", type: "image/png" },
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
