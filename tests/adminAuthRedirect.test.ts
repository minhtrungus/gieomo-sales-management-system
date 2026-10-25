import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const storeSource = readFileSync(
  new URL("../src/lib/data/orderStore.ts", import.meta.url),
  "utf8"
);
const adminSidebarSource = readFileSync(
  new URL("../src/components/admin/AdminSidebar.tsx", import.meta.url),
  "utf8"
);

test("AUTH-05 — clearing an already-empty local session does not re-emit auth change", () => {
  const clearFunction = storeSource.match(
    /export function clearAdminSession\(\): void \{[\s\S]*?\n\}/
  )?.[0];

  assert.ok(clearFunction, "clearAdminSession source exists");
  assert.match(clearFunction, /const hadSession = localStorage\.getItem\("gieomo_admin_session"\) !== null/);
  assert.match(clearFunction, /if \(hadSession\) \{\s*window\.dispatchEvent\(new Event\("gieomo_admin_auth_changed"\)\)/);
});

test("admin logout revokes the server session before clearing local auth state", () => {
  const logoutFunction = adminSidebarSource.match(
    /const handleLogout = async \(\) => \{[\s\S]*?\n  \};/
  )?.[0];

  assert.ok(logoutFunction, "admin logout handler exists");
  assert.match(logoutFunction, /fetch\("\/api\/auth\/logout", \{ method: "POST" \}\)/);
  assert.match(logoutFunction, /if \(!response\.ok\)/);
  assert.ok(
    logoutFunction.indexOf("await fetch") < logoutFunction.indexOf("clearAdminSession()"),
    "server cookie is revoked before local auth state is cleared"
  );
  assert.match(logoutFunction, /window\.location\.replace\("\/admin\/login"\)/);
});
