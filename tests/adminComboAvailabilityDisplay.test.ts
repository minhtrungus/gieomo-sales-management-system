import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../src/app/admin/combos/page.tsx", import.meta.url),
  "utf8",
);

test("H29-C3 — admin combo render trạng thái availability, không ép mọi trạng thái về số 0", () => {
  assert.match(source, /getComboAvailabilityStatus/);
  assert.match(source, /getComboAvailabilityLabel/);
  assert.doesNotMatch(source, /<span>\{vStock\} bộ khả dụng<\/span>/);
});
