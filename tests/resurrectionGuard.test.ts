import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("payment confirmation is delegated to one atomic database contract", () => {
  const source = read("../src/app/api/orders/payment/route.ts");
  assert.match(source, /\.rpc\("apply_payment_event"/);
  assert.doesNotMatch(source, /recordPaymentOnce/);
  assert.doesNotMatch(source, /ADMIN-CONFIRM-/);
  assert.doesNotMatch(source, /\.from\("payments"\)\.insert/);
  assert.match(source, /validBankReference/);
  assert.match(source, /amount\s*=\s*Number\(body\.amount\)/);
});

test("payment confirmation cannot directly resurrect or complete an order", () => {
  const source = read("../src/app/api/orders/payment/route.ts");
  const confirmStart = source.indexOf('if (action === "confirm")');
  const rejectStart = source.indexOf('if (action === "reject")');
  const confirmBranch = source.slice(confirmStart, rejectStart);
  assert.ok(confirmStart >= 0 && rejectStart > confirmStart);
  assert.doesNotMatch(confirmBranch, /\.from\("orders"\)\s*\.update/);
  assert.doesNotMatch(confirmBranch, /order_status:\s*["']completed["']/);
});

test("SePay matched transfers use the same atomic payment contract", () => {
  const source = read("../src/app/api/webhook/sepay/route.ts");
  assert.match(source, /\.rpc\("apply_payment_event"/);
  assert.doesNotMatch(source, /recordPaymentOnce/);
  assert.doesNotMatch(source, /\.from\("payments"\)\.insert/);
  assert.doesNotMatch(source, /payment_status:\s*["']paid["']/);
  assert.doesNotMatch(source, /if\s*\([^)]*payment_status\s*===\s*["']paid["']\)/);
});

test("SePay authentication fails closed in every environment", () => {
  const source = read("../src/app/api/webhook/sepay/route.ts");
  assert.match(source, /if \(!configuredKey\)/);
  assert.match(source, /return response\(500/);
  assert.match(source, /timingSafeEqual/);
  assert.doesNotMatch(source, /NODE_ENV\s*===\s*["']production["']/);
});

test("payment helper requires amount and a real bank reference", () => {
  const source = read("../src/lib/data/paymentConfirm.ts");
  assert.match(source, /Number\(options\.amount\)/);
  assert.match(source, /referenceNumber\?\.trim/);
  assert.match(source, /amount,/);
  assert.match(source, /referenceNumber/);
});

test("generic order PATCH rejects every payment field before database writes", () => {
  const source = read("../src/app/api/orders/route.ts");
  const guard = source.indexOf('hasOwnProperty.call(body, "paymentStatus")');
  const writer = source.indexOf('const supabase = createAdminClient()');
  assert.ok(guard >= 0);
  assert.ok(writer > guard, "payment-field guard must execute before the PATCH database writer");
  assert.match(source, /payment_status/);
  assert.match(source, /status:\s*400/);
});
