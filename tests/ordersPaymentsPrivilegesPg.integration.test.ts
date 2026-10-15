import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

// Regression gate for proposed migration 028
// (supabase/migrations/proposals/028_orders_payments_least_privilege.sql.draft).
//
// These assertions encode the POST-028 target state, which is STRICTER than
// post-027: migrations 001-027 never revoke TRUNCATE, TRIGGER, REFERENCES,
// column-level grants, or order_code_seq from anon/authenticated. Running
// this file against a 001-027-only database is EXPECTED TO FAIL until 028 is
// promoted, applied in order (after 021-027), and verified.
//
// PG-dependent: requires optional env ATOMIC_PG_URL (disposable database
// ONLY - never Production). Without it every test in this file throws and
// the batch is reported BLOCKED/NOT RUN, never PASS.

const databaseUrl = process.env.ATOMIC_PG_URL;
const psql = process.env.PSQL_BIN || "psql.exe";

function query(sql: string): string {
  if (!databaseUrl) throw new Error("ATOMIC_PG_URL is required");
  return execFileSync(
    psql,
    ["-X", "-v", "ON_ERROR_STOP=1", "-At", "-d", databaseUrl, "-c", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  ).trim();
}

const ORDER_TABLES = [
  "customers",
  "orders",
  "order_items",
  "payments",
  "order_status_history",
];

test("028: runtime roles hold no table privilege (all 7 types) on order tables", () => {
  const result = query(`
    SELECT r.role || ':' || x.tbl || ':' || x.priv
    FROM (VALUES ('anon'), ('authenticated')) AS r(role)
    CROSS JOIN (VALUES ${ORDER_TABLES.map((t) => `('${t}')`).join(", ")}) AS x(tbl)
    CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
                       ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) AS p(priv)
    WHERE has_table_privilege(r.role, format('public.%I', x.tbl), p.priv)
    ORDER BY 1;
  `);
  assert.equal(result, "");
});

test("028: runtime roles hold no column privilege on orders/payments", () => {
  const result = query(`
    SELECT r.role || ':' || c.table_name || '.' || c.column_name || ':' || x.priv
    FROM information_schema.columns c
    CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(role)
    CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES')) AS p(priv)
    WHERE c.table_schema = 'public'
      AND c.table_name IN ('orders', 'payments')
      AND has_column_privilege(
        r.role,
        format('public.%I', c.table_name),
        c.column_name,
        p.priv
      )
    ORDER BY 1;
  `);
  assert.equal(result, "");
});

test("028: runtime roles hold no privilege on order_code_seq", () => {
  const result = query(`
    SELECT r.role || ':' || x.priv
    FROM (VALUES ('anon'), ('authenticated')) AS r(role)
    CROSS JOIN (VALUES ('USAGE'), ('SELECT'), ('UPDATE')) AS x(priv)
    WHERE has_sequence_privilege(r.role, 'public.order_code_seq', x.priv)
    ORDER BY 1;
  `);
  assert.equal(result, "");
});

test("028: no permissive policy targets public/anon/authenticated on order tables", () => {
  const result = query(`
    SELECT tablename || ':' || policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (${ORDER_TABLES.map((t) => `'${t}'`).join(", ")})
      AND (roles && ARRAY['public', 'anon', 'authenticated']::name[])
    ORDER BY 1;
  `);
  assert.equal(result, "");
});

test("028: RLS remains enabled on every order-domain table", () => {
  const result = query(`
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN (${ORDER_TABLES.map((t) => `'${t}'`).join(", ")})
      AND NOT c.relrowsecurity
    ORDER BY 1;
  `);
  assert.equal(result, "");
});

test("028: service_role keeps full DML on orders/payments (valid business flow)", () => {
  const result = query(`
    SELECT x.tbl || ':' || x.priv
    FROM (VALUES ('orders'), ('payments')) AS x(tbl)
    CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) AS p(priv)
    WHERE NOT has_table_privilege('service_role', format('public.%I', x.tbl), p.priv)
    ORDER BY 1;
  `);
  assert.equal(result, "");
});

test("028: authenticated/anon INSERT into orders is denied (valid business flow)", () => {
  if (!databaseUrl) throw new Error("ATOMIC_PG_URL is required");
  for (const role of ["anon", "authenticated"]) {
    try {
      query(`SET ROLE ${role}; INSERT INTO public.orders DEFAULT VALUES;`);
      assert.fail(`${role} unexpectedly inserted into orders`);
    } catch (error) {
      const stderr = (error as { stderr?: string }).stderr || "";
      assert.match(stderr, /permission denied for table orders/i);
    }
  }
});
