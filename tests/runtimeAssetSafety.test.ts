import assert from "node:assert/strict";
import test from "node:test";

import {
  LOCAL_ASSET_UNAVAILABLE,
  resolveRuntimeAsset,
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
