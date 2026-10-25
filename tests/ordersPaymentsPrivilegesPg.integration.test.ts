import assert from "node:assert/strict";
import test from "node:test";

/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-expect-error pg is a test-only runtime dependency without bundled TypeScript declarations.
const pg: any = await import("pg");

const databaseUrl = process.env.ATOMIC_PG_URL;
const canRun = Boolean(databaseUrl && process.env.GIEOMO_PG_ISOLATED === "1");

async function withClient<T>(run: (client: any) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

test("028 removes every runtime table privilege from order-domain tables", { skip: !canRun }, async () => {
  await withClient(async (client) => {
    const result = await client.query(`
      SELECT role_name, table_name, privilege
      FROM unnest(ARRAY['anon', 'authenticated']) role_name
      CROSS JOIN unnest(ARRAY[
        'customers', 'orders', 'order_items', 'payments', 'order_status_history'
      ]) table_name
      CROSS JOIN unnest(ARRAY[
        'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
      ]) privilege
      WHERE has_table_privilege(role_name, format('public.%I', table_name), privilege)
      ORDER BY 1, 2, 3
    `);
    assert.deepEqual(result.rows, []);
  });
});

test("028 removes runtime column and order-code sequence privileges", { skip: !canRun }, async () => {
  await withClient(async (client) => {
    const columns = await client.query(`
      SELECT role_name, c.table_name, c.column_name, privilege
      FROM information_schema.columns c
      CROSS JOIN unnest(ARRAY['anon', 'authenticated']) role_name
      CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) privilege
      WHERE c.table_schema = 'public'
        AND c.table_name IN ('orders', 'payments')
        AND has_column_privilege(
          role_name,
          format('public.%I', c.table_name),
          c.column_name,
          privilege
        )
      ORDER BY 1, 2, 3, 4
    `);
    assert.deepEqual(columns.rows, []);

    const sequence = await client.query(`
      SELECT role_name, privilege
      FROM unnest(ARRAY['anon', 'authenticated']) role_name
      CROSS JOIN unnest(ARRAY['USAGE', 'SELECT', 'UPDATE']) privilege
      WHERE has_sequence_privilege(role_name, 'public.order_code_seq', privilege)
      ORDER BY 1, 2
    `);
    assert.deepEqual(sequence.rows, []);
  });
});

test("028 leaves no permissive runtime policy and keeps RLS enabled", { skip: !canRun }, async () => {
  await withClient(async (client) => {
    const policies = await client.query(`
      SELECT tablename, policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename IN ('customers', 'orders', 'order_items', 'payments', 'order_status_history')
        AND roles && ARRAY['public', 'anon', 'authenticated']::name[]
      ORDER BY 1, 2
    `);
    assert.deepEqual(policies.rows, []);

    const rlsDisabled = await client.query(`
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname IN ('customers', 'orders', 'order_items', 'payments', 'order_status_history')
        AND NOT c.relrowsecurity
      ORDER BY 1
    `);
    assert.deepEqual(rlsDisabled.rows, []);
  });
});

test("028 preserves service-role order/payment DML", { skip: !canRun }, async () => {
  await withClient(async (client) => {
    const result = await client.query(`
      SELECT table_name, privilege
      FROM unnest(ARRAY['orders', 'payments']) table_name
      CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) privilege
      WHERE NOT has_table_privilege(
        'service_role',
        format('public.%I', table_name),
        privilege
      )
      ORDER BY 1, 2
    `);
    assert.deepEqual(result.rows, []);
  });
});

test("028 denies direct runtime INSERT into orders", { skip: !canRun }, async () => {
  for (const role of ["anon", "authenticated"]) {
    await withClient(async (client) => {
      await client.query(`SET ROLE ${role}`);
      await assert.rejects(
        client.query("INSERT INTO public.orders DEFAULT VALUES"),
        /permission denied for table orders/i
      );
    });
  }
});

