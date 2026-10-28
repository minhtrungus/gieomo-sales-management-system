import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";

const sourceFiles = readdirSync("tests", { withFileTypes: true })
  .filter((entry) =>
    entry.isFile() &&
    entry.name.endsWith(".test.ts") &&
    !entry.name.endsWith(".integration.test.ts")
  )
  .map((entry) => `tests/${entry.name}`)
  .sort();

if (sourceFiles.length === 0) {
  process.stderr.write("SOURCE_TEST_RUNNER_FAILURE no source tests discovered\n");
  process.exit(2);
}

const result = spawnSync(
  process.execPath,
  ["--test", "--test-concurrency=1", ...sourceFiles],
  {
    cwd: process.cwd(),
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  },
);

process.stdout.write(result.stdout || "");
process.stderr.write(result.stderr || "");
if (result.error) {
  process.stderr.write(`SOURCE_TEST_RUNNER_FAILURE ${result.error.message}\n`);
  process.exit(2);
}
if (result.status !== 0) process.exit(result.status ?? 1);
process.stdout.write(`SOURCE_TEST_PASS files=${sourceFiles.length}\n`);
