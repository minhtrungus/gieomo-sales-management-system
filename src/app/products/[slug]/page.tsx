import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProductBySlugServer, getProductsServer } from "@/lib/services/productService";
import { getSiteUrl } from "@/lib/constants";
import { ProductDetailClient } from "./ProductDetailClient";

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Build an optimized SEO meta description (140-160 characters)
 */
function buildMetaDescription(productName: string, price: number, rawDesc?: string | null): string {
  const formattedPrice = new Intl.NumberFormat("vi-VN").format(price) + "đ";
  const cleanSnippet = (rawDesc || "Sản phẩm Gieo Mơ")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Template targeting ~140-160 characters
  let desc = `${productName} tại Gieo Mơ. Giá chỉ ${formattedPrice}. ${cleanSnippet} Mua ngay để ủng hộ quỹ Mầm Mơ!`;
  
  if (desc.length > 160) {
    desc = desc.slice(0, 157) + "...";
  } else if (desc.length < 130) {
    // Pad slightly if too short
    desc = `${productName} từ Mầm Mơ. Giá chỉ ${formattedPrice}. ${cleanSnippet}. Lợi nhuận gây quỹ vì cộng đồng!`;
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
    const formattedTitle = slug
      ? decodeURIComponent(slug)
          .replace(/[-_]+/g, " ")
          .trim()
          .replace(/\b\w/g, (c) => c.toUpperCase())
      : "Chi tiết sản phẩm";

    return {
      title: formattedTitle,
      description: "Xem chi tiết sản phẩm thủ công gây quỹ và đồng hành cùng dự án Gieo Mơ.",
      openGraph: {
        title: `Gieo Mơ | ${formattedTitle}`,
        description: "Xem chi tiết sản phẩm thủ công gây quỹ và đồng hành cùng dự án Gieo Mơ.",
      },
    };
  }

  const siteUrl = getSiteUrl();
  const canonicalUrl = `${siteUrl}/products/${product.slug}`;

  // 1. Clean product name under 50 characters
  let cleanName = product.name;
  if (cleanName.length > 50) {
    cleanName = `${cleanName.slice(0, 47)}...`;
  }
  const displayTitle = `Gieo Mơ | ${cleanName}`;

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
    title: cleanName,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: displayTitle,
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
      title: displayTitle,
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const decodedSlug = decodeURIComponent(slug);

  // Single roundtrip to fetch all active products
  const allProducts = await getProductsServer(false);
  let product = allProducts.find(
    (p) =>
      p.slug === slug ||
      p.slug === decodedSlug ||
      p.product_id === slug ||
      p.product_id === decodedSlug
  );

  // Fallback if product is a draft or unlisted
  if (!product) {
    product = (await getProductBySlugServer(slug)) ?? undefined;
  }

  const relatedProducts = allProducts
    .filter((p) => p.status === "active" && (!product || p.product_id !== product.product_id))
    .slice(0, 3);

  return (
    <ProductDetailClient
      slug={slug}
      initialProduct={product}
      initialRelatedProducts={relatedProducts}
    />
  );
}
