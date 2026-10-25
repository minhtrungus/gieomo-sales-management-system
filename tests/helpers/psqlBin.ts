export const psqlBin: string = process.env.PSQL_BIN || (process.platform === "win32" ? "psql.exe" : "psql");
export const psqlTimeoutMs = 30_000;

