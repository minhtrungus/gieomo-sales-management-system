import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../..");
const migrationDirectory = resolve(repoRoot, "supabase/migrations");
const migrationName = /^(\d{3})_([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/;
const legacyNames = new Set(["013_fix_rls_orders_customers_payment.rls.sql"]);
const legacyVersion = /^(\d{3})_/;

const entries = await readdir(migrationDirectory, { withFileTypes: true });
const sqlFiles = entries
  .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
  .map((entry) => entry.name)
  .sort();

if (sqlFiles.length === 0) {
  throw new Error("No canonical migrations found in supabase/migrations.");
}

const parsed = sqlFiles.map((name) => {
  const match = migrationName.exec(name);
  if (!match) {
    const legacyMatch = legacyVersion.exec(name);
    if (legacyNames.has(name) && legacyMatch) {
      return { name, version: Number(legacyMatch[1]), legacyName: true };
    }
    throw new Error(
      `Invalid migration filename ${name}; expected NNN_lower_snake_case.sql.`
    );
  }
  return { name, version: Number(match[1]), legacyName: false };
});

const duplicateVersions = parsed
  .filter((item, index) => parsed.findIndex((other) => other.version === item.version) !== index)
  .map((item) => item.version);
if (duplicateVersions.length > 0) {
  throw new Error(`Duplicate migration versions: ${[...new Set(duplicateVersions)].join(", ")}`);
}

for (let index = 0; index < parsed.length; index += 1) {
  const expected = index + 1;
  if (parsed[index].version !== expected) {
    throw new Error(
      `Migration chain is not contiguous: expected ${String(expected).padStart(3, "0")}, ` +
        `found ${String(parsed[index].version).padStart(3, "0")} (${parsed[index].name}).`
    );
  }
}

const manifest = [];
for (const migration of parsed) {
  const content = await readFile(resolve(migrationDirectory, migration.name));
  if (content.length === 0) {
    throw new Error(`Migration is empty: ${migration.name}`);
  }
  manifest.push({
    version: String(migration.version).padStart(3, "0"),
    name: migration.name,
    sha256: createHash("sha256").update(content).digest("hex"),
  });
}

const expectedTip = process.env.GIEOMO_EXPECTED_MIGRATION_TIP;
if (expectedTip && manifest.at(-1)?.version !== expectedTip) {
  throw new Error(
    `Migration tip mismatch: expected ${expectedTip}, found ${manifest.at(-1)?.version ?? "none"}.`
  );
}

process.stdout.write(`${JSON.stringify({ count: manifest.length, tip: manifest.at(-1)?.version, migrations: manifest }, null, 2)}\n`);

