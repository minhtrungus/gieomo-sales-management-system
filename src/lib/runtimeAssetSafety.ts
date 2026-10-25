export const LOCAL_ASSET_UNAVAILABLE = "/images/product-image-unavailable.svg";

export type RuntimeAssetStatus = "source" | "fallback_only" | "missing";

export type RuntimeAssetResolution = {
  url: string | null;
  status: RuntimeAssetStatus;
  reason: "preserved_source" | "remote_blocked_on_loopback" | "missing_source";
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

  if (!usesLoopbackDataRuntime()) {
    return { url: normalized, status: "source", reason: "preserved_source" };
  }

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return {
        url: fallback,
        status: "fallback_only",
        reason: "remote_blocked_on_loopback",
      };
    }
  } catch {
    // Relative application assets are expected and safe on the local origin.
  }

  return { url: normalized, status: "source", reason: "preserved_source" };
}

export function resolveRuntimeAssetUrl(
  value: unknown,
  fallback = LOCAL_ASSET_UNAVAILABLE,
): string | null {
  return resolveRuntimeAsset(value, fallback).url;
}
