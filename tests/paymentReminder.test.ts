import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generatePaymentReminderHtml } from "../src/lib/utils/emailService.ts";

const migration = readFileSync(new URL("../supabase/migrations/040_payment_reminders.sql", import.meta.url), "utf8");
const route = readFileSync(new URL("../src/app/api/admin/payment-reminders/route.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/app/admin/payment-reminders/page.tsx", import.meta.url), "utf8");

test("reminder claim locks and re-checks unpaid state, review events, and cooldown", () => {
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /payment_status <> 'pending'/);
  assert.match(migration, /payment_method <> 'banking'/);
  assert.match(migration, /public\.payments[\s\S]*payment_status IN \('paid', 'pending'\)/);
  assert.match(migration, /public\.payment_events/);
  assert.match(migration, /interval '24 hours'/);
  assert.match(migration, /payment\.reminder_claim/);
});

test("local/test reminder delivery is simulated and cannot call Resend", () => {
  assert.match(route, /process\.env\.NODE_ENV === "production"/);
  assert.match(route, /PAYMENT_REMINDER_DELIVERY_ENABLED === "true"/);
  const gate = route.indexOf("if (!deliveryEnabled || !resendKey)");
  const provider = route.indexOf('fetch("https://api.resend.com/emails"');
  assert.ok(gate > -1 && provider > gate);
  assert.match(route, /status: "simulated"/);
});

test("admin flow previews before an explicit send and uses UNPAID reconciliation", () => {
  assert.match(page, /reconciliation_status=UNPAID/);
  assert.match(page, /requestReminder\(order, "preview"\)/);
  assert.match(page, /requestReminder\(preview\.order, "send"\)/);
  assert.match(page, /srcDoc=\{preview\.html\}/);
});

test("payment reminder template escapes customer data and warns against double transfer", () => {
  const html = generatePaymentReminderHtml({
    order_code: "GM-TEST<1>", buyer_name: '<script>alert("x")</script>', final_amount: 18000,
  } as never);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /vui lòng không chuyển thêm/i);
  assert.match(html, /18\.000đ/);
});
