import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/043_admin_order_archival.sql", import.meta.url), "utf8");
const route = readFileSync(new URL("../src/app/api/orders/delete/route.ts", import.meta.url), "utf8");
const panel = readFileSync(new URL("../src/components/admin/ControlledOrderDeletePanel.tsx", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../src/components/admin/AdminSidebar.tsx", import.meta.url), "utf8");

test("paid-order removal is one confirmation and preserves financial evidence", () => {
  assert.match(panel, /Xóa đơn hàng/);
  assert.match(panel, /không tự hoàn tiền/);
  assert.match(panel, /mode: "archive"/);
  assert.doesNotMatch(panel, /preview|confirmation.*XOA|confirmCode/);
  assert.match(route, /archive_order_atomic/);
  assert.match(migration, /financial_ledger_preserved/);
  assert.doesNotMatch(migration, /DELETE FROM public\.(?:payments|payment_events|orders)/);
});

test("special test-payment deletion UI and reconciliation workflow are removed", () => {
  assert.equal(existsSync(new URL("../src/app/admin/test-payment-deletion/page.tsx", import.meta.url)), false);
  assert.equal(existsSync(new URL("../src/app/api/admin/test-payment-deletion/route.ts", import.meta.url)), false);
  assert.equal(existsSync(new URL("../src/app/admin/reconciliation/page.tsx", import.meta.url)), false);
  assert.doesNotMatch(sidebar, /test-payment-deletion|admin\/reconciliation/);
});
