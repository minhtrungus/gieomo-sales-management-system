import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  new URL("../supabase/migrations/032_controlled_order_deletion.sql", import.meta.url),
  "utf8",
);

test("032 only blocks paid or delivery-started orders and rechecks under a row lock", () => {
  assert.match(sql, /WHERE order_id = v_order_id FOR UPDATE/);
  for (const relation of ["shipments", "order_inventory_reservations"]) {
    assert.match(sql, new RegExp(`FROM public\\.${relation} WHERE order_id = v_order_id`));
  }
  assert.match(sql, /FROM public\.payments\s+WHERE order_id = v_order_id AND payment_status = 'paid'/);
  assert.match(sql, /FROM public\.payment_events WHERE matched_order_id = v_order_id/);
  assert.match(sql, /v_order\.payment_status::text NOT IN \('pending', 'failed'\)/);
  assert.match(sql, /payment_status = 'paid'/);
  assert.match(sql, /delivery_status::text, 'not_ready'/);
  assert.doesNotMatch(sql, /order_not_pending|lifecycle_timestamp_present|payment_event_present|shipment_present|business_history_present/);
  assert.match(sql, /expected_updated_at/);
  assert.match(sql, /v_confirmation <> 'XOA'/);
});

test("032 restores reservations/voucher and writes a PII-minimal audit", () => {
  assert.match(sql, /SET stock = pv\.stock \+ r\.quantity/);
  assert.match(sql, /DELETE FROM public\.order_inventory_reservations/);
  assert.match(sql, /SET times_used = times_used - 1/);
  assert.match(sql, /order\.physical_delete/);
  assert.doesNotMatch(sql, /buyer_name|buyer_phone|recipient_name|recipient_phone|shipping_address_snapshot/);
});

test("032 is service-role only", () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.manage_order_deletion_atomic\(jsonb\) FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.manage_order_deletion_atomic\(jsonb\) TO service_role/);
});
