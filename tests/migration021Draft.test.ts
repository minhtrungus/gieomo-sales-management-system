import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const migrations = `${root}supabase/migrations`;
const readMigration = (name: string) => readFileSync(`${migrations}/${name}`, "utf8");

test("M1 — canonical migration chain has exactly one active 021", () => {
  const active = readdirSync(migrations).filter((name) => /^021_.*\.sql$/.test(name));
  assert.deepEqual(active, ["021_reconcile_v015_idempotency.sql"]);
});

test("M2 — 021 archives V015 contracts instead of pretending ledger provenance", () => {
  const source = readMigration("021_reconcile_v015_idempotency.sql");
  assert.match(source, /order_idempotency_v015/);
  assert.match(source, /create_order_atomic_v016_legacy/);
  assert.match(source, /cancel_order_atomic_v017_legacy/);
  assert.match(source, /REVOKE ALL ON FUNCTION/);
});

test("M3 — runtime DML revocation follows as active migration 022", () => {
  const source = readMigration("022_revoke_runtime_order_dml.sql");
  for (const table of ["customers", "orders", "order_items", "payments", "order_status_history"]) {
    assert.match(source, new RegExp(`REVOKE INSERT, UPDATE, DELETE ON public\\.${table}`));
  }
  assert.match(source, /has_table_privilege/);
  assert.match(source, /RAISE EXCEPTION/);
});

test("M4 — V025 canonical writer and V027 least privilege are present", () => {
  const v025 = readMigration("025_atomic_idempotent_order_creation.sql");
  const v027 = readMigration("027_close_runtime_read_and_rpc_bypasses.sql");
  assert.match(v025, /CREATE OR REPLACE FUNCTION public\.create_order_atomic\(p JSONB\)/);
  assert.match(v025, /REVOKE ALL ON FUNCTION public\.create_order_atomic\(JSONB\) FROM PUBLIC, anon, authenticated/);
  assert.match(v027, /ALTER DEFAULT PRIVILEGES/);
  assert.match(v027, /has_function_privilege/);
});
