# H31 — Resume local web, fix font, and safely unblock snapshot

Generated: 2026-10-23 16:10:24 (Asia/Ho_Chi_Minh)  
Final verdict: **BLOCKED**

The font defect is fixed and browser-verified, and a loopback web stack is running against a newly created disposable synthetic database. The strict overall gate remains blocked because no non-mutating path exists for a fresh Supabase snapshot, authenticated admin content was not tested without an approved existing credential, and an unrelated pre-existing cover-image request still returns HTTP 400.

## 1. Initial state

| Item | Initial evidence |
|---|---|
| Repository | `C:\Users\MT\Workspaces\gieomo-sales-management-system` |
| Branch / HEAD | `main` / `1c51af625a575a41733d59b29cc9be9ae0892c60` |
| Git porcelain | 194 entries: 56 tracked changes, 138 untracked entries, 0 staged |
| Worktrees | 12 registered; none modified or removed by H31 |
| Expected ports | 3790, 55434, 55445, 55442, 55441, and 55456 were not listening |
| Existing Production-derived restore | retained under `.tmp/postgres-recon-20261022-data`; not started or used |
| Existing snapshots | October 22 and October 7 directories retained unchanged |

No reset, clean, stash, revert, checkout overwrite, branch switch, worktree removal, stage, commit, push, merge, or deploy was performed.

## 2. Fresh Supabase snapshot decision

H31 independently rechecked local process-environment credential names, pooler-profile capability, and backup directories without printing values.

- No PostgreSQL/database credential variable is available to the process.
- The linked pooler profile still has no embedded password.
- No new approved local backup artifact has appeared since H30.
- The only previously proven dump path provisions/rotates `cli_login_postgres`; H31 explicitly forbids that remote state change.
- No Supabase dump, dry-run credential provisioning, REST table export, migration, project change, or remote write was attempted.

Fresh snapshot branch: **BLOCKED**. Missing prerequisite: an already-existing read-only PostgreSQL credential, a newly supplied approved backup artifact, or another backup mechanism that does not modify remote state.

The October 22 snapshot was not silently substituted.

## 3. Font root cause and fix

Confirmed root causes:

1. `next/font/google` emitted `--font-montserrat`, but the application tokens used literal `Montserrat` and therefore depended on a separate browser-time Google Fonts `@import`.
2. `--font-handwriting` and `--font-serif` referenced themselves, creating invalid circular custom-property dependencies.
3. The UI uses `font-extrabold`, but the self-hosted Montserrat declaration omitted weight 800.
4. Boldonse is named by the design system but no Boldonse asset exists. It cannot be loaded honestly.

Minimal changes:

- `src/app/layout.tsx`: add Montserrat 800; rename source variables to `--font-caveat` and `--font-playfair` so consumer tokens do not collide with them.
- `src/app/globals.css`: remove the runtime Google Fonts `@import`; make body, heading, sans, and display tokens consume `--font-montserrat`; map handwriting and serif tokens to their non-circular source variables.
- Display text intentionally falls back to the established Montserrat heading font until an approved Boldonse asset is supplied.

The unrelated pre-existing analytics and metadata hunks in `layout.tsx` were preserved and are not H31 changes.

## 4. Font/build evidence

| Check | Result |
|---|---|
| Scoped ESLint (`layout.tsx`) | PASS |
| TypeScript (`npm run type-check`) | PASS |
| Production build (`next build`) | PASS; 51 static pages generated |
| First sandboxed build | correctly failed because Google Fonts could not be fetched at build time |
| Approved-network build | PASS; Next downloaded and self-hosted configured fonts |
| Generated font assets | 13 WOFF2 files |
| Generated CSS Google-host request references | 0 |
| Generated body token consumes `--font-montserrat` | confirmed |
| Circular handwriting/serif token matches | 0 / 0 |
| `git diff --check` for font files | PASS; line-ending warnings only |

## 5. Synthetic database and runtime provenance

A new isolated PostgreSQL 18.6 cluster was created from repository migrations, not from Production data.

| Component | Endpoint | PID | Provenance |
|---|---|---:|---|
| Next.js dev listener | `127.0.0.1:3790` | 19700 | current dirty root worktree |
| REST prefix proxy | `127.0.0.1:55434` | 15292 | fail-closed for non-`/rest/v1/` paths |
| PostgREST 16.4 | `127.0.0.1:55445` | 27868 | local config in an ACL-restricted user Temp directory |
| PostgreSQL | `127.0.0.1:55441` | 11236 | `.tmp/postgres-canonical-91fc9aa5e3` |

Database identity: `gieomo_canonical_91fc9aa5e3`, loopback port 55441, data directory `.tmp/postgres-canonical-91fc9aa5e3`.

Runtime data is synthetic. Aggregate counts after the canonical replay/tests are: 2 products, 3 variants, 1 combo, 6 orders, 3 payments, and 3 members. No Production-derived data is connected.

Canonical replay evidence:

- migrations 001–035 applied successfully;
- payment and order SQL integrity scripts passed;
- mandatory PostgreSQL runner: 80 tests passed, 0 failed, 0 skipped across 13 files;
- Supabase DB lint was unavailable because vanilla PostgreSQL lacks `plpgsql_check`; this warning is not represented as a pass;
- an empty local `extensions` schema was added after the passing replay as a documented PostgREST platform shim. No business table or row was changed for that repair.

Local URL: `http://127.0.0.1:3790`

## 6. Browser and HTTP smoke

Chrome headless tested desktop 1440×900 and mobile 390×844.

Font/browser aggregate across 10 scenarios:

- 10/10 main responses HTTP 200;
- 10/10 `document.fonts.status = loaded`;
- 10/10 computed body family begins with Montserrat;
- 10/10 heading weight is 800;
- 0 Google Fonts browser requests;
- all WOFF2 requests are same-origin at `127.0.0.1:3790`;
- Vietnamese glyphs detected;
- 0 horizontal-overflow scenarios;
- 0 request failures and 0 HTTP 5xx responses.

| Check | Result | Evidence |
|---|---|---|
| `/` desktop/mobile | PASS WITH KNOWN ISSUE | page/font/layout pass; one `/_next/image` HTTP 400 |
| `/admin/login` | PASS | HTTP 200; no console/network error |
| `/products` | PASS WITH KNOWN ISSUE | API 200 and page render; one `/_next/image` HTTP 400 |
| `/combos` | PASS | API/page 200; no console/network error |
| Orders API without auth | PASS | HTTP 401 |
| Reconciliation API without auth | PASS | HTTP 401 |
| Presence API without auth | PASS | HTTP 401 |
| Session without auth | PASS | HTTP 200, `authenticated=false` |
| Admin Orders/Payments/Reconciliation/Customers/Members without auth | PASS | all five redirect to `/admin/login` |
| Authenticated admin content | NOT RUN | no approved existing synthetic credential was available without exposing or inventing a password |
| Mutating browser flows | NOT RUN | unnecessary for font/runtime acceptance; no mutations attempted |

The remaining image error is outside the font hunk. It occurs through `/_next/image` on Home and Products and is associated with the existing Unicode-named cover-image WIP. H31 did not rename or overwrite that user asset.

## 7. Files and artifacts

Source files intentionally changed:

- `src/app/layout.tsx` — font weight/source-variable correction only.
- `src/app/globals.css` — self-hosted token wiring and removal of runtime Google Fonts import.

New ignored operational artifacts under `.tmp/`:

- `h31-prepare-synthetic-runtime.mjs`
- `h31-start-synthetic-runtime.ps1`
- `h31-browser-font-smoke.mjs`
- `h31-stop-synthetic-runtime.ps1`
- H31 local logs and the synthetic PostgreSQL data directory

Generated JWT/session secrets exist only in an ACL-restricted Temp runtime directory (current user + SYSTEM) and were never printed, copied to Git, or placed in this report.

## 8. WIP preservation

Final pre-report state: branch `main`, HEAD unchanged, 195 porcelain entries (57 tracked changes, 138 untracked entries), 0 staged. The one additional tracked status is `src/app/globals.css`; `src/app/layout.tsx` was already modified and received only the narrow font hunk described above.

All pre-existing WIP, worktrees, snapshots, database directories, and reports remain intact.

## 9. Stop, restart, and rollback

Safe stop from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .tmp\h31-stop-synthetic-runtime.ps1
```

The stop helper validates exact listener PID/name ownership and uses `pg_ctl ... stop -m fast` for PostgreSQL. It does not delete the synthetic data directory.

Restart while the retained synthetic cluster is stopped requires starting PostgreSQL with its exact data directory first, then running the H31 runtime launcher. Do not run the canonical replay launcher again to target the retained directory; it always creates a new disposable cluster.

Source rollback, if the owner rejects the font fix, must be a hunk-level reversal of only the H31 lines in `layout.tsx` and `globals.css`; do not checkout the whole files because `layout.tsx` contains unrelated WIP.

## 10. Remaining blockers and final verdict

1. Fresh Supabase snapshot remains blocked by the remote no-write boundary and absence of an existing read-only dump credential/artifact.
2. Authenticated admin data pages were not exercised because no approved existing synthetic credential was available.
3. The pre-existing cover image produces `/_next/image` HTTP 400 in three browser scenarios.
4. Boldonse remains unavailable because the repository contains no approved asset.

**BLOCKED** — strict H31 readiness is not declared while the fresh-snapshot branch, authenticated admin smoke, and image error remain unresolved. The font fix itself is build- and browser-verified, and the synthetic local runtime remains available at `http://127.0.0.1:3790` for limited safe inspection.
