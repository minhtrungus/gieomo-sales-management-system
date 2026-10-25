import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const swapRoute = readFileSync(new URL("../src/app/api/orders/swap-variant/route.ts", import.meta.url), "utf8");
const swapSql = readFileSync(new URL("../supabase/migrations/033_order_item_variant_swap.sql", import.meta.url), "utf8");
const hardeningSql = readFileSync(new URL("../supabase/migrations/034_harden_order_deletion_and_mark_duplicates.sql", import.meta.url), "utf8");
const orderRoute = readFileSync(new URL("../src/app/api/orders/route.ts", import.meta.url), "utf8");
const duplicateRoute = readFileSync(new URL("../src/app/api/orders/duplicates/route.ts", import.meta.url), "utf8");

test("swap reason and authenticated actor are enforced beyond the client", () => {
  assert.match(swapRoute, /if \(!reason\)/);
  assert.match(swapRoute, /actor_member_id: isMemberUuid \? authCheck\.user\.memberId : null/);
  assert.match(swapSql, /v_reason IS NULL OR length\(v_reason\) > 500/);
  assert.match(swapSql, /FOR UPDATE/);
  assert.match(swapSql, /order\.item\.variant_swap/);
});

test("cancel route calls the canonical jsonb RPC contract", () => {
  assert.match(orderRoute, /rpc\("cancel_order_atomic", \{[\s\S]*p: \{/);
  assert.match(orderRoute, /actor_member_id:/);
  assert.doesNotMatch(orderRoute, /p_order_id:/);
});

test("physical delete is fail-closed around all business evidence", () => {
  for (const blocker of [
    "order_not_draft", "payment_evidence_present", "payment_event_present",
    "shipment_present", "business_history_present", "inventory_effect_present",
    "idempotency_claim_present", "lifecycle_effect_present",
  ]) assert.match(hardeningSql, new RegExp(blocker));
  assert.doesNotMatch(hardeningSql, /DELETE FROM public\.payments/);
  assert.doesNotMatch(hardeningSql, /DELETE FROM public\.payment_events/);
  assert.doesNotMatch(hardeningSql, /DELETE FROM public\.order_idempotency/);
});

test("duplicate workflow records the explicit keep/remove decision without deleting", () => {
  assert.match(hardeningSql, /mark_duplicate_order_atomic/);
  assert.match(hardeningSql, /keep_order_code/);
  assert.match(hardeningSql, /order\.duplicate_marked/);
  assert.match(hardeningSql, /physical_delete_performed', false/);
  assert.match(duplicateRoute, /Number\.isNaN\(Date\.parse\(expectedUpdatedAt\)\)/);
});
