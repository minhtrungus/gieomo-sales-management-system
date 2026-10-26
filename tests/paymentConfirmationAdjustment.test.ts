import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/039_controlled_payment_confirmation_adjustment.sql", import.meta.url), "utf8");
const route = readFileSync(new URL("../src/app/api/orders/payment/route.ts", import.meta.url), "utf8");
const detail = readFileSync(new URL("../src/app/admin/orders/[id]/page.tsx", import.meta.url), "utf8");

test("controlled adjustment is locked, versioned, audited, and preserves payment evidence", () => {
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /expected_updated_at/);
  assert.match(migration, /version_conflict/);
  assert.match(migration, /payment_confirmation_adjustments/);
  assert.match(migration, /order_status_history/);
  assert.match(migration, /audit_logs/);
  assert.match(migration, /payment_ledger_preserved/);
  assert.doesNotMatch(migration, /DELETE FROM public\.(payments|payment_events)/);
  assert.doesNotMatch(migration, /UPDATE public\.payments/);
});

test("bank money and fulfilled history cannot be unconfirmed", () => {
  assert.match(migration, /v_provider IS DISTINCT FROM 'cash'/);
  assert.match(migration, /external_money_requires_reconciliation/);
  assert.match(migration, /fulfillment_started/);
  assert.match(migration, /irreversible_history/);
  assert.match(migration, /delivery_status <> 'not_ready'/);
});

test("route requires admin auth, a reason, and optimistic-concurrency version", () => {
  assert.match(route, /requireAdmin\(request\)/);
  assert.match(route, /action === "adjust_confirmation"/);
  assert.match(route, /reason\.length < 8/);
  assert.match(route, /expectedUpdatedAt/);
  assert.match(route, /adjust_payment_confirmation_atomic/);
});

test("admin UI explains impact and never offers a raw paid-to-pending field toggle", () => {
  assert.match(detail, /Điều chỉnh xác nhận tiền mặt/);
  assert.match(detail, /Sổ giao dịch không bị xóa/);
  assert.match(detail, /expectedUpdatedAt: order\.updated_at/);
  assert.match(detail, /disabled=\{paymentStatus === "paid"\}/);
  assert.doesNotMatch(detail, /<option value="refunded"/);
});
