import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Batch 2G.2 — kiểm tra NGUỒN migration 020 (không cần PG):
 *   - Snapshot variant_name/sku + variant_id NULL-able.
 *   - FK đổi sang ON DELETE SET NULL (KHÔNG CASCADE, KHÔNG xóa ledger).
 *   - Backfill chỉ từ variant còn tồn tại, không suy đoán.
 *   - RPC cùng signature 019, thêm snapshot vào INSERT/RETURN;
 *     toàn bộ semantics 019 (relative delta, guard âm, idempotency,
 *     SECURITY DEFINER, revoke/grant) giữ nguyên.
 *   - Verification fail-closed theo TÊN cột/constraint (không đếm cột).
 * Hành vi PG thật (SET NULL khi DELETE variant): A8 trong
 * adjustStockPg.integration.test.ts (tự SKIP khi thiếu env).
 */

const SQL = readFileSync(
  new URL("../supabase/migrations/020_ledger_delete_policy.sql", import.meta.url),
  "utf8"
);

// ---- T1: snapshot columns ----
test("T1 — ADD COLUMN variant_name + sku (text, nullable)", () => {
  assert.match(SQL, /ADD COLUMN IF NOT EXISTS variant_name text/);
  assert.match(SQL, /ADD COLUMN IF NOT EXISTS sku text/);
});

// ---- T2: variant_id NULL-able ----
test("T2 — variant_id DROP NOT NULL", () => {
  assert.match(SQL, /ALTER COLUMN variant_id DROP NOT NULL/);
});

// ---- T3: FK SET NULL, không CASCADE ----
test("T3 — FK variant_id: DROP cũ + ADD ON DELETE SET NULL, KHÔNG CASCADE", () => {
  assert.match(SQL, /DROP CONSTRAINT IF EXISTS inventory_adjustments_variant_id_fkey/);
  assert.match(SQL, /ADD CONSTRAINT inventory_adjustments_variant_id_fkey/);
  assert.match(SQL, /ON DELETE SET NULL/);
  assert.doesNotMatch(
    SQL,
    /REFERENCES public\.product_variants\(variant_id\)\s*\n?\s*ON DELETE CASCADE/i,
    "FK variant_id KHÔNG được dùng ON DELETE CASCADE"
  );
});

// ---- T4: backfill không suy đoán ----
test("T4 — backfill chỉ UPDATE FROM product_variants còn liên kết;variant đã mất → giữ NULL", () => {
  assert.match(SQL, /UPDATE public\.inventory_adjustments ia\s+SET variant_name = v\.name,\s*\n?\s*sku\s+= v\.sku\s+FROM public\.product_variants v/);
  assert.match(SQL, /ia\.variant_id IS NOT NULL/);
  assert.match(SQL, /ia\.variant_id = v\.variant_id/);
  assert.match(SQL, /ia\.variant_name IS NULL/);
  // Không hardcode/suy đoán dữ liệu lịch sử
  assert.doesNotMatch(SQL, /SET variant_name = '/, "backfill KHÔNG được hardcode tên variant");
});

// ---- T5: RPC cùng signature + SECURITY DEFINER + search_path ----
test("T5 — CREATE OR REPLACE adjust_variant_stock: cùng signature 019, SECURITY DEFINER, search_path pinned", () => {
  assert.match(SQL, /CREATE OR REPLACE FUNCTION public\.adjust_variant_stock\(/);
  assert.match(SQL, /p_variant_id\s+uuid,/);
  assert.match(SQL, /p_delta\s+integer,/);
  assert.match(SQL, /p_reason\s+text,/);
  assert.match(SQL, /p_idempotency_key\s+text,/);
  assert.match(SQL, /p_actor_member_id\s+uuid DEFAULT NULL/);
  assert.match(SQL, /SECURITY DEFINER/);
  assert.match(SQL, /SET search_path = public, pg_temp/);
});

// ---- T6: INSERT + RETURN có snapshot từ variant đã khóa ----
test("T6 — ledger INSERT ghi variant_name + sku; RETURN applied/duplicate kèm snapshot", () => {
  const insertBlock = SQL.slice(SQL.indexOf("INSERT INTO public.inventory_adjustments"));
  assert.ok(insertBlock.length > 0, "phải có INSERT INTO inventory_adjustments");
  assert.match(insertBlock.slice(0, 600), /variant_name,\s*\n?\s*sku|actor_member_id, variant_name, sku/);
  assert.match(insertBlock.slice(0, 800), /v_variant\.name,\s*\n?\s*v_variant\.sku|v_actor, v_variant\.name, v_variant\.sku/);
  // duplicate RETURN có variantName/sku (additive — không đổi outcome contract)
  assert.match(SQL, /'outcome',\s*'duplicate'[\s\S]{0,600}'variantName'/);
  assert.match(SQL, /'outcome',\s*'applied'[\s\S]{0,600}'variantName'/);
});

// ---- T7: permissions — GIỐNG 019 ----
test("T7 — REVOKE PUBLIC + anon/authenticated, GRANT service_role (cùng signature)", () => {
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

// ---- T8: verification fail-closed theo TÊN (không đếm tổng cột) ----
test("T8 — verification: 2 cột snapshot theo tên+kiểu, variant_id nullable, đúng 1 FK confdeltype=n, unique index, signature args", () => {
  assert.match(SQL, /column_name IN \('variant_name', 'sku'\)/);
  assert.match(SQL, /data_type = 'text'/);
  assert.doesNotMatch(SQL, /col_count\s*<>\s*\d+|col_count integer/, "KHÔNG đếm tổng số cột — kiểm tra theo tên");
  assert.match(SQL, /v_nullable IS DISTINCT FROM 'YES'/);
  assert.match(SQL, /v_deltype IS DISTINCT FROM 'n'/);
  assert.match(SQL, /v_fk_count <> 1/);
  assert.match(SQL, /uq_inventory_adjustments_idempotency_key/);
  assert.match(SQL, /pg_get_function_identity_arguments/);
  assert.match(SQL, /p_variant_id uuid, p_delta integer, p_reason text, p_idempotency_key text, p_actor_member_id uuid/);
  // Grants verify
  assert.match(SQL, /grantee\s+= 'service_role'/);
  assert.match(SQL, /grantee IN \('anon', 'authenticated'\)/);
});

// ---- T9: không phá vỡ dữ liệu/quyền đã có ----
test("T9 — KHÔNG DROP TABLE, KHÔNG DELETE ledger, KHÔNG sửa 019", () => {
  assert.doesNotMatch(SQL, /DROP TABLE/i);
  assert.doesNotMatch(SQL, /DELETE FROM public\.inventory_adjustments/i);
  assert.doesNotMatch(SQL, /TRUNCATE/i);
});

// ---- T10: semantics 019 giữ nguyên trong RPC mới ----
test("T10 — RPC giữ nguyên: relative delta, guard âm, idempotency payload-mismatch, at-most-once, actor-exists", () => {
  assert.match(SQL, /v_new_stock := v_variant\.stock \+ p_delta/);
  assert.match(SQL, /v_variant\.stock \+ p_delta < 0/);
  assert.match(SQL, /B2G:IDEMPOTENCY_PAYLOAD_MISMATCH/);
  assert.match(SQL, /IS DISTINCT FROM p_variant_id/);
  assert.match(SQL, /B2G:INVALID_ARGUMENTS/);
  assert.match(SQL, /EXISTS \(SELECT 1 FROM public\.members WHERE member_id = p_actor_member_id\)/);
  // duplicate vẫn là duplicate (KHÔNG thành applied mới)
  assert.match(SQL, /'outcome',\s*'duplicate'/);
  assert.match(SQL, /'outcome',\s*'insufficient_stock'/);
  assert.match(SQL, /'outcome',\s*'not_found'/);
  // lock serialize
  assert.match(SQL, /FOR UPDATE/);
});
