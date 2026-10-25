import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  new URL("../supabase/migrations/031_optional_combo_variant_persistence.sql", import.meta.url),
  "utf8",
);

test("031 preserves NULL as all-active-variants semantics without a fake variant", () => {
  assert.match(sql, /v_variant_id := NULLIF\(v_item->>'variant_id', ''\)::uuid/);
  assert.match(sql, /v_variant_id IS NOT NULL/);
  assert.match(sql, /variant\.status = 'active'/);
  assert.match(sql, /C1:NO_ELIGIBLE_VARIANTS/);
  assert.match(sql, /NULLIF\(value->>'variant_id', ''\)::uuid/);
  assert.doesNotMatch(sql, /00000000-0000-0000-0000-000000000000/);
});

test("031 keeps save RPC private to service_role", () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.save_combo_atomic\(jsonb\) FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.save_combo_atomic\(jsonb\) TO service_role/);
});
