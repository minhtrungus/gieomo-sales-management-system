import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const text = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("migration chain is contiguous through 038", () => {
  const files = readdirSync(new URL("../supabase/migrations/", import.meta.url))
    .filter((name) => /^\d{3}_.+\.sql$/.test(name))
    .sort();

  assert.equal(files.length, 38);
  assert.equal(files[0], "001_initial_schema.sql");
  assert.equal(files.at(-1), "038_order_deletion_idempotency_cleanup.sql");
  assert.deepEqual(
    files.map((name) => Number(name.slice(0, 3))),
    Array.from({ length: 38 }, (_, index) => index + 1)
  );
});

test("migration validator accepts the canonical chain and enforces tip 038", () => {
  const result = spawnSync(process.execPath, ["scripts/migrations/validate-chain.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, GIEOMO_EXPECTED_MIGRATION_TIP: "038" },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(result.stdout) as { count: number; tip: string };
  assert.deepEqual({ count: manifest.count, tip: manifest.tip }, { count: 38, tip: "038" });
});

test("CI replays migrations on isolated PostgreSQL and makes PG tests mandatory", () => {
  const workflow = text(".github/workflows/go-live-gates.yml");
  const packageJson = text("package.json");
  const mandatoryRunner = text("scripts/postgres/run-mandatory-pg-tests.mjs");
  assert.match(workflow, /services:\s*\n\s+postgres:/);
  assert.match(workflow, /GIEOMO_PG_ISOLATED:\s*"1"/);
  assert.match(workflow, /GIEOMO_EXPECTED_MIGRATION_TIP:\s*"038"/);
  assert.match(workflow, /find supabase\/migrations[^\n]+sort/);
  assert.match(workflow, /npm run test:pg:mandatory/);
  assert.match(workflow, /node --test tests\/\*\.test\.ts/);
  assert.doesNotMatch(workflow, /npm install --no-save/);
  assert.match(packageJson, /"pg":\s*"\^8\./);
  assert.match(mandatoryRunner, /MANDATORY_PG_SKIP_FAILURE/);
  assert.match(mandatoryRunner, /skippedMatch/);
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
});

test("Production migration deployment is manual, target-pinned, dry-run first, and disabled by default", () => {
  const workflow = text(".github/workflows/deploy-production-migrations.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\bschedule:/);
  assert.match(workflow, /EXPECTED_PRODUCTION_PROJECT_REF:\s*snmmiwpvlpknkinhfqsv/);
  assert.match(workflow, /GIEOMO_EXPECTED_MIGRATION_TIP:\s*"038"/);
  assert.match(workflow, /supabase db push --linked --dry-run/);
  assert.match(workflow, /environment:\s*production/);
  assert.match(workflow, /vars\.PRODUCTION_DEPLOY_ENABLED == 'true'/);
  assert.match(workflow, /test "\$INPUT_SHA" = "\$GITHUB_SHA"/);
});

test("local replay harness uses unique disposable targets and guarded teardown", () => {
  const runner = text("scripts/postgres/replay-canonical-migrations.ps1");
  assert.match(runner, /postgres-canonical-\$suffix/);
  assert.match(runner, /127\.0\.0\.1/);
  assert.match(runner, /Refusing unsafe teardown target/);
  assert.match(runner, /run-mandatory-pg-tests\.mjs/);
  assert.match(runner, /CANONICAL_REPLAY_PASS/);
  assert.doesNotMatch(runner, /SUPABASE_ACCESS_TOKEN|service_role_key/i);
});

