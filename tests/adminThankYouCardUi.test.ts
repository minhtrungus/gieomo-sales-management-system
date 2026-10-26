import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dialog = readFileSync(new URL("../src/components/admin/AdminOrderThankYouCardDialog.tsx", import.meta.url), "utf8");
const listPage = readFileSync(new URL("../src/app/admin/orders/page.tsx", import.meta.url), "utf8");
const detailPage = readFileSync(new URL("../src/app/admin/orders/[id]/page.tsx", import.meta.url), "utf8");
const libraryPage = readFileSync(new URL("../src/app/admin/thank-you-cards/page.tsx", import.meta.url), "utf8");

test("thank-you card mounts only after one order is selected", () => {
  assert.match(listPage, /const \[thankYouOrder, setThankYouOrder\]/);
  assert.match(listPage, /thankYouOrder && \(/);
  assert.match(listPage, /<AdminOrderThankYouCardDialog order=\{thankYouOrder\}/);
  assert.doesNotMatch(listPage, /filteredOrders\.map[\s\S]*<ThankYouStoryCard/);
  assert.match(detailPage, /showThankYouCard && order && \(/);
});

test("preview and print are separate explicit actions", () => {
  assert.match(dialog, /<ThankYouStoryCard order=\{order\} \/>/);
  assert.match(dialog, /onClick=\{printCard\}/);
  assert.match(dialog, /In thiệp này/);
  assert.match(dialog, /window\.print\(\)/);
  assert.doesNotMatch(dialog, /useEffect\([\s\S]{0,300}window\.print/);
});

test("independent admin card library searches orders and reuses the same dialog", () => {
  assert.match(libraryPage, /syncOrdersFromServer\(true\)/);
  assert.match(libraryPage, /setSelectedOrder\(order\)/);
  assert.match(libraryPage, /<AdminOrderThankYouCardDialog order=\{selectedOrder\}/);
  assert.doesNotMatch(libraryPage, /<ThankYouStoryCard/);
});
