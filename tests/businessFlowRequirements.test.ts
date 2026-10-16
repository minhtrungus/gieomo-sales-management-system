import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register(
  `data:text/javascript,${encodeURIComponent(`
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    const name = specifier.split("/").pop() || "";
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && !name.includes(".")) {
      return nextResolve(specifier + ".ts", context);
    }
    throw error;
  }
}
`)}`,
  import.meta.url
);

const { getFirstProductVariant, moveProductVariant, sortProductVariants } = await import(
  "../src/lib/productVariantOrder.ts"
);
const { getComboVirtualStock, getDefaultComboVariantId } = await import(
  "../src/lib/comboInventory.ts"
);
const {
  NO_INTRODUCER_VALUE,
  isNoIntroducerValue,
  normalizeIntroducerValue,
  validateIntroducerInfo,
} = await import("../src/lib/checkout/introducer.ts");

const variants = [
  { variant_id: "v-20", name: "Mẫu 20", sort_order: 20, stock: 8 },
  { variant_id: "v-02", name: "Mẫu 02", sort_order: 2, stock: 3 },
  { variant_id: "v-10", name: "Mẫu 10", sort_order: 10, stock: 5 },
];

test("NV1 — mẫu bán được xếp tăng dần theo sort_order và không mutate nguồn", () => {
  const sorted = sortProductVariants(variants);
  assert.deepEqual(sorted.map((variant) => variant.variant_id), ["v-02", "v-10", "v-20"]);
  assert.deepEqual(variants.map((variant) => variant.variant_id), ["v-20", "v-02", "v-10"]);
  assert.equal(getFirstProductVariant(variants)?.variant_id, "v-02");
});

test("NV1 — mẫu thiếu thứ tự nằm sau và giữ nguyên thứ tự tương đối", () => {
  const sorted = sortProductVariants([
    { variant_id: "legacy-a" },
    { variant_id: "ordered", sort_order: 1 },
    { variant_id: "legacy-b", sort_order: null },
  ]);
  assert.deepEqual(sorted.map((variant) => variant.variant_id), ["ordered", "legacy-a", "legacy-b"]);
});

test("NV1 — BTC đổi thứ tự mẫu thì sort_order được đánh lại liên tục", () => {
  const moved = moveProductVariant(sortProductVariants(variants), 2, 0);
  assert.deepEqual(moved.map((variant) => variant.variant_id), ["v-20", "v-02", "v-10"]);
  assert.deepEqual(moved.map((variant) => variant.sort_order), [1, 2, 3]);
});

test("NV2 — combo mặc định chọn biến thể có số thứ tự nhỏ nhất", () => {
  assert.equal(getDefaultComboVariantId({ product_id: "p1", variants }), "v-02");
});

test("NV2 — tồn combo dùng đúng tồn của variant đã chọn, không cộng cả sản phẩm", () => {
  const products = [
    { product_id: "p1", variants },
    {
      product_id: "p2",
      variants: [{ variant_id: "v2", sort_order: 1, stock: 7 }],
    },
  ];
  assert.equal(
    getComboVirtualStock(
      [
        { product_id: "p1", variant_id: "v-02", quantity: 2 },
        { product_id: "p2", variant_id: "v2", quantity: 3 },
      ],
      products
    ),
    1
  );
  assert.equal(
    getComboVirtualStock([{ product_id: "p1", variant_id: null, quantity: 1 }], products),
    0
  );
});

test("NV5 — bắt buộc có người liên hệ, nhưng lựa chọn 'không quen ai' là hợp lệ", () => {
  assert.match(validateIntroducerInfo("") || "", /Vui lòng/);
  assert.match(validateIntroducerInfo("   ") || "", /Vui lòng/);
  assert.equal(validateIntroducerInfo("Tôi không quen ai trong BTC"), null);
  assert.equal(validateIntroducerInfo("Trực tiếp (Website)"), null);
  assert.equal(validateIntroducerInfo("Lan (MAM-LAN)"), null);
  assert.equal(validateIntroducerInfo("Chị Hương ở gian hàng"), null);
});

test("NV5 — lựa chọn 'không quen ai' được lưu nhất quán thành giá trị chuẩn", () => {
  assert.equal(NO_INTRODUCER_VALUE, "Trực tiếp (Website)");
  assert.equal(normalizeIntroducerValue("Tôi không quen ai trong BTC"), "Trực tiếp (Website)");
  assert.equal(normalizeIntroducerValue("không quen ai"), "Trực tiếp (Website)");
  assert.equal(normalizeIntroducerValue("  Truc tiep (Website) "), "Trực tiếp (Website)");
  assert.equal(normalizeIntroducerValue("Lan (MAM-LAN)"), "Lan (MAM-LAN)");
  assert.equal(normalizeIntroducerValue(""), "Trực tiếp (Website)");
  assert.equal(isNoIntroducerValue("Truc tiep (Website)"), true);
  assert.equal(isNoIntroducerValue("Trực tiếp"), true);
  assert.equal(isNoIntroducerValue("Lan (MAM-LAN)"), false);
  assert.equal(isNoIntroducerValue(null), false);
});
