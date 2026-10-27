import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/041_safe_test_order_archival.sql", import.meta.url), "utf8");
const route = readFileSync(new URL("../src/app/api/admin/test-order-cleanup/route.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/app/admin/test-data-cleanup/page.tsx", import.meta.url), "utf8");

test("test cleanup is archival-only and preserves financial evidence", () => {
  assert.match(migration, /CREATE TABLE public\.test_order_archives/);
  assert.doesNotMatch(migration, /DELETE FROM public\.(orders|payments|payment_events)/i);
  assert.doesNotMatch(migration, /UPDATE public\.(orders|payments|payment_events)/i);
  assert.match(migration, /'orders_deleted', 0/);
  assert.match(migration, /'ledger_preserved', TRUE/);
});

test("test cleanup requires app and database environment guards", () => {
  assert.match(route, /TEST_CLEANUP_ALLOWED_PROJECT_REFS/);
  assert.match(route, /\["local", "test", "preview"\]\.includes\(environmentKind\)/);
  assert.match(migration, /environment_kind IN \('local', 'test', 'preview'\)/);
  assert.match(migration, /cleanup_enabled IS TRUE/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /stale_or_unconfirmed/);
});

test("admin UI requires dry-run and exact second confirmation", () => {
  assert.match(page, /mode: "preview"/);
  assert.match(page, /LUU TRU \$\{preview\.order_count\} DON/);
  assert.match(page, /Không xóa đơn, payment, payment event hay audit/);
});
