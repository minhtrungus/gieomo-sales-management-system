import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (relative: string) =>
  readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

test("P4-A1 financial admin routes require admin", () => {
  for (const file of [
    "src/app/api/orders/payment/route.ts",
    "src/app/api/admin/reconciliation/route.ts",
    "src/app/api/admin/notifications/route.ts",
  ]) {
    assert.match(source(file), /requireAdmin\(request\)/, file);
  }
});

test("P4-A2 proof writer enforces object ownership and paid terminal guard", () => {
  const route = source("src/app/api/orders/proof/route.ts");
  assert.match(route, /verifyOrderProofToken\(token, order\.order_code\)/);
  assert.match(route, /isPhoneMatched/);
  assert.match(route, /payment_status === "paid"/);
});

test("P4-A3 generic order PATCH cannot mutate payment state", () => {
  const route = source("src/app/api/orders/route.ts");
  assert.match(route, /requireAdmin\(request\)/);
  assert.match(route, /payment_status/);
  assert.match(route, /\/api\/orders\/payment/);
});

test("P4-A4 payment sensitive actions emit durable audit attempts", () => {
  const route = source("src/app/api/orders/payment/route.ts");
  const migration = source("supabase/migrations/023_payment_integrity.sql");
  assert.match(route, /\.rpc\("apply_payment_event"/);
  assert.match(route, /admin_member_id:\s*authCheck\.user\.memberId/);
  assert.match(migration, /INSERT INTO public\.audit_logs/);
  assert.match(migration, /INSERT INTO public\.order_status_history/);
});

test("P4-A5 clear-data endpoint is a non-mutating 403 stub", () => {
  const route = source("src/app/api/admin/clear-data/route.ts");
  assert.match(route, /status:\s*403/);
  assert.doesNotMatch(route, /\.delete\(|\.update\(|\.insert\(/);
});

test("P4-A6 generic media upload is admin-only before parsing files", () => {
  const route = source("src/app/api/upload/route.ts");
  const authorization = route.indexOf("await requireAdmin(request)");
  const bodyParsing = route.indexOf("await request.formData()");

  assert.ok(authorization >= 0, "upload route must require an admin session");
  assert.ok(bodyParsing >= 0, "upload route must parse multipart form data");
  assert.ok(authorization < bodyParsing, "authorization must happen before file parsing");
  assert.doesNotMatch(route, /getAuthenticatedUser\(request\)/);
});
