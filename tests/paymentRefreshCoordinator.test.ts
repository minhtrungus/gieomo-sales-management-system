import assert from "node:assert/strict";
import test from "node:test";
import { PaymentRefreshCoordinator, shouldRefreshPayments } from "../src/lib/admin/paymentRefreshCoordinator.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test("initial refresh loads server data and duplicate polling shares one read", async () => {
  const request = deferred<string>(); const applied: string[] = []; let calls = 0;
  const coordinator = new PaymentRefreshCoordinator(() => { calls += 1; return request.promise; }, (value) => applied.push(value), () => {});
  const a = coordinator.refresh(); const b = coordinator.refresh();
  assert.equal(calls, 1); request.resolve("initial");
  assert.equal(await a, true); assert.equal(await b, true); assert.deepEqual(applied, ["initial"]);
});

test("post-mutation force waits for an older poll then performs a fresh authoritative read", async () => {
  const old = deferred<string>(); const fresh = deferred<string>(); const applied: string[] = []; let calls = 0;
  const coordinator = new PaymentRefreshCoordinator(() => (++calls === 1 ? old.promise : fresh.promise), (value) => applied.push(value), () => {});
  const polling = coordinator.refresh({ reportError: false });
  const forced = coordinator.refresh({ force: true });
  old.resolve("old"); await polling; assert.equal(calls, 2);
  fresh.resolve("fresh"); assert.equal(await forced, true); assert.deepEqual(applied, ["old", "fresh"]);
});

test("errors preserve prior data and unmount prevents late writes", async () => {
  const request = deferred<string>(); const applied: string[] = []; const errors: boolean[] = [];
  const coordinator = new PaymentRefreshCoordinator(() => request.promise, (value) => applied.push(value), (_error, report) => errors.push(report));
  const pending = coordinator.refresh(); coordinator.stop(); request.resolve("ghost");
  assert.equal(await pending, false); assert.deepEqual(applied, []); assert.deepEqual(errors, []);
});

test("reported API errors do not call the data applier", async () => {
  const applied: string[] = []; const errors: boolean[] = [];
  const coordinator = new PaymentRefreshCoordinator(async () => { throw new Error("500"); }, (value: string) => applied.push(value), (_error, report) => errors.push(report));
  assert.equal(await coordinator.refresh({ reportError: true }), false);
  assert.deepEqual(applied, []); assert.deepEqual(errors, [true]);
});

test("hidden tabs do not qualify for polling", () => {
  assert.equal(shouldRefreshPayments("hidden"), false);
  assert.equal(shouldRefreshPayments("visible"), true);
});
