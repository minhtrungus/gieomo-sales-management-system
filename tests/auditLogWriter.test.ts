import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("L1 — atomic payment RPC writes history, audit and event in one function", () => {
  const migration = read("../supabase/migrations/023_payment_integrity.sql");
  const start = migration.indexOf("CREATE OR REPLACE FUNCTION public.apply_payment_event");
  const end = migration.indexOf("REVOKE ALL ON FUNCTION public.apply_payment_event", start);
  const rpc = migration.slice(start, end);
  assert.match(rpc, /INSERT INTO public\.payments/);
  assert.match(rpc, /UPDATE public\.orders/);
  assert.match(rpc, /INSERT INTO public\.order_status_history/);
  assert.match(rpc, /INSERT INTO public\.audit_logs/);
  assert.match(rpc, /INSERT INTO public\.payment_events/);
});

test("L2 — payment audit actor is the authenticated admin supplied to RPC", () => {
  const route = read("../src/app/api/orders/payment/route.ts");
  const migration = read("../supabase/migrations/023_payment_integrity.sql");
  assert.match(route, /admin_member_id:\s*authCheck\.user\.memberId/);
  assert.match(migration, /v_admin_id\s+UUID/);
  assert.match(migration, /changed_by_member_id/);
  assert.match(migration, /actor_member_id/);
});

test("L3 — payment audit data excludes customer and bank payloads", () => {
  const migration = read("../supabase/migrations/023_payment_integrity.sql");
  const auditStart = migration.indexOf("INSERT INTO public.audit_logs", migration.indexOf("CREATE OR REPLACE FUNCTION public.apply_payment_event"));
  const auditEnd = migration.indexOf("INSERT INTO public.payment_events", auditStart);
  const audit = migration.slice(auditStart, auditEnd);
  assert.match(audit, /payment_status/);
  assert.match(audit, /order_status/);
  assert.match(audit, /outcome/);
  assert.doesNotMatch(audit, /buyer_|receiver_|account_number|gateway|payload_fingerprint/);
});

test("L4 — application writers cannot bypass the atomic payment audit", () => {
  const payment = read("../src/app/api/orders/payment/route.ts");
  const webhook = read("../src/app/api/webhook/sepay/route.ts");
  for (const source of [payment, webhook]) {
    assert.match(source, /\.rpc\("apply_payment_event"/);
    assert.doesNotMatch(source, /\.from\("payments"\)\.insert/);
    assert.doesNotMatch(source, /payment_status:\s*["']paid["']/);
  }
});
