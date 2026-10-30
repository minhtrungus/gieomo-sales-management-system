import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";

const requiredEnvironment = ["ATOMIC_PG_URL", "GIEOMO_PG_ISOLATED"];
const missing = requiredEnvironment.filter((name) => !process.env[name]);
if (missing.length > 0 || process.env.GIEOMO_PG_ISOLATED !== "1") {
  process.stderr.write(
    `MANDATORY_PG_INFRA_FAILURE missing/invalid: ${[
      ...missing,
      ...(process.env.GIEOMO_PG_ISOLATED && process.env.GIEOMO_PG_ISOLATED !== "1"
        ? ["GIEOMO_PG_ISOLATED=1"]
        : []),
    ].join(", ")}\n`
  );
  process.exit(2);
}

try {
  await import("pg");
} catch {
  process.stderr.write("MANDATORY_PG_INFRA_FAILURE pg devDependency is unavailable\n");
  process.exit(2);
}

// This legacy draft suite contains only explicit superseded/blocked skips.
// Its active contracts are covered by paymentApplyFaultPg and
// ordersPaymentsPrivilegesPg; it cannot be part of a zero-skip release gate.
const supersededIntegrationFiles = new Set(["r1PaymentPg.integration.test.ts"]);
const mandatoryFiles = readdirSync("tests", { withFileTypes: true })
  .filter((entry) =>
    entry.isFile() &&
    entry.name.endsWith(".integration.test.ts") &&
    !supersededIntegrationFiles.has(entry.name)
  )
  .map((entry) => `tests/${entry.name}`)
  .sort();
if (mandatoryFiles.length === 0) {
  process.stderr.write("MANDATORY_PG_RUNNER_FAILURE no PostgreSQL integration tests discovered\n");
  process.exit(2);
}

const result = spawnSync(
  process.execPath,
  ["--test", "--test-concurrency=1", "--test-reporter=tap", ...mandatoryFiles],
  {
    cwd: process.cwd(),
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }
);

process.stdout.write(result.stdout || "");
process.stderr.write(result.stderr || "");

if (result.error) {
  process.stderr.write(`MANDATORY_PG_RUNNER_FAILURE ${result.error.message}\n`);
  process.exit(2);
}
if (result.status !== 0) process.exit(result.status ?? 1);

const skippedMatch = result.stdout.match(/^# skipped (\d+)$/m);
if (!skippedMatch) {
  process.stderr.write("MANDATORY_PG_RUNNER_FAILURE missing TAP skip summary\n");
  process.exit(2);
}
if (Number(skippedMatch[1]) !== 0) {
  process.stderr.write(`MANDATORY_PG_SKIP_FAILURE skipped=${skippedMatch[1]}\n`);
  process.exit(2);
}

process.stdout.write(`MANDATORY_PG_PASS files=${mandatoryFiles.length} skipped=0\n`);
