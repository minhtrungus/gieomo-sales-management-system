import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/042_guarded_test_payment_deletion.sql", import.meta.url), "utf8");
const route = readFileSync(new URL("../src/app/api/admin/test-payment-deletion/route.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/app/admin/test-payment-deletion/page.tsx", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../src/components/admin/AdminSidebar.tsx", import.meta.url), "utf8");

test("old archival UI/API are removed and replaced with a clearly destructive workflow", () => {
  assert.equal(existsSync(new URL("../src/app/admin/test-data-cleanup/page.tsx", import.meta.url)), false);
  assert.equal(existsSync(new URL("../src/app/api/admin/test-order-cleanup/route.ts", import.meta.url)), false);
  assert.doesNotMatch(sidebar, /Lưu trữ dữ liệu test|test-data-cleanup/);
  assert.match(sidebar, /Xóa đơn thanh toán test/);
  assert.match(page, /Lý do nhập tay không phải bằng chứng test/);
});

test("challenge is random, hashed, session-bound, same-origin, short-lived and one-time", () => {
  assert.match(route, /randomBytes\(32\)\.toString\("base64url"\)/);
  assert.match(route, /sha256\(rawConfirmationCode\)/);
  assert.match(route, /isSameOriginJsonRequest/);
  assert.match(route, /extractTokenFromRequest/);
  assert.doesNotMatch(migration, /confirmation_code/);
  assert.match(migration, /confirmation_hash/);
  assert.match(migration, /session_binding_hash/);
  assert.match(migration, /interval '5 minutes'/);
  assert.match(migration, /challenge_replayed/);
  assert.match(migration, /rate_limited/);
});

test("deletion is provenance-gated, synthetic-cash-only, locked, audited, and preserves events", () => {
  assert.match(migration, /database_insert_trigger/);
  assert.doesNotMatch(migration, /GRANT SELECT, INSERT[^;]+test_order_provenance/);
  assert.match(migration, /external_or_provider_payment_blocked/);
  assert.match(migration, /CASH-/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /stale_snapshot/);
  assert.match(migration, /test_payments\.delete_verified_batch/);
  assert.match(migration, /payment_events_preserved/);
  assert.doesNotMatch(migration, /DELETE FROM public\.payment_events/);
  assert.match(migration, /DELETE FROM public\.orders/);
  assert.match(migration, /cardinality\(order_ids\) BETWEEN 1 AND 10/);
});

test("route fails closed when environment or migration identity is unavailable", () => {
  assert.match(route, /TEST_CLEANUP_ALLOWED_PROJECT_REFS/);
  assert.match(route, /\["local", "test", "preview"\]/);
  assert.match(route, /migration 042/);
  assert.match(route, /Transaction thất bại và đã rollback/);
});
