# Phase E — Backup & Restore Evidence Gate

Generated: **2026-10-16**. No Production writes.

## 1. What exists today (CONFIRMED)

| Source | Evidence | Restorable? | Verdict |
|---|---|---|---|
| App-level JSON export `backups/backup-2026-10-07T18-00-05-659Z/` | snapshot of 7 orders, no schema, produced by the app's own export script (gitignored `/backups/`). | NO — data-only, stale (3 days before the 63-order dataset), and non-RPC-consistent. Cannot be used as a Production restore point. | NOT a restore gate pass. |
| `supabase backups list` (linked project `snmmiwpvlpknkinhfqsv`) | earlier round: `walg=true, PITR=false, earliest=0, latest=0` — no usable daily/PITR backup points exposed via CLI. | NO — Supabase CLI reports no restorable physical backups; cannot evidence a restore drill. | BLOCKED. |
| `supabase db dump` / `db pull` | fail locally (`failed to inspect docker image`; no Docker daemon), and `pg_dump` direct path lacks credentials (no DB password available to this session). | NO — cannot produce a full schema+data equivalent. | BLOCKED. |

## 2. What Phase F rehearsal partially substitutes (and does NOT)

- The canonical-chain replay (Phase F) proves the migration SQL applies cleanly on a local disposable
  PostgreSQL. It does NOT substitute a Production restore drill: it contains no Production data and
  no Production configuration (RLS grants to anon/authenticated, extensions, timezone settings aside).

## 3. Gate requirements (must be met before any Phase C destructive window)

1. A real backup with `earliest`/`latest` healthy points from Supabase (or a `pg_dump`-equivalent
   artifact whose SHA-256 is recorded) with a written restore procedure that has been rehearsed.
2. Restore rehearsal in a disposable environment from an actual backup artifact (not from migration replay).
3. Documented RTO/RPO agreed with the owner.

## 4. Recommended unblock path (for the owner)

- Enable Supabase PITR / scheduled backups (Dashboard action; CLI-only project currently shows no backup rows).
- Alternatively: run one scheduled job that (a) `pg_dump` via a connection string from a secret store,
  uploading to object storage weekly, and (b) executes a restore drill monthly.
- Until then: keep Production read/write and Phase C batch OFF; do not run destructive maintenance.

## 5. Status

**Verdict: FAIL (no usable restore evidence), BLOCKED (cannot generate one from this workspace).**
Recorded as a Go-Live blocking condition in `PHASE_H_GO_NO_GO_ASSESSMENT.md` (R3).
