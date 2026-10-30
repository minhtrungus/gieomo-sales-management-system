import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (path: string): string => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const TRACK = read("../src/app/track/page.tsx");
const DIALOG = read("../src/components/order/OrderThankYouCardDialog.tsx");
const ADMIN_DIALOG = read("../src/components/admin/AdminOrderThankYouCardDialog.tsx");

test("customer lookup exposes the shared thank-you preview and print action only for a selected order", () => {
  assert.match(TRACK, /thankYouOrder && \(/);
  assert.match(TRACK, /<OrderThankYouCardDialog order=\{thankYouOrder\}/);
  assert.match(TRACK, /Xem \/ in thiệp cảm ơn/);
  assert.match(TRACK, /aria-label=\{`Xem hoặc in thiệp cảm ơn cho đơn/);
});

test("admin and customer flows share the same print implementation", () => {
  assert.match(ADMIN_DIALOG, /<OrderThankYouCardDialog order=\{order\} onClose=\{onClose\}/);
  assert.match(DIALOG, /createThankYouCardPng\(customerName, orderDate\)/);
  assert.match(DIALOG, /window\.print\(\)/);
  assert.match(DIALOG, /event\.key === "Escape"/);
});
