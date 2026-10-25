import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/lib/data/orderStore.ts", import.meta.url), "utf8");

test("H29-PERF1 — concurrent forced syncs share in-flight orders/members/presence requests", () => {
  assert.match(source, /ordersSyncInFlight/);
  assert.match(source, /membersSyncInFlight/);
  assert.match(source, /presenceSyncInFlight/);
  assert.match(source, /if \(ordersSyncInFlight\) return/);
  assert.match(source, /if \(membersSyncInFlight\) return/);
  assert.match(source, /if \(presenceSyncInFlight\) return presenceSyncInFlight/);
});
