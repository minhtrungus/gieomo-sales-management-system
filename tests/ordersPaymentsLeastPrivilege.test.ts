import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const migrationPath = join(
  root,
  "supabase",
  "migrations",
  "028_orders_payments_least_privilege.sql"
);

function walkSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walkSourceFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const sourceFiles = walkSourceFiles(join(root, "src"));

test("028 revokes the full runtime privilege surface on order tables", () => {
  const sql = readFileSync(migrationPath, "utf8");
  for (const table of [
    "customers",
    "orders",
    "order_items",
    "payments",
    "order_status_history",
  ]) {
    assert.match(
      sql,
      new RegExp(`REVOKE ALL ON public\\.${table} FROM anon, authenticated`),
      `missing table-level REVOKE ALL for ${table}`
    );
    assert.match(
      sql,
      new RegExp(`DROP POLICY IF EXISTS \\"Public insert ${table}\\"`),
      `missing Public insert drop for ${table}`
    );
  }
  assert.match(sql, /REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated/);
  assert.match(sql, /has_table_privilege\(/);
  assert.match(sql, /has_column_privilege\(/);
  assert.match(sql, /has_sequence_privilege\(/);
  assert.match(sql, /relrowsecurity/);
  assert.match(sql, /028: runtime table privileges remain/);
  assert.match(sql, /028: service_role lost order-domain access/);
});

test("028 is canonical and auto-applied after approval", () => {
  assert.ok(migrationPath.endsWith("028_orders_payments_least_privilege.sql"));
  const migrationFiles = readdirSync(join(root, "supabase", "migrations")).filter((name) =>
    /^\d{3}_.*\.sql$/.test(name)
  );
  assert.ok(migrationFiles.includes("028_orders_payments_least_privilege.sql"));
});

test("every orders/payments PostgREST callsite uses the service-role admin client", () => {
  const offenders: string[] = [];
  for (const file of sourceFiles) {
    const text = readFileSync(file, "utf8");
    if (!/\.from\(\s*["'](orders|payments)["']/.test(text)) continue;
    if (!/createAdminClient|lib\/supabase\/admin/.test(text)) {
      offenders.push(file.slice(root.length + 1));
    }
  }
  assert.deepEqual(offenders, []);
});

test("no src file imports the anon browser/server Supabase clients", () => {
  const offenders: string[] = [];
  for (const file of sourceFiles) {
    const text = readFileSync(file, "utf8");
    if (/from\s+["']@\/lib\/supabase\/(client|server)["']/.test(text)) {
      offenders.push(file.slice(root.length + 1));
    }
  }
  assert.deepEqual(offenders, []);
});
