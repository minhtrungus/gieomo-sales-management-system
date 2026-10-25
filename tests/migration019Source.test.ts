import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Batch 2G — kiểm tra NGUỒN migration 019 (không cần PG):
 *   - RPC dùng RELATIVE delta, KHÔNG absolute stock write.
 *   - Guard không cho stock âm.
 *   - Idempotency key: unique index + kiểm tra payload fail-closed.
 *   - SECURITY DEFINER + search_path cố định.
 *   - REVOKE PUBLIC/anon/authenticated, GRANT service_role.
 *   - Ledger insert CÙNG function (cùng transaction scope plpgsql).
 * Hành vi PG thật (concurrency) nằm ở adjustStockPg.integration.test.ts.
 */

const SQL = readFileSync(
  new URL("../supabase/migrations/019_inventory_adjustments.sql", import.meta.url),
  "utf8"
);

test("S1 — RPC adjust_variant_stock tồn tại với SECURITY DEFINER + search_path pinned", () => {
  assert.match(SQL, /CREATE OR REPLACE FUNCTION public\.adjust_variant_stock\(/);
  assert.match(SQL, /SECURITY DEFINER/);
  assert.match(SQL, /SET search_path = public, pg_temp/);
});

test("S2 — dùng RELATIVE delta (stock = stock + p_delta), KHÔNG absolute stock write", () => {
  assert.match(SQL, /stock = stock \+ p_delta|v_new_stock := v_variant\.stock \+ p_delta/);
  assert.doesNotMatch(
    SQL,
    /UPDATE public\.product_variants\s+SET stock = p_new_stock|SET stock = p_absolute/i,
    "không nhận absolute stock từ client"
  );
});

test("S3 — guard stock không âm: RAISE/kiểm tra trước khi mutate", () => {
  assert.match(SQL, /v_variant\.stock \+ p_delta < 0/);
  assert.match(SQL, /insufficient_stock/);
});

test("S4 — idempotency: unique index + so sánh payload fail-closed", () => {
  assert.match(SQL, /uq_inventory_adjustments_idempotency_key/);
  assert.match(SQL, /B2G:IDEMPOTENCY_PAYLOAD_MISMATCH/);
  assert.match(SQL, /IS DISTINCT FROM p_variant_id|IS DISTINCT FROM p_delta/);
});

test("S5 — outcome contract: applied / duplicate / not_found / insufficient_stock", () => {
  assert.match(SQL, /'outcome',\s*'applied'/);
  assert.match(SQL, /'outcome',\s*'duplicate'/);
  assert.match(SQL, /'outcome',\s*'not_found'/);
  assert.match(SQL, /'outcome',\s*'insufficient_stock'/);
});

test("S6 — permissions: REVOKE PUBLIC + anon/authenticated, GRANT service_role", () => {
  assert.match(
    SQL,
    /REVOKE ALL ON FUNCTION public\.adjust_variant_stock\(uuid, integer, text, text, uuid\) FROM PUBLIC/
  );
  assert.match(
    SQL,
    /REVOKE ALL ON FUNCTION public\.adjust_variant_stock\(uuid, integer, text, text, uuid\) FROM anon, authenticated/
  );
  assert.match(
    SQL,
    /GRANT EXECUTE ON FUNCTION public\.adjust_variant_stock\(uuid, integer, text, text, uuid\) TO service_role/
  );
});

test("S7 — ledger table có các cột idempotency/audit cần thiết", () => {
  assert.match(SQL, /CREATE TABLE IF NOT EXISTS public\.inventory_adjustments/);
  for (const col of [
    "adjustment_id",
    "variant_id",
    "delta",
    "stock_before",
    "stock_after",
    "reason",
    "idempotency_key",
    "actor_member_id",
    "created_at",
  ]) {
    assert.ok(SQL.includes(col), `thiếu cột ${col} trong ledger`);
  }
});

test("S8 — fail-closed verification blocks cho index + function", () => {
  assert.match(SQL, /DO \$\$/);
  assert.match(SQL, /KHÔNG đúng mong đợi|không tồn tại sau CREATE/);
});

test("S9 — actor chỉ ghi khi member còn tồn tại (FK members)", () => {
  assert.match(SQL, /EXISTS \(SELECT 1 FROM public\.members WHERE member_id = p_actor_member_id\)/);
});

test("S10 — KHÔNG đụng products.stock (001 không có cột này)", () => {
  assert.doesNotMatch(SQL, /UPDATE public\.products\s+SET stock/i);
});
