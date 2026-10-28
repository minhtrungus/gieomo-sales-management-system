import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const text = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("migration chain is contiguous through 044", () => {
  const files = readdirSync(new URL("../supabase/migrations/", import.meta.url))
    .filter((name) => /^\d{3}_.+\.sql$/.test(name))
    .sort();

  assert.equal(files.length, 44);
  assert.equal(files[0], "001_initial_schema.sql");
  assert.equal(files.at(-1), "044_combo_bottom_up_allocation.sql");
  assert.deepEqual(
    files.map((name) => Number(name.slice(0, 3))),
    Array.from({ length: 44 }, (_, index) => index + 1)
  );
});

test("migration validator accepts the canonical chain and enforces tip 044", () => {
  const result = spawnSync(process.execPath, ["scripts/migrations/validate-chain.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, GIEOMO_EXPECTED_MIGRATION_TIP: "044" },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(result.stdout) as { count: number; tip: string };
  assert.deepEqual({ count: manifest.count, tip: manifest.tip }, { count: 44, tip: "044" });
});

test("CI replays migrations on isolated PostgreSQL and makes PG tests mandatory", () => {
  const workflow = text(".github/workflows/go-live-gates.yml");
  const packageJson = text("package.json");
  const mandatoryRunner = text("scripts/postgres/run-mandatory-pg-tests.mjs");
  const sourceRunner = text("scripts/tests/run-source-tests.mjs");
  assert.match(workflow, /services:\s*\n\s+postgres:/);
  assert.match(workflow, /GIEOMO_PG_ISOLATED:\s*"1"/);
  assert.match(workflow, /GIEOMO_EXPECTED_MIGRATION_TIP:\s*"044"/);
  assert.match(workflow, /find supabase\/migrations[^\n]+sort/);
  assert.match(workflow, /npm run test:pg:mandatory/);
  assert.match(workflow, /npm run test:source/);
  assert.match(workflow, /npm run lint/);
  assert.match(workflow, /PLAYWRIGHT_BROWSER_CHANNEL:\s*chrome/);
  assert.match(workflow, /npm run test:e2e/);
  assert.doesNotMatch(workflow, /playwright install/);
  assert.doesNotMatch(workflow, /supabase\/setup-cli/);
  assert.match(workflow, /actions\/checkout@v5/);
  assert.match(workflow, /actions\/setup-node@v5/);
  assert.doesNotMatch(workflow, /npm install --no-save/);
  assert.match(packageJson, /"pg":\s*"\^8\./);
  assert.match(mandatoryRunner, /MANDATORY_PG_SKIP_FAILURE/);
  assert.match(mandatoryRunner, /skippedMatch/);
  assert.match(mandatoryRunner, /\.integration\.test\.ts/);
  assert.match(mandatoryRunner, /r1PaymentPg\.integration\.test\.ts/);
  assert.match(mandatoryRunner, /supersededIntegrationFiles/);
  assert.match(sourceRunner, /!entry\.name\.endsWith\("\.integration\.test\.ts"\)/);
  assert.match(sourceRunner, /SOURCE_TEST_PASS/);
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
});

test("Production migration deployment is manual, target-pinned, dry-run first, and disabled by default", () => {
  const workflow = text(".github/workflows/deploy-production-migrations.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\bschedule:/);
  assert.match(workflow, /EXPECTED_PRODUCTION_PROJECT_REF:\s*snmmiwpvlpknkinhfqsv/);
  assert.match(workflow, /GIEOMO_EXPECTED_MIGRATION_TIP:\s*"044"/);
  assert.match(workflow, /supabase db push --linked --dry-run/);
  assert.match(workflow, /environment:\s*production/);
  assert.match(workflow, /vars\.PRODUCTION_DEPLOY_ENABLED == 'true'/);
  assert.match(workflow, /test "\$INPUT_SHA" = "\$GITHUB_SHA"/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.doesNotMatch(workflow, /startsWith\(github\.ref, 'refs\/tags\/'\)/);
  assert.match(workflow, /checks:\s*read/);
  assert.match(workflow, /requiredCheck = "source-and-postgres"/);
  assert.match(workflow, /actions\/checkout@v5/);
  assert.match(workflow, /actions\/setup-node@v5/);
  assert.match(workflow, /actions\/github-script@v8/);
  assert.match(workflow, /supabase\/setup-cli@v3/);
});

test("Preview migration runbook fails closed on Production and requires exactly 043-044", () => {
  const runbook = text("docs/engineering/PREVIEW_MIGRATIONS_043_044_RUNBOOK.md");
  assert.match(runbook, /snmmiwpvlpknkinhfqsv/);
  assert.match(runbook, /043_admin_order_archival\.sql/);
  assert.match(runbook, /044_combo_bottom_up_allocation\.sql/);
  assert.match(runbook, /supabase db push --linked --dry-run/);
  assert.match(runbook, /Do not run|Stop immediately/i);
});

test("local replay harness uses unique disposable targets and guarded teardown", () => {
  const runner = text("scripts/postgres/replay-canonical-migrations.ps1");
  assert.match(runner, /postgres-canonical-\$suffix/);
  assert.match(runner, /127\.0\.0\.1/);
  assert.match(runner, /Refusing unsafe teardown target/);
  assert.match(runner, /run-mandatory-pg-tests\.mjs/);
  assert.match(runner, /GIEOMO_EXPECTED_MIGRATION_TIP = "044"/);
  assert.match(runner, /node scripts\/tests\/run-source-tests\.mjs/);
  assert.match(runner, /CANONICAL_REPLAY_PASS/);
  assert.doesNotMatch(runner, /SUPABASE_ACCESS_TOKEN|service_role_key/i);
});

