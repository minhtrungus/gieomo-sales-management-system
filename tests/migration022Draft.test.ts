import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";

const draftUrl = new URL("../supabase/migrations/proposals/022_inbound_payment_events.sql.draft", import.meta.url);

test("R1-M1 — proposal 022 tồn tại dưới proposals và không phải active migration", async () => {
  const sql = await readFile(draftUrl, "utf8");
  assert.match(draftUrl.pathname, /proposals\/022_inbound_payment_events\.sql\.draft$/);
  assert.match(sql, /DRAFT — KHÔNG APPLY/);
  await assert.rejects(access(new URL("../supabase/migrations/022_inbound_payment_events.sql", import.meta.url)));
});

test("R1-M2 — provider identity unique, order nullable, amount dương", async () => {
  const sql = await readFile(draftUrl, "utf8");
  assert.match(sql, /matched_order_id UUID REFERENCES public\.orders\(order_id\) ON DELETE SET NULL/);
  assert.match(sql, /CHECK \(received_amount > 0\)/);
  assert.match(sql, /UNIQUE \(provider, provider_transaction_id\)/);
});

test("R1-M3 — classification bao phủ failure modes nhưng không tự update order/payment", async () => {
  const sql = await readFile(draftUrl, "utf8");
  for (const value of ["unmatched_reference", "unmatched_order", "underpaid", "matched", "overpaid", "paid_order_additional_transfer", "duplicate_delivery"]) {
    assert.match(sql, new RegExp(`'${value}'`));
  }
  const functionBody = sql.split("CREATE OR REPLACE FUNCTION")[1] || "";
  assert.doesNotMatch(functionBody, /UPDATE\s+public\.orders/i);
  assert.doesNotMatch(functionBody, /INSERT\s+INTO\s+public\.payments/i);
});

test("R1-M4 — anon/authenticated bị revoke; chỉ service_role execute", async () => {
  const sql = await readFile(draftUrl, "utf8");
  assert.match(sql, /REVOKE ALL ON public\.inbound_payment_events FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.record_inbound_payment_event\(JSONB\)[\s\S]*FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.record_inbound_payment_event\(JSONB\) TO service_role/);
});
