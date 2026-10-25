import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8");

test("H29-L1 — local/dev does not load Google Analytics or use a hardcoded fallback ID", () => {
  assert.match(source, /process\.env\.NODE_ENV === "production"/);
  assert.match(source, /process\.env\.NEXT_PUBLIC_GA_ID/);
  assert.doesNotMatch(source, /G-P3MJB88K1K/);
});
