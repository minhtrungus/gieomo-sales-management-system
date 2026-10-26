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
  "031_optional_combo_variant_persistence.sql",
  "032_controlled_order_deletion.sql",
  "033_order_item_variant_swap.sql",
  "034_harden_order_deletion_and_mark_duplicates.sql",
  "035_combo_wildcard_checkout.sql",
  "036_preserve_order_source_delivery_pickup_guidance.sql",
  "037_preserve_order_source_delivery_writer.sql",
  "038_order_deletion_idempotency_cleanup.sql",
  "039_controlled_payment_confirmation_adjustment.sql",
  "040_payment_reminders.sql",
];

test("the migration chain has exactly one SQL file for 001 through 040", () => {
  const actual = readdirSync(migrationDirectory)
    .filter((name) => /^\d{3}_.*\.sql$/.test(name))
    .sort();
  assert.deepEqual(actual, expected);
});

test("migration 022 closes direct runtime order writes", () => {
  const sql = readFileSync(join(migrationDirectory, expected[21]), "utf8");
  for (const table of ["customers", "orders", "order_items", "payments", "order_status_history"]) {
    assert.match(sql, new RegExp(`REVOKE INSERT, UPDATE, DELETE ON public\\.${table}`));
    assert.match(sql, new RegExp(`DROP POLICY IF EXISTS \\"Public insert ${table}\\"`));
  }
});
