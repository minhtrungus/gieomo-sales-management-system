import { test } from "node:test";
import assert from "node:assert/strict";

const pgUrl = process.env.ATOMIC_PG_URL;
const isolated = process.env.GIEOMO_PG_ISOLATED === "1";

type PgResult = { rows: Array<Record<string, unknown>> };
type PgClient = {
  connect(): Promise<void>;
  end(): Promise<void>;
  query(sql: string, values?: unknown[]): Promise<PgResult>;
};
type PgClientConstructor = new (config: { connectionString?: string }) => PgClient;

let Client: PgClientConstructor | null = null;
try {
  const dynamicImport = new Function("specifier", "return import(specifier)") as (
    specifier: string
  ) => Promise<{ Client?: PgClientConstructor }>;
  Client = (await dynamicImport("pg")).Client ?? null;
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

function createClient(): PgClient {
  assert.ok(Client, "pg Client must be available when the test is not skipped");
  return new Client({ connectionString: pgUrl });
}

function hasPgCode(error: unknown, ...codes: string[]): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  return codes.includes(String(error.code));
}

test("voucher duplicate code is rejected sequentially on isolated PostgreSQL", { skip: skipReason }, async () => {
  const client = createClient();
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
      (error: unknown) => hasPgCode(error, "23505")
    );
    await client.query("ROLLBACK");
  } finally {
    await client.end();
  }
});

test("voucher duplicate code is serialized across two isolated sessions", { skip: skipReason }, async () => {
  const first = createClient();
  const second = createClient();
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
      (error: unknown) => hasPgCode(error, "23505", "55P03")
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
