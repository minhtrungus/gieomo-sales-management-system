import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { psqlBin as psql, psqlTimeoutMs } from "./helpers/psqlBin.ts";

const databaseUrl = process.env.ATOMIC_PG_URL;

function query(sql: string): string {
  if (!databaseUrl) throw new Error("ATOMIC_PG_URL is required");
  return execFileSync(psql, ["-X", "-v", "ON_ERROR_STOP=1", "-At", "-d", databaseUrl, "-c", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: psqlTimeoutMs,
  }).trim();
}

function queryFails(sql: string): string {
  if (!databaseUrl) throw new Error("ATOMIC_PG_URL is required");
  try {
    query(sql);
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr || "";
    if (stderr.trim()) return stderr;
    throw error;
  }
  assert.fail("query unexpectedly succeeded");
}

test("runtime roles cannot read or mutate order-domain tables", () => {
  const result = query(`
    SELECT grantee || ':' || table_name || ':' || privilege_type
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND grantee IN ('anon', 'authenticated')
      AND table_name IN ('customers', 'orders', 'order_items', 'payments', 'order_status_history')
      AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
    ORDER BY 1;
  `);
  assert.equal(result, "");
});

test("RLS has no permissive runtime policy on order-domain tables", () => {
  const result = query(`
    SELECT tablename || ':' || policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('customers', 'orders', 'order_items', 'payments', 'order_status_history')
      AND (roles && ARRAY['public', 'anon', 'authenticated']::name[])
    ORDER BY 1;
  `);
  assert.equal(result, "");
});

test("sensitive RPCs are service-role only", () => {
  const result = query(`
    SELECT p.oid::regprocedure::text
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.oid::regprocedure::text IN (
        'deduct_variant_stock_atomic(uuid,integer)',
        'adjust_variant_stock(uuid,integer,text,text,uuid)',
        'apply_payment_event(jsonb)',
        'create_order_atomic(jsonb)',
        'cancel_order_atomic(jsonb)'
      )
      AND (
        has_function_privilege(0::oid, p.oid, 'EXECUTE')
        OR has_function_privilege('anon', p.oid, 'EXECUTE')
        OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
        OR NOT has_function_privilege('service_role', p.oid, 'EXECUTE')
      )
    ORDER BY 1;
  `);
  assert.equal(result, "");
});

test("authenticated cannot invoke atomic cancellation but service_role can", () => {
  const denied = queryFails("SET ROLE authenticated; SELECT public.cancel_order_atomic('{}'::jsonb);");
  assert.match(denied, /permission denied for function cancel_order_atomic/i);
  assert.match(
    query("SET ROLE service_role; SELECT public.cancel_order_atomic('{}'::jsonb)->>'outcome';"),
    /invalid_identity$/
  );
});

test("runtime roles receive no permissive future-object defaults", () => {
  const result = query(`
    SELECT defaclobjtype::text || ':' || grantee::regrole::text || ':' || privilege_type
    FROM pg_default_acl d
    CROSS JOIN LATERAL aclexplode(d.defaclacl)
    WHERE d.defaclnamespace = 'public'::regnamespace
      AND (grantee = 0 OR grantee::regrole::text IN ('anon', 'authenticated'))
      AND defaclobjtype IN ('r', 'S', 'f')
    ORDER BY 1;
  `);
  assert.equal(result, "");
});
