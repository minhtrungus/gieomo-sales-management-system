import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const runner = readFileSync("scripts/postgres/run-r1-isolated-evidence.ps1", "utf8");
const localRunner = readFileSync("scripts/postgres/run-r1-local-evidence.ps1", "utf8");
const bootstrap = readFileSync("scripts/postgres/bootstrap_supabase_test_roles.sql", "utf8");
const evidence = readFileSync("tests/postgres/r1_isolated_evidence.sql", "utf8");

test("R1-H1 — harness creates a disposable container without exposing a host port", () => {
  assert.match(runner, /docker run --detach --name/);
  assert.match(runner, /gieomo\.test-harness=r1/);
  assert.doesNotMatch(runner, /(?:^|\s)(?:-p|--publish)(?:\s|=)/m);
  assert.doesNotMatch(runner, /ATOMIC_PG_URL|SUPABASE_SERVICE_ROLE_KEY/);
});

test("R1-H2 — harness always has exact-name teardown unless retention is explicit", () => {
  assert.match(runner, /finally\s*\{/);
  assert.match(runner, /docker rm --force \$script:ContainerName/);
  assert.match(runner, /-not \$KeepContainer/);
});

test("R1-H3 — migration order includes 013, 018, then draft 021 and draft 022", () => {
  const p013 = runner.indexOf("013_fix_rls_orders_customers_payment.rls.sql");
  const p018 = runner.indexOf("018_payments_unique_transaction.sql");
  const p021 = runner.indexOf("021_revoke_anon_insert_order_tables.sql.draft");
  const p022 = runner.indexOf("022_inbound_payment_events.sql.draft");
  assert.ok(p013 >= 0 && p013 < p018 && p018 < p021 && p021 < p022);
  assert.doesNotMatch(runner, /021_revoke_anon_insert_order_tables\.sql["']/);
  assert.doesNotMatch(runner, /022_inbound_payment_events\.sql["']/);
});

test("R1-H4 — bootstrap uses only synthetic Supabase-compatible roles/schema", () => {
  assert.match(bootstrap, /CREATE ROLE anon NOLOGIN/);
  assert.match(bootstrap, /CREATE ROLE authenticated NOLOGIN/);
  assert.match(bootstrap, /CREATE ROLE service_role NOLOGIN BYPASSRLS/);
  assert.match(bootstrap, /CREATE SCHEMA IF NOT EXISTS auth/);
});

test("R1-H5 — evidence matrix reports known atomic gaps and policy blockers explicitly", () => {
  assert.match(evidence, /R1-ATOMIC-PAYMENT-THEN-ORDER-FAIL/);
  assert.match(evidence, /R1-ATOMIC-ORDER-THEN-HISTORY-FAIL/);
  assert.match(evidence, /THEN 'FAIL' ELSE 'PASS' END/);
  assert.match(evidence, /R1-WEBHOOK-ADMIN-RACE', 'BLOCKED'/);
  assert.match(evidence, /P0-A3-CONCURRENCY-LIMITS', 'BLOCKED'/);
  assert.match(evidence, /status IN \('PASS', 'FAIL', 'SKIP', 'BLOCKED', 'NOT RUN'\)/);
});

test("R1-H6 — direct-local runner binds loopback and validates teardown scope", () => {
  assert.match(localRunner, /-h 127\.0\.0\.1 -p \$Port/);
  assert.match(localRunner, /current_setting\('data_directory'\)/);
  assert.match(localRunner, /GetDirectoryName\(\$resolvedData\) -ne \$expectedParent/);
  assert.match(localRunner, /GetFileName\(\$resolvedData\) -like "postgres-r1-\*"/);
  assert.match(localRunner, /finally\s*\{/);
  assert.match(localRunner, /pg_ctl\.exe"\) -D \$dataDirectory stop -m fast/);
  assert.doesNotMatch(localRunner, /SUPABASE_SERVICE_ROLE_KEY|docker/);
});
