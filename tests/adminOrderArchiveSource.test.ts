import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/043_admin_order_archival.sql", import.meta.url), "utf8");
const guardMigration = readFileSync(new URL("../supabase/migrations/045_guard_admin_order_archival.sql", import.meta.url), "utf8");
const route = readFileSync(new URL("../src/app/api/orders/delete/route.ts", import.meta.url), "utf8");
const panel = readFileSync(new URL("../src/components/admin/ControlledOrderDeletePanel.tsx", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../src/components/admin/AdminSidebar.tsx", import.meta.url), "utf8");

test("terminal-order archival is one confirmation and preserves financial/inventory evidence", () => {
  assert.match(panel, /Lưu trữ đơn hàng/);
  assert.match(panel, /không tự hoàn tiền/);
  assert.match(panel, /không tự hoàn hàng về kho/);
  assert.match(panel, /chưa có thao tác khôi phục\/unarchive/);
  assert.match(panel, /orderStatus === "completed".*orderStatus === "cancelled"/);
  assert.match(panel, /mode: "archive"/);
  assert.doesNotMatch(panel, /preview|confirmation.*XOA|confirmCode/);
  assert.match(route, /archive_order_atomic/);
  assert.match(migration, /financial_ledger_preserved/);
  assert.doesNotMatch(migration, /DELETE FROM public\.(?:payments|payment_events|orders)/);
  assert.match(guardMigration, /NOT IN \('completed', 'cancelled'\)/);
  assert.match(guardMigration, /'outcome', 'not_terminal'/);
  assert.match(guardMigration, /'inventory_unchanged', true/);
  assert.match(guardMigration, /'refund_created', false/);
  assert.match(guardMigration, /'restock_created', false/);
  assert.doesNotMatch(guardMigration, /UPDATE public\.(?:orders|payments|product_variants|order_inventory_reservations)/);
});

test("special test-payment deletion UI and reconciliation workflow are removed", () => {
  assert.equal(existsSync(new URL("../src/app/admin/test-payment-deletion/page.tsx", import.meta.url)), false);
  assert.equal(existsSync(new URL("../src/app/api/admin/test-payment-deletion/route.ts", import.meta.url)), false);
  assert.equal(existsSync(new URL("../src/app/admin/reconciliation/page.tsx", import.meta.url)), false);
  assert.doesNotMatch(sidebar, /test-payment-deletion|admin\/reconciliation/);
});
