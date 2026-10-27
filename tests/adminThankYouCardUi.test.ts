import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dialog = readFileSync(new URL("../src/components/admin/AdminOrderThankYouCardDialog.tsx", import.meta.url), "utf8");
const sharedDialog = readFileSync(new URL("../src/components/order/OrderThankYouCardDialog.tsx", import.meta.url), "utf8");
const listPage = readFileSync(new URL("../src/app/admin/orders/page.tsx", import.meta.url), "utf8");
const detailPage = readFileSync(new URL("../src/app/admin/orders/[id]/page.tsx", import.meta.url), "utf8");
const libraryPage = readFileSync(new URL("../src/app/admin/thank-you-cards/page.tsx", import.meta.url), "utf8");
const card = readFileSync(new URL("../src/components/order/ThankYouStoryCard.tsx", import.meta.url), "utf8");
const renderer = readFileSync(new URL("../src/lib/utils/thankYouCard.ts", import.meta.url), "utf8");

test("thank-you card mounts only after one order is selected", () => {
  assert.match(listPage, /const \[thankYouOrder, setThankYouOrder\]/);
  assert.match(listPage, /thankYouOrder && \(/);
  assert.match(listPage, /<AdminOrderThankYouCardDialog order=\{thankYouOrder\}/);
  assert.doesNotMatch(listPage, /filteredOrders\.map[\s\S]*<ThankYouStoryCard/);
  assert.match(detailPage, /showThankYouCard && order && \(/);
});

test("preview waits for the same registered fonts as PNG export without eager canvas work", () => {
  assert.match(renderer, /export async function ensureThankYouCardFonts/);
  assert.match(renderer, /CareeraScript_PERSONAL_USE_ONLY\.otf/);
  assert.match(renderer, /SVN-Lumios-Marker\.otf/);
  assert.match(card, /ensureThankYouCardFonts\(\)/);
  assert.match(card, /visibility: fontsReady \? "visible" : "hidden"/);
  const previewEffect = card.match(/useEffect\(\(\) => \{([\s\S]*?)\}\s*,\s*\[\]\);/)?.[1];
  assert.ok(previewEffect, "font-registration effect should remain present");
  assert.doesNotMatch(previewEffect, /renderThankYouCard/);
});

test("preview and print are separate explicit actions", () => {
  assert.match(dialog, /<OrderThankYouCardDialog order=\{order\}/);
  assert.match(sharedDialog, /<ThankYouStoryCard order=\{order\} \/>/);
  assert.match(sharedDialog, /onClick=\{printCard\}/);
  assert.match(sharedDialog, /In thiệp này/);
  assert.match(sharedDialog, /window\.print\(\)/);
  assert.doesNotMatch(sharedDialog, /useEffect\([\s\S]{0,300}window\.print/);
});

test("independent admin card library searches orders and reuses the same dialog", () => {
  assert.match(libraryPage, /syncOrdersFromServer\(true\)/);
  assert.match(libraryPage, /setSelectedOrder\(order\)/);
  assert.match(libraryPage, /<AdminOrderThankYouCardDialog order=\{selectedOrder\}/);
  assert.doesNotMatch(libraryPage, /<ThankYouStoryCard/);
});
