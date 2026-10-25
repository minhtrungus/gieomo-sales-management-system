import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../src/app/api/webhook/sepay/route.ts", import.meta.url), "utf8");
const paymentMigration = readFileSync(
  new URL("../supabase/migrations/023_payment_integrity.sql", import.meta.url),
  "utf8"
);

test("R1-W1 — webhook authentication always fails closed", () => {
  assert.match(route, /if \(!configuredKey\)/);
  assert.match(route, /response\(500/);
  assert.match(route, /timingSafeEqual/);
  assert.doesNotMatch(route, /NODE_ENV/);
});

test("R1-W2 — raw transfer content and transaction identity are not echoed", () => {
  const responseSection = route.slice(route.lastIndexOf("return response(200"));
  assert.doesNotMatch(responseSection, /content|transactionCode|transaction_id|account_number/i);
});

test("R1-W3 — matched transfers have one atomic database writer", () => {
  assert.match(route, /\.rpc\("apply_payment_event"/);
  assert.doesNotMatch(route, /recordPaymentOnce/);
  assert.doesNotMatch(route, /\.from\("payments"\)\.insert/);
  assert.doesNotMatch(route, /\.from\("orders"\)\.update/);
});

test("R1-W4 — missing reference and invalid amount fail closed", () => {
  assert.match(route, /missing_transaction_identity/);
  assert.match(route, /invalid_amount/);
  assert.match(route, /needs_review:\s*true/);
});

test("R1-W5 — unmatched reference is durably recorded before acknowledgement", () => {
  const unmatched = route.slice(route.indexOf("if (!orderCode)"), route.indexOf('const { data, error } = await supabase.rpc'));
  assert.match(unmatched, /payment_events/);
  assert.match(unmatched, /no_order_reference/);
  assert.match(unmatched, /if \(error\) return response\(500/);
});

test("R1-W6 — DB RPC classifies underpaid, additional and cancelled money events", () => {
  for (const outcome of ["underpaid", "paid_order_additional_transfer", "cancelled_order_payment"]) {
    assert.match(paymentMigration, new RegExp(outcome));
  }
  assert.match(paymentMigration, /FOR UPDATE/);
  assert.match(paymentMigration, /INSERT INTO public\.payment_events/);
});
