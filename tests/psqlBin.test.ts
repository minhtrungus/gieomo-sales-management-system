import assert from "node:assert/strict";
import test from "node:test";
import { defaultPsqlBin, resolvePsqlBin } from "./helpers/psqlBin.ts";

test("PostgreSQL client defaults are cross-platform", () => {
  assert.equal(defaultPsqlBin("win32"), "psql.exe");
  assert.equal(defaultPsqlBin("linux"), "psql");
  assert.equal(defaultPsqlBin("darwin"), "psql");
});

test("an invalid PSQL_BIN override fails with actionable infrastructure guidance", () => {
  const previous = process.env.PSQL_BIN;
  process.env.PSQL_BIN = "h40-psql-does-not-exist";
  try {
    assert.throws(
      () => resolvePsqlBin(),
      /PSQL_BIN override.*Install the PostgreSQL client or set PSQL_BIN/
    );
  } finally {
    if (previous === undefined) delete process.env.PSQL_BIN;
    else process.env.PSQL_BIN = previous;
  }
});
