import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProductBySlugServer, getProductsServer } from "@/lib/services/productService";
import { getSiteUrl } from "@/lib/constants";
import { ProductDetailClient } from "./ProductDetailClient";
import { MOCK_PRODUCTS } from "@/lib/data/mockData";

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Build an optimized SEO meta description (140-160 characters)
 */
function buildMetaDescription(productName: string, price: number, rawDesc?: string | null): string {
  const formattedPrice = new Intl.NumberFormat("vi-VN").format(price) + "đ";
  const cleanSnippet = (rawDesc || "Sản phẩm may thủ công gây quỹ")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Template targeting ~140-160 characters
  let desc = `${productName} thủ công tại Gieo Mơ. Giá chỉ ${formattedPrice}. ${cleanSnippet} Mua ngay để ủng hộ quỹ Mầm Mơ!`;
  
  if (desc.length > 160) {
    desc = desc.slice(0, 157) + "...";
  } else if (desc.length < 130) {
    // Pad slightly if too short
    desc = `${productName} chính hãng từ Mầm Mơ. Giá chỉ ${formattedPrice}. ${cleanSnippet}. 100% lợi nhuận gây quỹ vì cộng đồng!`;
    if (desc.length > 160) {
      desc = desc.slice(0, 157) + "...";
    }
  }

  return desc;
}

/**
 * Generate dynamic SEO metadata for each individual product
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlugServer(slug);

  if (!product) {
    return {
      title: "Sản phẩm không tồn tại | Gieo Mơ",
      description: "Không tìm thấy sản phẩm bạn yêu cầu trên cửa hàng gây quỹ Gieo Mơ.",
    };
  }

  const siteUrl = getSiteUrl();
  const canonicalUrl = `${siteUrl}/products/${product.slug}`;

  // 1. Title: Under 60 characters
  let title = `${product.name} | Gieo Mơ`;
  if (title.length > 60) {
    title = `${product.name.slice(0, 48)}... | Gieo Mơ`;
  }

  // 2. Meta description: 140 - 160 characters
  const description = buildMetaDescription(
    product.name,
    product.price,
    product.short_description || product.description
  );

  // 3. Open Graph image (ensure absolute URL)
  let rawImage = product.thumbnail || product.images?.[0] || "/images/products/pounch_1.png";
  const ogImageUrl = rawImage.startsWith("http")
    ? rawImage
    : `${siteUrl}${rawImage.startsWith("/") ? "" : "/"}${rawImage}`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: "Gieo Mơ",
      locale: "vi_VN",
      type: "website",
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: product.name,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const product = await getProductBySlugServer(slug);

  if (!product) {
    notFound();
  }

  const allProducts = await getProductsServer(false);
  const relatedProducts = (allProducts.length > 0 ? allProducts : MOCK_PRODUCTS)
    .filter((p) => p.status === "active" && p.product_id !== product.product_id)
    .slice(0, 3);

  return (
    <ProductDetailClient
      initialProduct={product}
      initialRelatedProducts={relatedProducts}
    />
  );
}
