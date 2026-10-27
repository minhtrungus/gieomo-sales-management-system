import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const paymentsPage = readFileSync(new URL("../src/app/admin/payments/page.tsx", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../src/components/admin/AdminSidebar.tsx", import.meta.url), "utf8");
const reminderRoute = readFileSync(new URL("../src/app/api/admin/payment-reminders/route.ts", import.meta.url), "utf8");
const orderStore = readFileSync(new URL("../src/lib/data/orderStore.ts", import.meta.url), "utf8");
const thankYou = readFileSync(new URL("../src/components/order/ThankYouStoryCard.tsx", import.meta.url), "utf8");
const gallery = readFileSync(new URL("../src/components/products/ProductGallery.tsx", import.meta.url), "utf8");

test("admin payment approval only targets new proofs without a ledger event", () => {
  assert.match(paymentsPage, /orderCodesWithLedger/);
  assert.match(paymentsPage, /!orderCodesWithLedger\.has\(order\.order_code\)/);
  assert.match(paymentsPage, /Mở đối soát giao dịch ngoại lệ/);
  assert.match(paymentsPage, /referenceNumber: bankReference\.trim\(\)/);
  assert.doesNotMatch(paymentsPage, /onClick=\{\(\) => setConfirmingPayment\(p\)\}/);
});

test("payment actions and initial load await authoritative refresh", () => {
  assert.match(paymentsPage, /await syncOrdersFromServer\(true\)/);
  assert.match(paymentsPage, /const result = await fetchRecordedPayments\(\)/);
  assert.match(paymentsPage, /refreshAuthoritativeData\(true, true\)/);
  assert.match(paymentsPage, /PaymentRefreshCoordinator/);
  assert.match(orderStore, /export function syncOrdersFromServer\(force = false\): Promise<void>/);
  assert.match(orderStore, /if \(ordersSyncInFlight\) return ordersSyncInFlight/);
});

test("payments refreshes only while visible and never polls a provider or write route", () => {
  assert.match(paymentsPage, /window\.setInterval\(refreshWhenVisible, 30_000\)/);
  assert.match(paymentsPage, /shouldRefreshPayments\(document\.visibilityState\)/);
  assert.match(paymentsPage, /window\.addEventListener\("focus"/);
  assert.match(paymentsPage, /document\.addEventListener\("visibilitychange"/);
  assert.doesNotMatch(paymentsPage, /setInterval[\s\S]{0,300}\/api\/orders\/payment/);
  assert.doesNotMatch(paymentsPage, /setInterval[\s\S]{0,300}sepay/i);
});

test("removed cards are absent from navigation while backend modules remain", () => {
  assert.doesNotMatch(sidebar, /href: "\/admin\/thank-you-cards"/);
  assert.doesNotMatch(sidebar, /href: "\/admin\/payment-reminders"/);
  assert.match(reminderRoute, /claim_payment_reminder/);
});

test("missing reminder RPC is reported as service unavailable instead of opaque 500", () => {
  assert.match(reminderRoute, /PGRST202/);
  assert.match(reminderRoute, /schemaUnavailable/);
  assert.match(reminderRoute, /status: 503/);
});

test("interaction hot paths avoid eager canvas export and gallery remount", () => {
  assert.doesNotMatch(thankYou, /useEffect\([\s\S]{0,500}renderThankYouCard/);
  assert.match(thankYou, /useEffect\([\s\S]{0,500}ensureThankYouCardFonts/);
  assert.doesNotMatch(thankYou, /canvas\.toDataURL/);
  assert.match(thankYou, /canvas\.toBlob/);
  assert.doesNotMatch(gallery, /key=\{activeGalleryImage\}/);
  assert.match(gallery, /quality=\{60\}/);
});
