import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../src/app/admin/payments/page.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../src/app/api/admin/payments/route.ts", import.meta.url), "utf8");

test("payment page loads a dedicated read-only server feed", () => {
  assert.match(page, /fetch\("\/api\/admin\/payments"/);
  assert.doesNotMatch(page, /\/api\/admin\/reconciliation/);
  assert.match(route, /export async function GET/);
  assert.doesNotMatch(route, /export async function (?:POST|PATCH|DELETE)/);
  assert.match(route, /requireAdmin/);
});

test("initial, visible interval, focus and mutation refresh use the coordinator", () => {
  assert.match(page, /void refreshAuthoritativeData\(\)/);
  assert.match(page, /setInterval\(refreshWhenVisible, 30_000\)/);
  assert.match(page, /addEventListener\("focus", refreshWhenVisible\)/);
  assert.match(page, /visibilitychange/);
  assert.match(page, /refreshAuthoritativeData\(true, true\)/);
});
