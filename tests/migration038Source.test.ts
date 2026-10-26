import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/migrations/038_order_deletion_idempotency_cleanup.sql", import.meta.url), "utf8");

test("038 only removes the draft order's own idempotency claim before deletion", () => {
  assert.match(sql, /DELETE FROM public\.order_idempotency WHERE order_id = v_order_id/);
  assert.match(sql, /DELETE FROM public\.orders WHERE order_id = v_order_id/);
  assert.ok(sql.indexOf("DELETE FROM public.order_idempotency") < sql.indexOf("DELETE FROM public.orders"));
  assert.doesNotMatch(sql, /DELETE FROM public\.(payments|payment_events|shipments)/);
  assert.match(sql, /payment_evidence_present/);
  assert.match(sql, /payment_event_present/);
  assert.match(sql, /shipment_present/);
  assert.match(sql, /inventory_effect_present/);
});

test("038 keeps preview/version/confirmation/admin/audit guards and service-role ACL", () => {
  assert.match(sql, /v_confirmation <> 'XOA'/);
  assert.match(sql, /expected_updated_at/);
  assert.match(sql, /FOR UPDATE/);
  assert.match(sql, /role = 'admin'/);
  assert.match(sql, /order\.physical_delete/);
  assert.match(sql, /idempotency_claims_removed/);
  assert.match(sql, /REVOKE ALL ON FUNCTION[\s\S]*anon, authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION[\s\S]*service_role/);
});
