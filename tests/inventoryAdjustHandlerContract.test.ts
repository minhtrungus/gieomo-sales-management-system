import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * Batch 2G.2 — contract tests cho double-submit guard của +/- đơn lẻ
 * (handleAdjustStockSubmit, inventory/page.tsx) và nhập lẻ bulk-single.
 *
 * Page là component client 3331 dòng — không import được trong node:test
 * (Next/React runtime). File này mô phỏng cấu trúc điều khiển CHÍNH XÁC
 * của handler (guard ref đồng bộ + idempotency key ref + local-apply duy
 * nhất sau khi server xác nhận) với mock postAdjustStock/onLocalApply:
 *
 *   guard.enter() TRƯỚC await → blocked khi in-flight → finally exit
 *   key: sinh 1 lần, GIỮ qua timeout/failure, release khi thành công
 *   local apply: CHỈ continuation đầu tiên được phép cập nhật local
 *
 * Map yêu cầu → tests:
 *   H1  hai submit cùng tick → chỉ 1 request server, 1 local mutation
 *   H2  timeout (throw) → 0 local, GIỮ key; retry cùng key → 1 local total
 *   H3  timeout nhưng server đã applied → retry nhận duplicate → local đúng 1 lần
 *   H4  duplicate ngay lần gọi thấy được (retry) → local 1 lần, không 2
 *   H5  server xác nhận fail (!ok) → 0 local, GIỮ key cho retry
 *   H6  guard giải phóng sau khi xong → submit kế tiếp (thao tác mới) chạy được
 */

type PostResult = { ok: boolean; message?: string; result?: { status: string; duplicate?: boolean } };

type Deps = {
  postAdjustStock: (p: { variantId: string; delta: number; reason: string; idempotencyKey: string }) => Promise<PostResult>;
  onLocalApply: (delta: number) => void;
};

/**
 * Mirror cấu trúc handler trong page.tsx:
 * - adjustInFlightRef  ↔ guard.inFlight (ref đồng bộ, ghi trước await)
 * - adjustSubmitting   ↔ guard.submitting (state — chỉ cho UI)
 * - adjustIdemKeyRef   ↔ keyRef (sinh 1 lần, giữ qua retry, null khi thành công)
 * - handleStockUpdate  ↔ deps.onLocalApply (CHỈ sau khi res.ok, SAU finally)
 */
function createAdjustHandler(deps: Deps) {
  let inFlight = false;
  let submitting = false;
  let idemKey: string | null = null;
  let error: string | null = null;
  let keyCounter = 0;

  return {
    get inFlight() {
      return inFlight;
    },
    get submitting() {
      return submitting;
    },
    get idemKey() {
      return idemKey;
    },
    get error() {
      return error;
    },
    async submit(delta: number, reason: string): Promise<void> {
      // Guard — GIỐNG page: chặn khi đã in-flight (ref) hoặc đang submitting
      if (inFlight || submitting) return;

      error = null;
      // Đồng bộ TRƯỚC mọi await
      inFlight = true;
      submitting = true;

      if (!idemKey) {
        keyCounter += 1;
        idemKey = `key-${keyCounter}`;
      }
      const idempotencyKey = idemKey;

      try {
        const res = await deps.postAdjustStock({ variantId: "v1", delta, reason, idempotencyKey });
        if (!res.ok) {
          // Server xác nhận THẤT BẠI — không mutate local, GIỮ key
          error = res.message ?? "server fail";
          return;
        }
      } catch (caught: unknown) {
        const err = caught as { message?: string } | null;
        // Timeout/network — kết quả không xác định: không mutate local, GIỮ key
        error = err?.message ?? "network";
        return;
      } finally {
        inFlight = false;
        submitting = false;
      }

      // Server xác nhận (applied hoặc duplicate) — local apply đúng 1 lần
      deps.onLocalApply(delta);
      idemKey = null;
      error = null;
    },
  };
}

// ---- H1: hai submit cùng tick → 1 request, 1 local ----
test("H1 — hai submit liên tiếp không chờ (cùng tick) → chỉ 1 request server, 1 local mutation", async () => {
  let postCalls = 0;
  let localCalls = 0;
  const h = createAdjustHandler({
    postAdjustStock: async () => {
      postCalls += 1;
      await new Promise((r) => setTimeout(r, 5)); // giả lập network
      return { ok: true, result: { status: "applied" } };
    },
    onLocalApply: () => {
      localCalls += 1;
    },
  });

  // Click 1 + click 2 KHÔNG await giữa chừng — mô phỏng 2 event cùng tick
  const p1 = h.submit(3, "Kiểm kê");
  const p2 = h.submit(3, "Kiểm kê");
  await Promise.all([p1, p2]);

  assert.equal(postCalls, 1, "chỉ 1 request được gửi (guard ref chặn continuation thứ hai)");
  assert.equal(localCalls, 1, "chỉ 1 lần cập nhật local");
});

// ---- H2: timeout → giữ key, 0 local; retry cùng key → 1 local ----
test("H2 — timeout (throw) → không local, GIỮ idempotency key; retry cùng key → đúng 1 local", async () => {
  let localCalls = 0;
  const seenKeys: string[] = [];
  let first = true;
  const h = createAdjustHandler({
    postAdjustStock: async (p) => {
      seenKeys.push(p.idempotencyKey);
      if (first) {
        first = false;
        throw new TypeError("fetch failed"); // timeout — kết quả không xác định
      }
      return { ok: true, result: { status: "applied" } };
    },
    onLocalApply: () => {
      localCalls += 1;
    },
  });

  await h.submit(2, "Nhập kho");
  assert.equal(localCalls, 0, "timeout: KHÔNG mutate local");
  assert.ok(h.idemKey, "key phải được GIỮ sau timeout");
  const keptKey = h.idemKey;

  await h.submit(2, "Nhập kho"); // retry
  assert.equal(localCalls, 1, "retry thành công → đúng 1 local total");
  assert.equal(seenKeys.length, 2);
  assert.equal(seenKeys[0], seenKeys[1], "retry PHẢI dùng lại cùng idempotency key");
  assert.equal(keptKey, seenKeys[0]);
  assert.equal(h.idemKey, null, "key release sau khi server xác nhận thành công");
});

// ---- H3: timeout nhưng server đã applied → retry duplicate → local đúng 1 lần ----
test("H3 — timeout (server đã applied) → retry nhận duplicate → local apply đúng 1 lần (không 2)", async () => {
  let localCalls = 0;
  let first = true;
  const h = createAdjustHandler({
    postAdjustStock: async () => {
      if (first) {
        first = false;
        throw new TypeError("fetch failed");
      }
      // Server dedup: applied lần 1 (mất trong timeout), duplicate lần 2
      return { ok: true, result: { status: "duplicate", duplicate: true } };
    },
    onLocalApply: () => {
      localCalls += 1;
    },
  });

  await h.submit(5, "Nhập kho");
  assert.equal(localCalls, 0);
  await h.submit(5, "Nhập kho"); // retry → duplicate nhưng ok=true
  assert.equal(localCalls, 1, "duplicate cũng chỉ local-apply MỘT lần — server đã áp rồi, client bù local đúng 1 lần");
});

// ---- H4: duplicate ngay lần gọi thấy được → local 1 lần ----
test("H4 — response duplicate (idempotent) → ok=true, local đúng 1 lần", async () => {
  let localCalls = 0;
  const h = createAdjustHandler({
    postAdjustStock: async () => ({ ok: true, result: { status: "duplicate", duplicate: true } }),
    onLocalApply: () => {
      localCalls += 1;
    },
  });

  await h.submit(3, "Kiểm kê");
  assert.equal(localCalls, 1);
  assert.equal(h.idemKey, null);
});

// ---- H5: server fail (!ok) → 0 local, giữ key ----
test("H5 — server xác nhận thất bại (ok=false) → không local, GIỮ key để retry", async () => {
  let localCalls = 0;
  let calls = 0;
  const h = createAdjustHandler({
    postAdjustStock: async () => {
      calls += 1;
      if (calls === 1) return { ok: false, message: "Tồn kho không đủ" };
      return { ok: true, result: { status: "applied" } };
    },
    onLocalApply: () => {
      localCalls += 1;
    },
  });

  await h.submit(-99, "Xuất kho");
  assert.equal(localCalls, 0);
  assert.equal(h.error, "Tồn kho không đủ");
  assert.ok(h.idemKey, "key giữ nguyên sau fail có xác nhận");

  await h.submit(-99, "Xuất kho");
  assert.equal(localCalls, 1);
});

// ---- H6: guard giải phóng → thao tác mới chạy được ----
test("H6 — sau khi handler xong, submit kế tiếp (thao tác mới) không bị guard chặn", async () => {
  let postCalls = 0;
  const h = createAdjustHandler({
    postAdjustStock: async () => {
      postCalls += 1;
      return { ok: true, result: { status: "applied" } };
    },
    onLocalApply: () => {},
  });

  await h.submit(1, "Nhập kho");
  assert.equal(h.inFlight, false, "guard phải giải phóng trong finally");
  assert.equal(h.submitting, false);

  await h.submit(2, "Nhập kho khác");
  assert.equal(postCalls, 2, "thao tác thứ hai chạy bình thường");
  assert.notEqual(h.idemKey, "key-1", "thao tác mới có key mới sau khi key cũ đã release");
});
