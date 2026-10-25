export const LOCAL_ASSET_UNAVAILABLE = "/images/product-image-unavailable.svg";

export type RuntimeAssetStatus = "source" | "fallback_only" | "missing";

export type RuntimeAssetResolution = {
  url: string | null;
  status: RuntimeAssetStatus;
  reason: "preserved_source" | "remote_blocked_on_loopback" | "missing_source" | "invalid_source";
};

export type RuntimeImageSet = {
  thumbnail: string;
  images: string[];
  status: RuntimeAssetStatus;
};

function usesLoopbackDataRuntime(): boolean {
  const endpoint = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!endpoint) return false;

  try {
    const hostname = new URL(endpoint).hostname;
    return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
  } catch {
    return false;
  }
}

/**
 * A restored database can legitimately retain remote Production asset URLs.
 * During loopback-only acceptance, keep the stored value untouched while
 * preventing the local runtime from fetching any remote asset endpoint.
 */
export function resolveRuntimeAsset(
  value: unknown,
  fallback = LOCAL_ASSET_UNAVAILABLE,
): RuntimeAssetResolution {
  if (typeof value !== "string" || value.trim() === "") {
    return { url: null, status: "missing", reason: "missing_source" };
  }
  const normalized = value.trim();

  if (normalized.startsWith("/") && !normalized.startsWith("//")) {
    return { url: normalized, status: "source", reason: "preserved_source" };
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return { url: null, status: "missing", reason: "invalid_source" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { url: null, status: "missing", reason: "invalid_source" };
  }

  if (!usesLoopbackDataRuntime()) {
    return { url: normalized, status: "source", reason: "preserved_source" };
  }

  return {
    url: fallback,
    status: "fallback_only",
    reason: "remote_blocked_on_loopback",
  };
}

export function resolveRuntimeAssetUrl(
  value: unknown,
  fallback = LOCAL_ASSET_UNAVAILABLE,
): string | null {
  return resolveRuntimeAsset(value, fallback).url;
}

export function resolveRuntimeImageSet(rawMedia: unknown, thumbnail: unknown): RuntimeImageSet {
  type MediaImageInput = { url?: unknown; sort_order?: unknown };
  const mediaRows: MediaImageInput[] = (Array.isArray(rawMedia) ? rawMedia : [])
    .filter((media): media is MediaImageInput => Boolean(media) && typeof media === "object");
  const mediaAssets = mediaRows
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
    .map((media) => resolveRuntimeAsset(media.url));
  const thumbnailAsset = resolveRuntimeAsset(thumbnail);
  const mediaImages = mediaAssets
    .map((asset) => asset.url)
    .filter((url: string | null): url is string => Boolean(url));
  const images = [...new Set(mediaImages.length > 0
    ? mediaImages
    : [thumbnailAsset.url || LOCAL_ASSET_UNAVAILABLE])];
  const displayedAssets = mediaImages.length > 0 ? mediaAssets : [thumbnailAsset];
  const status: RuntimeAssetStatus = displayedAssets.some((asset) => asset.status === "source")
    ? "source"
    : displayedAssets.some((asset) => asset.status === "fallback_only")
      ? "fallback_only"
      : "missing";

  return {
    thumbnail: thumbnailAsset.url || images[0] || LOCAL_ASSET_UNAVAILABLE,
    images,
    status,
  };
}
