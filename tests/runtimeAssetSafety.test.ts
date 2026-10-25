import assert from "node:assert/strict";
import test from "node:test";

import {
  LOCAL_ASSET_UNAVAILABLE,
  resolveRuntimeAsset,
  resolveRuntimeImageSet,
  resolveRuntimeAssetUrl,
} from "../src/lib/runtimeAssetSafety.ts";

test("loopback data runtime blocks remote asset fetches without altering relative assets", () => {
  const previous = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:55434";
  try {
    assert.equal(resolveRuntimeAssetUrl("https://example.invalid/image.webp"), LOCAL_ASSET_UNAVAILABLE);
    assert.equal(resolveRuntimeAssetUrl("/images/products/local.webp"), "/images/products/local.webp");
    assert.deepEqual(resolveRuntimeAsset("https://example.invalid/image.webp"), {
      url: LOCAL_ASSET_UNAVAILABLE,
      status: "fallback_only",
      reason: "remote_blocked_on_loopback",
    });
    assert.deepEqual(resolveRuntimeAsset(null), {
      url: null,
      status: "missing",
      reason: "missing_source",
    });
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previous;
  }
});

test("fallback cannot be mistaken for a verified source image", () => {
  const previous = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:55434";
  try {
    const first = resolveRuntimeAsset("https://storage.invalid/products/one.webp");
    const second = resolveRuntimeAsset("https://storage.invalid/products/two.webp");
    assert.equal(first.url, second.url);
    assert.equal(first.status, "fallback_only");
    assert.notEqual(first.status, "source");
    assert.equal(second.status, "fallback_only");
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previous;
  }
});

test("non-loopback runtime preserves configured remote asset URLs", () => {
  const previous = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
  try {
    assert.equal(resolveRuntimeAssetUrl("https://cdn.example.invalid/image.webp"), "https://cdn.example.invalid/image.webp");
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previous;
  }
});

test("missing, malformed, and unsafe asset values never become image requests", () => {
  const previous = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:55434";
  try {
    for (const value of [undefined, null, "", "   "]) {
      assert.deepEqual(resolveRuntimeAsset(value), {
        url: null,
        status: "missing",
        reason: "missing_source",
      });
    }
    for (const value of ["not a URL", "//external.invalid/image.webp", "javascript:alert(1)", "ftp://external.invalid/image.webp"]) {
      assert.deepEqual(resolveRuntimeAsset(value), {
        url: null,
        status: "missing",
        reason: "invalid_source",
      });
    }
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previous;
  }
});

test("gallery keeps verified ordering and deduplicates repeated loopback placeholders", () => {
  const previous = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:55434";
  try {
    const blocked = resolveRuntimeImageSet([
      { url: "https://storage.invalid/two.webp", sort_order: 2 },
      { url: "https://storage.invalid/one.webp", sort_order: 1 },
    ], "https://storage.invalid/thumb.webp");
    assert.deepEqual(blocked, {
      thumbnail: LOCAL_ASSET_UNAVAILABLE,
      images: [LOCAL_ASSET_UNAVAILABLE],
      status: "fallback_only",
    });

    const local = resolveRuntimeImageSet([
      { url: "/images/products/two.webp", sort_order: 2 },
      { url: "/images/products/one.webp", sort_order: 1 },
      { url: "/images/products/one.webp", sort_order: 3 },
    ], null);
    assert.deepEqual(local, {
      thumbnail: "/images/products/one.webp",
      images: ["/images/products/one.webp", "/images/products/two.webp"],
      status: "source",
    });
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previous;
  }
});
