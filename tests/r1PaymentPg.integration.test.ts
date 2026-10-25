import { test } from "node:test";
import assert from "node:assert/strict";

/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-expect-error pg is optional; this file reports NOT RUN when the driver is absent.
const pgMod: any = await import("pg").catch(() => null);
const connectionString = process.env.ATOMIC_PG_URL;
const isolatedAcknowledged = process.env.GIEOMO_PG_ISOLATED === "1";
const canRun = Boolean(pgMod && connectionString && isolatedAcknowledged);
const skipReason = !pgMod
  ? "missing optional pg module — NOT RUN"
  : !connectionString
    ? "missing ATOMIC_PG_URL — NOT RUN"
    : !isolatedAcknowledged
      ? "GIEOMO_PG_ISOLATED=1 is required to confirm a disposable target — NOT RUN"
      : "";

function client(): any {
  return new pgMod.Client({ connectionString });
}

async function hasFunction(db: any, signature: string): Promise<boolean> {
  const result = await db.query("SELECT to_regprocedure($1) IS NOT NULL AS present", [signature]);
  return Boolean(result.rows[0]?.present);
}

test("R1-PG1 — two concurrent deliveries of one provider identity produce one ledger row", async (t) => {
  if (!canRun) return t.skip(skipReason);
  const a = client();
  const b = client();
  await Promise.all([a.connect(), b.connect()]);
  const provider = `r1-pg-${crypto.randomUUID()}`;
  const providerTransactionId = `tx-${crypto.randomUUID()}`;
  const payload = {
    provider,
    provider_transaction_id: providerTransactionId,
    received_amount: 100000,
    classification: "unmatched_reference",
    processing_status: "review_required",
    payload_fingerprint: "synthetic-fingerprint",
  };
  try {
    if (!(await hasFunction(a, "public.record_inbound_payment_event(jsonb)"))) {
      return t.skip("draft 022 is not applied on the isolated target — NOT RUN");
    }
    await Promise.all([
      a.query("SELECT public.record_inbound_payment_event($1::jsonb)", [JSON.stringify(payload)]),
      b.query("SELECT public.record_inbound_payment_event($1::jsonb)", [JSON.stringify(payload)]),
    ]);
    const result = await a.query(
      `SELECT count(*)::int AS rows, max(delivery_count)::int AS deliveries
         FROM public.inbound_payment_events
        WHERE provider = $1 AND provider_transaction_id = $2`,
      [provider, providerTransactionId]
    );
    assert.deepEqual(result.rows[0], { rows: 1, deliveries: 2 });
  } finally {
    await a.query(
      "DELETE FROM public.inbound_payment_events WHERE provider = $1 AND provider_transaction_id = $2",
      [provider, providerTransactionId]
    ).catch(() => undefined);
    await Promise.all([a.end(), b.end()]);
  }
});

test("R1-PG2 — unknown-order and underpayment events are durable review records", async (t) => {
  if (!canRun) return t.skip(skipReason);
  const db = client();
  await db.connect();
  const token = crypto.randomUUID();
  const customerId = crypto.randomUUID();
  const orderId = crypto.randomUUID();
  const provider = `r1-pg-${token}`;
  try {
    if (!(await hasFunction(db, "public.record_inbound_payment_event(jsonb)"))) {
      return t.skip("draft 022 is not applied on the isolated target — NOT RUN");
    }
    await db.query(
      "INSERT INTO public.customers (customer_id, full_name, phone) VALUES ($1, $2, $3)",
      [customerId, "R1 PG synthetic", `09${token.replaceAll("-", "").slice(0, 8)}`]
    );
    await db.query(
      `INSERT INTO public.orders
        (order_id, order_code, customer_id, receiver_name, receiver_phone, delivery_type,
         subtotal, final_amount, order_status, payment_status, payment_method)
       VALUES ($1, $2, $3, 'R1 PG synthetic', '0900000000', 'home_delivery',
               100000, 100000, 'pending', 'pending', 'banking')`,
      [orderId, `GM-${token.slice(0, 8).toUpperCase()}`, customerId]
    );
    const events = [
      {
        provider,
        provider_transaction_id: `unknown-${token}`,
        matched_order_code: "GM-NOT-FOUND",
        received_amount: 50000,
        classification: "unmatched_order",
        processing_status: "review_required",
        payload_fingerprint: `unknown-${token}`,
      },
      {
        provider,
        provider_transaction_id: `under-${token}`,
        matched_order_id: orderId,
        matched_order_code: `GM-${token.slice(0, 8).toUpperCase()}`,
        received_amount: 50000,
        expected_amount_snapshot: 100000,
        classification: "underpaid",
        processing_status: "review_required",
        payload_fingerprint: `under-${token}`,
      },
    ];
    for (const event of events) {
      await db.query("SELECT public.record_inbound_payment_event($1::jsonb)", [JSON.stringify(event)]);
    }
    const result = await db.query(
      `SELECT classification, processing_status
         FROM public.inbound_payment_events
        WHERE provider = $1 ORDER BY classification`,
      [provider]
    );
    assert.deepEqual(result.rows, [
      { classification: "underpaid", processing_status: "review_required" },
      { classification: "unmatched_order", processing_status: "review_required" },
    ]);
  } finally {
    await db.query("DELETE FROM public.inbound_payment_events WHERE provider = $1", [provider]).catch(() => undefined);
    await db.query("DELETE FROM public.orders WHERE order_id = $1", [orderId]).catch(() => undefined);
    await db.query("DELETE FROM public.customers WHERE customer_id = $1", [customerId]).catch(() => undefined);
    await db.end();
  }
});

test("R1-PG3 — draft 021 effective ACL matrix matches runtime-role contract", (t) => {
  // SUPERSEDED (canonical 027/028 — sau batch R1): matrix này được viết cho
  // rehearsal sequence `...→ draft 021 → draft 022` (docs/engineering/
  // R1_PAYMENT_INTEGRITY_REMEDIATION.md, RLS_P0A3_REMEDIATION.md) và chỉ PASS
  // trên target rehearsal đó — toàn bộ lịch sử PASS của nó là draft-era.
  // Canonical 027 revoke SELECT authenticated trên orders/payments, còn 028
  // REVOKE ALL table/column/sequence của anon+authenticated trên 5 bảng
  // order-domain — assert `authenticated_select=true` và các SET ROLE read
  // probe trong test này không còn đúng schema canonical.
  // Posture canonical đã được assert thật (has_table_privilege + SET ROLE
  // denial + RLS/policy) trong tests/ordersPaymentsPrivilegesPg.integration.test.ts (mandatory).
  t.skip("superseded: draft-021 matrix replaced by canonical 027/028 posture, covered by tests/ordersPaymentsPrivilegesPg.integration.test.ts");
});

test("R1-PG4 — webhook/admin apply race", (t) => {
  // SUPERSEDED (batch PAYMENT-ATOMICITY-P1P2): apply_payment_event đã tồn tại
  // (migration 023) và race webhook+admin hai code được probe thật qua RPC
  // trong tests/paymentApplyFaultPg.integration.test.ts (P2-A, mandatory).
  // Skip giữ nguyên để bảo toàn lịch sử R1 (ma trận draft 021/022 không re-run).
  t.skip("superseded: covered by tests/paymentApplyFaultPg.integration.test.ts P2-A");
});

test("R1-PG5 — payment/order/history fault injection", (t) => {
  // SUPERSEDED (batch PAYMENT-ATOMICITY-P1P2): fault injection qua trigger cho
  // apply_payment_event (payments / orders / order_status_history) được probe
  // thật trong tests/paymentApplyFaultPg.integration.test.ts (P1-A/B/C, mandatory).
  t.skip("superseded: covered by tests/paymentApplyFaultPg.integration.test.ts P1-A/B/C");
});

test("P0-A3-PG — quantity and aggregate concurrency remains BLOCKED", (t) => {
  t.skip("BLOCKED: limits and create_order_atomic_v2 are not approved or implemented");
});
