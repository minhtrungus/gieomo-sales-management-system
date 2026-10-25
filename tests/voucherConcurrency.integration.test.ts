import { test } from "node:test";
import assert from "node:assert/strict";

const pgUrl = process.env.ATOMIC_PG_URL;
const isolated = process.env.GIEOMO_PG_ISOLATED === "1";
let Client: any = null;
try {
  const dynamicImport = new Function("specifier", "return import(specifier)") as (
    specifier: string
  ) => Promise<any>;
  ({ Client } = await dynamicImport("pg"));
} catch {
  // Reported as a skip below; CI installs pg ephemerally.
}

const skipReason = !isolated
  ? "GIEOMO_PG_ISOLATED=1 is required"
  : !pgUrl
    ? "ATOMIC_PG_URL is required"
    : !Client
      ? "pg module is unavailable"
      : false;

test("voucher duplicate code is rejected sequentially on isolated PostgreSQL", { skip: skipReason }, async () => {
  const client = new Client({ connectionString: pgUrl });
  await client.connect();
  const code = `ISO-VOUCHER-SEQ-${Date.now()}`;
  try {
    await client.query("BEGIN");
    const sql = `
      INSERT INTO public.vouchers
        (code, discount_type, discount_value, min_order_value, status)
      VALUES ($1, 'fixed_amount', 10000, 0, 'active')
    `;
    await client.query(sql, [code]);
    await assert.rejects(
      () => client.query(sql, [code]),
      (error: any) => error?.code === "23505"
    );
    await client.query("ROLLBACK");
  } finally {
    await client.end();
  }
});

test("voucher duplicate code is serialized across two isolated sessions", { skip: skipReason }, async () => {
  const first = new Client({ connectionString: pgUrl });
  const second = new Client({ connectionString: pgUrl });
  await first.connect();
  await second.connect();
  const code = `ISO-VOUCHER-RACE-${Date.now()}`;
  try {
    await first.query("BEGIN");
    await second.query("BEGIN");
    await second.query("SET LOCAL lock_timeout = '2s'");
    const sql = `
      INSERT INTO public.vouchers
        (code, discount_type, discount_value, min_order_value, status)
      VALUES ($1, 'fixed_amount', 10000, 0, 'active')
    `;
    await first.query(sql, [code]);
    const losing = second.query(sql, [code]);
    await first.query("COMMIT");
    await assert.rejects(
      () => losing,
      (error: any) => error?.code === "23505" || error?.code === "55P03"
    );
    await second.query("ROLLBACK");

    const count = await first.query(
      "SELECT count(*)::int AS count FROM public.vouchers WHERE code = $1",
      [code]
    );
    assert.equal(count.rows[0].count, 1);
    await first.query("DELETE FROM public.vouchers WHERE code = $1", [code]);
  } finally {
    await first.end();
    await second.end();
  }
});
