import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Batch BLOCKERS-1-3 — regression NGUỒN chống quay lại hợp đồng cũ:
 * 1. BLOCKER-1: orderService không còn phụ thuộc V015 (claim/recon/ledger)
 *    và không còn writer multi-step/atomic cũ.
 * 2. BLOCKER-3: route POST chỉ dùng createOrderServerAtomicV2; mọi request
 *    kể cả keyless đều đi đúng lỗi tường minh, KHÔNG fallback legacy.
 * 3. Hợp đồng V2 ↔ migration 025: D3 codes + scope_key regex phải khớp
 *    hai chiều (SQL raise ↔ app mapping).
 */

const read = (path: string): string =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

const ORDER_SERVICE = read("../src/lib/services/orderService.ts");
const ORDER_ROUTE = read("../src/app/api/orders/route.ts");
const ORDER_V2 = read("../src/lib/services/orderCreateAtomicV2.ts");
const SQL025 = read("../supabase/migrations/025_atomic_idempotent_order_creation.sql");

test("BLOCKER-1 — orderService chỉ còn getOrdersServer, sạch V015/legacy writer", () => {
  for (const forbidden of [
    "idempotencyService",
    "order_idempotency",
    "createOrderServer",
    "GIEOMO_ORDER_WRITER",
    "resolveOrderWriterMode",
    "claimIdempotency",
    "markFailedTerminal",
    "flagReconciliationRequired",
    "handleExistingIdempotency",
    "replayVerifyOrder",
    "items_fingerprint",
    "lease_owner",
    "create_order_atomic",
    "B1B:",
    "D3:",
    "needs_recon",
    "failed_terminal",
    "reconciliation_required",
  ]) {
    assert.doesNotMatch(ORDER_SERVICE, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), forbidden);
  }
  assert.match(ORDER_SERVICE, /export async function getOrdersServer/);
});

test("BLOCKER-3 — route POST dùng writer V2 duy nhất, không còn nhánh legacy", () => {
  assert.match(ORDER_ROUTE, /from "@\/lib\/services\/orderCreateAtomicV2"/);
  assert.match(ORDER_ROUTE, /createOrderServerAtomicV2\(/);
  assert.doesNotMatch(ORDER_ROUTE, /createOrderViaAtomicRpc|resolveOrderWriterMode|GIEOMO_ORDER_WRITER|createOrderServer\b/);
  assert.match(ORDER_ROUTE, /Idempotency-Key/);
  // key từ header HOẶC body đều được chuyển qua V2 nguyên trạng (không tự sinh)
  assert.match(ORDER_ROUTE, /idempotency_key: idempotencyKey/);
  assert.match(
    ORDER_ROUTE,
    /headerKey \|\| body\?\.idempotency_key \|\| ""\) as string;/
  );
});

test("Hợp đồng D3 — mọi code 025 raise đều được V2 ánh xạ", () => {
  const sqlCodes = [...new Set(SQL025.match(/D3:[A-Z_]+/g) || [])];
  assert.ok(sqlCodes.length > 15, "hợp đồng D3 phải tồn tại trong 025");
  for (const code of sqlCodes) {
    assert.match(ORDER_V2, new RegExp(code.replace(/\$/g, "\\$")), `V2 phải xử lý ${code}`);
  }

  const tsCodes = [...new Set(ORDER_V2.match(/D3:[A-Z_]+/g) || [])];
  for (const code of tsCodes) {
    assert.match(SQL025, new RegExp(code.replace(/\$/g, "\\$")), `025 phải raise ${code}`);
  }

  // Hai mã điều khiển trạng thái KHÔNG map sang failed_terminal.
  for (const [code, expected] of [["D3:HASH_MISMATCH", "hash_mismatch"], ["D3:IN_PROGRESS", "processing"]] as const) {
    const position = ORDER_V2.indexOf(code);
    assert.ok(position >= 0, `${code} cần được xử lý riêng`);
    const after = ORDER_V2.slice(position, position + 220);
    assert.match(after, new RegExp(expected), `${code} → ${expected}`);
    assert.doesNotMatch(after, /failed_terminal/, `${code} không được map failed_terminal`);
  }
});

test("Hợp đồng scope_key — regex V025 khớp scope thật V2 sinh ra", async () => {
  const scopeBlockMatch = SQL025.match(/IF v_scope !~ '([^']+)'[\s\S]*?AND v_scope !~ '([^']+)'/);
  assert.ok(scopeBlockMatch, "025 phải có block kiểm tra scope_key");
  const guestRe = new RegExp(scopeBlockMatch[1]);
  const memberRe = new RegExp(scopeBlockMatch[2]);

  const { buildOrderIdempotencyScopeV2 } = await import("../src/lib/services/orderRequestHashV2.ts");
  const guestScope = buildOrderIdempotencyScopeV2(null, "0901234567");
  const memberScope = buildOrderIdempotencyScopeV2("00000000-0000-4000-8000-000000000901", null as unknown as string);

  assert.match(guestScope, guestRe, "scope guest của V2 phải khớp regex 025");
  assert.match(memberScope, memberRe, "scope member của V2 phải khớp regex 025");
});

test("FAIL CLOSED — writer V2 không map lỗi lạ thành failed_terminal", () => {
  const knownErrorsStart = ORDER_V2.indexOf("const knownErrors");
  assert.ok(knownErrorsStart >= 0);
  const after = ORDER_V2.slice(knownErrorsStart, knownErrorsStart + 2400);
  assert.match(after, /idempotency: match \? "failed_terminal" : undefined/);
});
