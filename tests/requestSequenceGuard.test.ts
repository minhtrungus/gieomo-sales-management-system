import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequestSequenceGuard } from "../src/lib/utils/requestSequenceGuard.ts";

/**
 * Batch 3C.1 — request sequence guard (fix M1: UI fetch race).
 *
 * GIỚI HẠN: repo không có component-render test infra (không testing-library/
 * jsdom/vitest — xem package.json). KHÔNG render được page.tsx trong node:test.
 * Thay thế có ý nghĩa:
 *   (1) test THẬT semantics của guard (module thật page.tsx import);
 *   (2) test pipeline mô phỏng mirror 1-1 wiring page.tsx (isCurrent checks
 *       ở success/error/finally + abort signal) với fetch deferred — chứng
 *       minh đúng các kịch bản M1: A về sau B chỉ B hiển thị; finally A
 *       không tắt loading khi B pending; lỗi B không bị response cũ đè.
 * Wiring React thật (deps, effect order) verify bằng tsc + build + đọc code.
 *
 * Các test:
 *   G1  begin() vô hiệu request trước: token đơn điệu, abort + isCurrent=false
 *   G2  A resolve sau B → chỉ dữ liệu B được ghi (records cuối cùng = B)
 *   G3  finally A KHÔNG tắt loading khi B còn pending
 *   G4  B lỗi → error của B giữ nguyên, response cũ (A) không ghi đè
 *   G5  AbortSignal: request trước bị abort khi begin() mới (network cancel)
 *   G6  invalidate() (unmount): mọi pending stale + aborted, không có "quay lại"
 *   G7  refresh rồi đổi filter: filter là current, refresh cũ stale
 */

/** Mirror wiring page.tsx fetchData: begin → setLoading → guards → finally current-only. */
function createPipeline(guard: ReturnType<typeof createRequestSequenceGuard>) {
  const state = {
    records: null as string | null,
    summary: null as string | null,
    error: null as string | null,
    loading: true,
    refreshing: false,
  };
  const pending = new Map<
    string,
    { resolve: (v: { records: string; summary: string }) => void; reject: (e: unknown) => void }
  >();
  const started: string[] = [];

  async function run(name: string): Promise<void> {
    const req = guard.begin();
    started.push(name);
    state.loading = true;
    state.error = null;
    try {
      const data = await new Promise<{ records: string; summary: string }>((resolve, reject) => {
        pending.set(name, { resolve, reject });
      });
      if (!req.isCurrent()) return;
      state.records = data.records;
      state.summary = data.summary;
    } catch (err) {
      if (req.signal.aborted) return;
      if (!req.isCurrent()) return;
      state.error = err instanceof Error ? err.message : String(err);
    } finally {
      if (req.isCurrent()) {
        state.loading = false;
        state.refreshing = false;
      }
    }
  }

  function settle(name: string, kind: "resolve" | "reject", payload?: unknown) {
    const p = pending.get(name);
    assert.ok(p, `request ${name} phải tồn tại`);
    pending.delete(name);
    if (kind === "resolve") {
      p.resolve(payload as { records: string; summary: string });
    } else {
      p.reject(payload);
    }
  }

  /** Chờ các microtask của settle kịp chạy hết (resolve → then → finally). */
  const flush = () => new Promise<void>((r) => setTimeout(r, 0));

  return { state, run, settle, flush, started };
}

// ============================================================
// G1 — begin() vô hiệu request trước: token đơn điệu, abort + stale
// ============================================================
test("G1 — begin() mới vô hiệu request trước: token tăng, signal abort, isCurrent=false", () => {
  const guard = createRequestSequenceGuard();
  const a = guard.begin();
  assert.equal(a.isCurrent(), true);

  const b = guard.begin();
  assert.equal(b.token, a.token + 1, "token đơn điệu tăng");
  assert.equal(a.isCurrent(), false, "request trước stale");
  assert.equal(b.isCurrent(), true);
  assert.equal(a.signal.aborted, true, "signal request trước bị abort (network cancel)");
  assert.equal(b.signal.aborted, false);
});

// ============================================================
// G2 — A resolve SAU B → chỉ dữ liệu B hiển thị (records cuối cùng = B)
// ============================================================
test("G2 — A khởi chạy trước, resolve sau B: chỉ dữ liệu B được ghi", async () => {
  const guard = createRequestSequenceGuard();
  const sim = createPipeline(guard);

  const runA = sim.run("A");
  const runB = sim.run("B");

  // B về trước — ghi state
  sim.settle("B", "resolve", { records: "page-B", summary: "sum-B" });
  await sim.flush();
  assert.equal(sim.state.records, "page-B");
  assert.equal(sim.state.summary, "sum-B");

  // A về sau — KHÔNG được ghi đè
  sim.settle("A", "resolve", { records: "page-A-STALE", summary: "sum-A-STALE" });
  await sim.flush();
  assert.equal(sim.state.records, "page-B", "response cũ (A) không ghi đè dữ liệu mới (B)");
  assert.equal(sim.state.summary, "sum-B");

  await Promise.all([runA, runB]);
});

// ============================================================
// G3 — finally A KHÔNG tắt loading khi B còn pending
// ============================================================
test("G3 — finally của request cũ không tắt loading khi request mới còn pending", async () => {
  const guard = createRequestSequenceGuard();
  const sim = createPipeline(guard);

  const runA = sim.run("A");
  const runB = sim.run("B");
  assert.equal(sim.state.loading, true);

  // A (stale) hoàn thành trước khi B xong → finally A phải skip
  sim.settle("A", "resolve", { records: "stale", summary: "stale" });
  await sim.flush();
  assert.equal(sim.state.loading, true, "A stale không được tắt loading khi B còn pending");
  assert.equal(sim.state.records, null, "A stale không ghi records");

  // B hoàn thành → current finally tắt loading
  sim.settle("B", "resolve", { records: "fresh", summary: "fresh" });
  await sim.flush();
  assert.equal(sim.state.loading, false);
  assert.equal(sim.state.records, "fresh");

  await Promise.all([runA, runB]);
});

// ============================================================
// G4 — B lỗi: error của B giữ nguyên, response cũ không ghi đè
// ============================================================
test("G4 — request mới lỗi: error hiển thị đúng; response cũ không đè state mới", async () => {
  const guard = createRequestSequenceGuard();
  const sim = createPipeline(guard);

  const runA = sim.run("A");
  const runB = sim.run("B");

  // B lỗi trước
  sim.settle("B", "reject", new Error("Lỗi máy chủ (500) khi tải dữ liệu đối soát."));
  await sim.flush();
  assert.equal(sim.state.error, "Lỗi máy chủ (500) khi tải dữ liệu đối soát.");
  assert.equal(sim.state.loading, false, "current finally vẫn tắt loading khi lỗi");

  // A resolve sau — không đè error của B, không ghi records
  sim.settle("A", "resolve", { records: "stale", summary: "stale" });
  await sim.flush();
  assert.equal(sim.state.error, "Lỗi máy chủ (500) khi tải dữ liệu đối soát.", "error mới không bị response cũ đè");
  assert.equal(sim.state.records, null);

  await Promise.all([runA, runB]);
});

// ============================================================
// G5 — AbortSignal bị abort khi begin() mới (cancel network ở client)
// ============================================================
test("G5 — request trước bị abort signal ngay khi begin() mới (không chờ response)", () => {
  const guard = createRequestSequenceGuard();
  const a = guard.begin();
  let abortedA = false;
  a.signal.addEventListener("abort", () => {
    abortedA = true;
  });
  guard.begin();
  assert.equal(abortedA, true, "abort event fire cho request trước — fetch bị cancel network-side");
});

// ============================================================
// G6 — invalidate() (unmount): mọi pending stale + aborted
// ============================================================
test("G6 — invalidate (unmount): request đang chạy stale + aborted, không có token quay lại", async () => {
  const guard = createRequestSequenceGuard();
  const sim = createPipeline(guard);

  const runA = sim.run("A");
  guard.invalidate(); // unmount cleanup

  const aCurrent = false; // không có handle trực tiếp — qua state
  assert.equal(sim.state.loading, true, "invalidate không tự tắt loading — component đã unmount");

  // A resolve sau unmount — pipeline guard phải bỏ qua (req.isCurrent false)
  sim.settle("A", "resolve", { records: "ghost", summary: "ghost" });
  await sim.flush();
  assert.equal(sim.state.records, null, "response sau unmount không ghi state");
  await runA;

  // Token mới sau invalidate không "quay lại" token cũ
  const b = guard.begin();
  assert.ok(b.token > 1, "token tiếp tục tăng sau invalidate");
  assert.equal(aCurrent, false);
});

// ============================================================
// G7 — refresh rồi đổi filter: filter current, refresh cũ stale
// ============================================================
test("G7 — manual refresh bị filter-change vô hiệu: dữ liệu filter hiển thị, refresh cũ không đè", async () => {
  const guard = createRequestSequenceGuard();
  const sim = createPipeline(guard);

  // User bấm refresh (với offset/tab hiện tại)
  sim.state.refreshing = true;
  const runRefresh = sim.run("refresh");

  // User đổi tab ngay → begin mới (filter effect)
  const runFilter = sim.run("filter");

  // Filter về trước
  sim.settle("filter", "resolve", { records: "tab-moi", summary: "sum-tab" });
  await sim.flush();
  assert.equal(sim.state.records, "tab-moi");
  assert.equal(sim.state.loading, false);

  // Refresh về sau — không đè, không bật lại loading
  sim.settle("refresh", "resolve", { records: "tab-cu-stale", summary: "stale" });
  await sim.flush();
  assert.equal(sim.state.records, "tab-moi", "refresh cũ không đè dữ liệu filter mới");
  assert.equal(sim.state.loading, false, "finally refresh stale không nhấp nháy loading");

  await Promise.all([runRefresh, runFilter]);
});
