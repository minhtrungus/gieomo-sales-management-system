import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Batch INP-LIGHTBOX — regression source chống quay lại pattern cũ:
 * 1. Lightbox ảnh sản phẩm phải là component độc lập (ProductLightbox) với
 *    zoom state nội bộ → zoom/close không re-render cả trang chi tiết.
 * 2. Lightbox không được yêu cầu variant "100vw" quá lớn — sizes phải khớp
 *    hộp hiển thị max-w-5xl (min(100vw, 64rem)).
 * 3. Gallery phải arm prefetch variant lớn khi người dùng có intent
 *    (pointerenter/touchstart) để click phóng to khớp cache.
 */

const read = (path: string): string =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

const DETAIL = read("../src/app/products/[slug]/ProductDetailClient.tsx");
const LIGHTBOX = read("../src/components/products/ProductLightbox.tsx");

test("INP-L1 — lightbox tách component riêng, zoom state sống nội bộ", () => {
  assert.match(DETAIL, /from "@\/components\/products\/ProductLightbox"/);
  assert.match(DETAIL, /<ProductLightbox\b/);
  // Trang chi tiết không còn giữ state/handler zoom nội khối lightbox
  assert.doesNotMatch(DETAIL, /lightboxZoom/);
  assert.match(LIGHTBOX, /const \[zoom, setZoom\] = useState\(1\)/);
  assert.match(LIGHTBOX, /export const ProductLightbox = memo/);
});

test("INP-L2 — lightbox không request variant 100vw, sizes khớp hộp max-w-5xl", () => {
  const images = LIGHTBOX.match(/<Image[^>]*src=\{activeSrc\}[\s\S]*?\/>/);
  assert.ok(images, "lightbox active image element missing");
  assert.match(images[0], /sizes="min\(100vw, 64rem\)"/);
  assert.doesNotMatch(images[0], /sizes="100vw"/);
});

test("INP-L3 — gallery arm prefetch variant lớn trên user intent hover/touch", () => {
  assert.match(DETAIL, /onPointerEnter=\{\(\) => setIsGalleryPrefetchArmed\(true\)\}/);
  assert.match(DETAIL, /onTouchStart=\{\(\) => setIsGalleryPrefetchArmed\(true\)\}/);
  assert.match(DETAIL, /isGalleryPrefetchArmed && activeGalleryImage/);
  // prefetch phải dùng cùng một sizes với lightbox để cache hit
  assert.match(DETAIL, /sizes="min\(100vw, 64rem\)"/);
});

test("INP-L4 — mở lightbox giữ nguyên hành vi: một luồng state, không side-effect lạ", () => {
  // click mở chỉ set isLightboxOpen; đóng qua onClose; keyboard trong component
  assert.match(DETAIL, /onClick=\{\(\) => setIsLightboxOpen\(true\)\}/);
  assert.match(DETAIL, /onClose=\{\(\) => setIsLightboxOpen\(false\)\}/);
  assert.doesNotMatch(LIGHTBOX, /router\.|fetch\(|window\.location/);
  assert.match(LIGHTBOX, /e\.key === "Escape"/);
});
