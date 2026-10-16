import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const migrationDirectory = join(process.cwd(), "supabase", "migrations");
const expected = [
  "001_initial_schema.sql",
  "002_grant_permissions_and_rls.sql",
  "003_system_configs_and_crud_rls.sql",
  "004_contact_messages_and_catalog_rls.sql",
  "005_social_media_system_configs.sql",
  "006_add_password_hash_to_members.sql",
  "007_storage_buckets_and_rls.sql",
  "008_product_reviews.sql",
  "009_ensure_product_relationships.sql",
  "010_add_image_url_to_product_variants.sql",
  "011_fix_rls_security_policies.sql",
  "012_atomic_stock_and_rls_hardening.sql",
  "013_fix_rls_orders_customers_payment.rls.sql",
  "014_add_freeship_discount_type.sql",
  "015_order_idempotency.sql",
  "016_create_order_atomic.sql",
  "017_cancel_order_atomic.sql",
  "018_payments_unique_transaction.sql",
  "019_inventory_adjustments.sql",
  "020_ledger_delete_policy.sql",
  "021_reconcile_v015_idempotency.sql",
  "022_revoke_runtime_order_dml.sql",
  "023_payment_integrity.sql",
  "024_repair_payment_cash_contract.sql",
  "025_atomic_idempotent_order_creation.sql",
  "026_atomic_order_cancellation.sql",
  "027_close_runtime_read_and_rpc_bypasses.sql",
  "028_orders_payments_least_privilege.sql",
  "029_atomic_payment_rejection.sql",
  "030_atomic_combo_persistence.sql",
];

test("the migration chain has exactly one SQL file for 001 through 030", () => {
  const actual = readdirSync(migrationDirectory)
    .filter((name) => /^\d{3}_.*\.sql$/.test(name))
    .sort();
  assert.deepEqual(actual, expected);
});

test("migration 027 closes authenticated reads and the legacy stock RPC", () => {
  const sql = readFileSync(join(migrationDirectory, expected[26]), "utf8");
  assert.match(sql, /REVOKE SELECT ON public\.orders FROM anon, authenticated/);
  assert.match(sql, /deduct_variant_stock_atomic\(UUID, INTEGER\)/);
  assert.match(sql, /ALTER DEFAULT PRIVILEGES IN SCHEMA public/);
});

test("no enum type is defined unguarded by more than one migration", () => {
  const owners = new Map<string, string[]>();
  for (const name of expected) {
    const sql = readFileSync(join(migrationDirectory, name), "utf8");
    const doBlocks = [...sql.matchAll(/DO \$\$([\s\S]*?)END \$\$\;/g)].map((m) => m[0]);
    for (const match of sql.matchAll(/CREATE TYPE\s+(\w+)\s+AS ENUM/g)) {
      const typeName = match[1];
      const enclosingBlock = doBlocks.find(
        (block) => block.indexOf(match[0]) !== -1
      );
      const guarded =
        enclosingBlock !== undefined &&
        /EXCEPTION\s+WHEN duplicate_object/.test(enclosingBlock);
      if (!guarded) {
        owners.set(typeName, [...(owners.get(typeName) ?? []), name]);
      }
    }
  }
  const duplicated = [...owners.entries()].filter(([, files]) => files.length > 1);
  assert.deepEqual(
    duplicated,
    [],
    `unguarded duplicate CREATE TYPE found: ${JSON.stringify(duplicated)}`
  );
  assert.deepEqual(owners.get("order_status"), ["001_initial_schema.sql"]);
});

test("migration 022 closes direct runtime order writes", () => {
  const sql = readFileSync(join(migrationDirectory, expected[21]), "utf8");
  for (const table of ["customers", "orders", "order_items", "payments", "order_status_history"]) {
    assert.match(sql, new RegExp(`REVOKE INSERT, UPDATE, DELETE ON public\\.${table}`));
    assert.match(sql, new RegExp(`DROP POLICY IF EXISTS \\"Public insert ${table}\\"`));
  }
});
