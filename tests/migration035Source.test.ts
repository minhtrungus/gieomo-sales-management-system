import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  new URL("../supabase/migrations/035_combo_wildcard_checkout.sql", import.meta.url),
  "utf8",
);

test("035 expands wildcard combo components instead of failing checkout", () => {
  assert.match(sql, /public\.create_order_atomic_v25\(p JSONB\)/);
  // The per-component raise for a NULL variant must be gone...
  assert.doesNotMatch(
    sql,
    /v_component\.variant_id IS NULL THEN RAISE EXCEPTION 'D3:COMBO_COMPONENTS_UNMAPPED'/,
  );
  // ...but an active combo saved with no components at all still fails closed.
  assert.match(
    sql,
    /NOT EXISTS \(SELECT 1 FROM public\.combo_items WHERE combo_id = v_combo\.combo_id\)\s+THEN\s+RAISE EXCEPTION 'D3:COMBO_COMPONENTS_UNMAPPED'/,
  );
  assert.match(sql, /v_wildcards := v_wildcards \|\| jsonb_build_array/);
  assert.match(sql, /jsonb_array_elements\(v_wildcards\) AS w\(value\)/);
  // Wildcard candidates are only the product's ACTIVE variants, locked in a
  // stable order (the same order cancellation reversal uses).
  assert.match(sql, /pv\.status = 'active'/);
  assert.match(sql, /ORDER BY pv\.variant_id\s+FOR UPDATE/);
});

test("035 reuses the owner-approved availability math for pooled wildcards", () => {
  // Per-variant explicit cap.
  assert.match(sql, /IF v_variant\.stock < v_allocated THEN/);
  // Pooled remainder check against explicit demand.
  assert.match(sql, /v_pool_stock - v_explicit_total < v_wild\.quantity/);
  // Greedy allocation is bounded by what each variant can still give.
  assert.match(sql, /v_avail := v_variant\.stock - v_allocated/);
  assert.match(sql, /IF v_remaining > 0 THEN RAISE EXCEPTION 'D3:STOCK_INSUFFICIENT'; END IF;/);
});

test("035 returns exact deducted stock lines for provenance", () => {
  assert.match(sql, /'stock_lines', v_stock_lines,/);
  assert.match(
    sql,
    /IF NOT COALESCE\(v_result \? 'stock_lines', false\)\s+OR jsonb_typeof\(v_result->'stock_lines'\) <> 'array' THEN/,
  );
  assert.match(sql, /035:create_order_atomic_result_missing_stock_lines/);
  assert.match(
    sql,
    /SELECT v_order_id,\s+\(stock_line\.item->>'variant_id'\)::uuid/,
  );
  assert.doesNotMatch(sql, /ci\.quantity \* \(item->>'quantity'\)::int AS quantity/);
});

test("035 keeps replayed creations on original provenance and preserves ACLs", () => {
  assert.match(sql, /IF COALESCE\(\(v_result->>'replayed'\)::boolean, false\) THEN\s+RETURN v_result;/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.create_order_atomic_v25\(JSONB\)/);
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.create_order_atomic\(JSONB\) FROM PUBLIC, anon, authenticated;/,
  );
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.create_order_atomic\(JSONB\) TO service_role/);
  assert.match(sql, /035: create_order_atomic_v25 must stay non-executable/);
  assert.match(sql, /035: service_role lacks create_order_atomic execute/);
});

test("035 keeps legacy individual deduction behaviour for explicit-only orders", () => {
  assert.match(sql, /UPDATE public\.product_variants\s+SET stock = stock - v_stock\.quantity/);
  assert.match(sql, /IF NOT FOUND THEN RAISE EXCEPTION 'D3:STOCK_INSUFFICIENT'; END IF;/);
  assert.match(sql, /pg_advisory_xact_lock\(71420261014\)/);
});
