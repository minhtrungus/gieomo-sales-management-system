import { spawnSync } from "node:child_process";

export function defaultPsqlBin(platform: NodeJS.Platform = process.platform): string {
  return platform === "win32" ? "psql.exe" : "psql";
}

let validatedCandidate: string | undefined;

export function resolvePsqlBin(): string {
  const override = process.env.PSQL_BIN?.trim();
  const candidate = override || defaultPsqlBin();
  if (validatedCandidate === candidate) return candidate;

  const probe = spawnSync(candidate, ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  if (probe.error) {
    const source = override ? "PSQL_BIN override" : `${process.platform} PATH lookup`;
    throw new Error(
      `PostgreSQL client executable '${candidate}' is unavailable (${source}): ${probe.error.message}. ` +
        "Install the PostgreSQL client or set PSQL_BIN to a verified executable path."
    );
  }
  if (probe.status !== 0) {
    const detail = (probe.stderr || probe.stdout || "unknown probe failure").trim();
    throw new Error(`PostgreSQL client executable '${candidate}' failed --version (exit ${probe.status}): ${detail}`);
  }

  validatedCandidate = candidate;
  return candidate;
}

export const psqlTimeoutMs = 30_000;
