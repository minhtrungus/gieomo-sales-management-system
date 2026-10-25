# H29 — Local backup restore and login acceptance report

Date: 2026-10-22 (Asia/Saigon)  
Scope: loopback-only local restore and manual-acceptance setup; no remote read/write, deployment, migration, commit, push, or merge  
Final verdict: **LOCAL_ACCEPTANCE_READY**

## 1. Repository and WIP safety

- Repository: `C:\Users\MT\Workspaces\gieomo-sales-management-system`
- Branch: `main`
- HEAD before and after: `1c51af625a575a41733d59b29cc9be9ae0892c60`
- The worktree was already heavily dirty and all existing WIP was preserved. No reset, clean, stash, revert, checkout overwrite, commit, or Git staging was performed.
- Baseline relevant status: `src/lib/data/orderStore.ts` was modified, `tests/adminAuthRedirect.test.ts` was untracked, the target report did not exist, and `AdminSidebar.tsx` had no task-local diff.
- Final status: 168 top-level porcelain entries; HEAD is unchanged. Relevant entries are modified `AdminSidebar.tsx`, the pre-existing modified `orderStore.ts`, untracked `tests/adminAuthRedirect.test.ts`, and this untracked report.
- Intentional tracked-scope change made in this task:
  - `src/components/admin/AdminSidebar.tsx`: call `POST /api/auth/logout` successfully before clearing local auth state and redirecting.
  - `tests/adminAuthRedirect.test.ts`: add a source contract that server-session revocation precedes local-session clearing. This file was already an untracked AUTH-05 artifact at task start.
  - this report.
- Local operational helpers and probes are under the already-untracked `.tmp/` tree; generated secrets and the owner credential handoff are outside the repository under the current user's Temp directory.

## 2. Backup selected and integrity evidence

Canonical existing backup used: `backups/prod-20261022-20261022T080112/`.

This is a snapshot of real Production data copied locally during the earlier reconciliation; it is **not synthetic data** and must be handled as containing real PII. No Production, Preview, Staging, or other remote endpoint was contacted in this task.

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `_query_ledger.sql.txt` | 240 | `8E36F643C9B918543CBB2E9C14C124EE9AED27BFF3B9A8515F055E105A70CC74` |
| `data.sql` | 160,662 | `AFA600FF00DD356BA1787EC51EB3DBB5166A7D743D7239D5C69D70D37083CD9E` |
| `role_memberships.json` | 6,252 | `84F66B8E209BD9A5DE02608F757F08A094092DAFD7C8817BA6B6B06AFF3577C8` |
| `roles.sql` | 229 | `5C0A37CD719D8CD19CD97B3F5B43BAEB2812AE48D92437308201202D0DEBD151` |
| `roles_attributes.json` | 3,718 | `10DC474D85846C8F96DDA07F63D41DC059C72356278B7E614E23BA0D22E41F61` |
| `schema.sql` | 165,914 | `D8F4A589320701B862C03E36E7C13ACB0352375EFE32E1ED929ECC2D45E03C47` |

All sizes and hashes match the prior production-data reconciliation report.

## 3. Isolated local restore

- PostgreSQL: 18.6, PID `31360`
- Bind: `127.0.0.1:55442`
- Data directory: `.tmp/postgres-recon-20261022-data`
- Existing database left untouched: `gieomo_prod_rehearsal`
- New acceptance database: `gieomo_local_acceptance_20261022`
- The target name was proven absent before creation. Two interrupted empty/partial attempts caused by PowerShell stderr handling were removed only after checking the exact target name and owner; no pre-existing database was dropped or overwritten.
- Final data restore: exit `0`, zero data errors.
- Schema restore completed with 159 expected vanilla-PostgreSQL errors for unavailable Supabase platform accessories such as `supabase_vault`. These are not hidden as a clean schema replay. After aligning installed extensions to schema `extensions`, the application-visible `public` schema matched the already-validated rehearsal database exactly.

Parity evidence before adding the local account:

- 26/26 public tables: exact row count and complete-row hash match.
- Key counts: 73 orders, 149 order items, 45 customers, 4 products, 103 variants, 8 combos, 22 combo items, 2 vouchers, 5 members, 0 payments, 0 inventory adjustments.
- Exact metadata fingerprints: 293 columns, 286 constraints, 46 RLS policies, 70 indexes, 13 triggers, 10 functions, 1 sequence, and 639 table grants.

After browser smoke, the same 26 original table fingerprints still matched. The only intentional data addition is one synthetic local admin in the acceptance database; all six member passwords in that database have PBKDF2 shape. No existing account, password hash, order, payment, stock, or other business row was modified.

## 4. Application data path and running services

The application process receives local-only environment overrides from an ACL-restricted runtime directory. Repository `.env.local` was neither read nor modified.

Verified path:

`Next.js 127.0.0.1:3790` → `REST proxy 127.0.0.1:55434` → `PostgREST 127.0.0.1:55445` → `gieomo_local_acceptance_20261022 @ PostgreSQL 127.0.0.1:55442`

Running listeners at handoff:

| Component | Address | PID |
|---|---|---:|
| Next.js listener | `127.0.0.1:3790` | 32880 |
| REST prefix proxy | `127.0.0.1:55434` | 28096 |
| PostgREST 16.5 | `127.0.0.1:55445` | 7020 |
| PostgreSQL 18.6 | `127.0.0.1:55442` | 31360 |

The old AUTH-05 synthetic fixture on port 55843 was stopped after the restored-data stack passed health checks. PostgREST reports four active connections to `gieomo_local_acceptance_20261022` and none to the old rehearsal database. Service REST counts confirmed 4 products and 6 members (5 snapshot members plus the local acceptance account).

## 5. Local acceptance account

- A separate synthetic admin was inserted only into `gieomo_local_acceptance_20261022`.
- Its password was generated randomly and stored with the application's PBKDF2-SHA512/100,000-iteration format.
- No password, password hash, cookie, JWT, or session token was printed or placed in this report.
- Owner-only handoff file: `C:\Users\MT\AppData\Local\Temp\gieomo-local-acceptance-20261022\OWNER-ACCEPTANCE-CREDENTIALS.txt`
- The runtime directory and credential file ACLs allow only the project owner and the local Codex sandbox identity used to run the stack.

## 6. Verification results

### Automated code checks

- `node --test tests/adminAuthRedirect.test.ts`: PASS, 2/2.
- Related auth/security batch (`authPrimitives`, `authHygieneBatch4`, `authorizationPhase4`, `adminAuthRedirect`): PASS, 23/23, zero skipped.
- `node node_modules/typescript/bin/tsc --noEmit`: PASS.
- Scoped ESLint for the changed component and test: exit 0, with two pre-existing warnings in `AdminSidebar.tsx` (`Sparkles` and `settings` unused), no errors.

### Fresh-context AUTH-05 and authorization smoke

- `/`: HTTP 200 and rendered.
- `/admin/login`: HTTP 200 and login form rendered.
- Fresh `/admin/members`: redirected to `/admin/login`; no admin roster rendered before auth.
- `/api/auth/session`: HTTP 200 with unauthenticated false-state contract and no user.
- Session checks during redirect: 2, bounded; no request loop.
- Unauthenticated `/api/orders?limit=1`: HTTP 401.
- Unauthenticated `/api/members/presence`: HTTP 401.
- Unauthenticated `/api/members`: HTTP 200 public contract; no `password_hash` detected.
- Across inspected API responses and rendered DOM: no `password_hash` detected.

### Login → roster → logout

- Local PBKDF2 account login: HTTP 200.
- Authenticated session: HTTP 200, admin role.
- `/admin/members`: admin shell and the local acceptance row rendered from the restored database.
- Sidebar logout: `POST /api/auth/logout` HTTP 200.
- Session after logout: unauthenticated.
- Direct revisit to `/admin/members` after logout: redirected to `/admin/login`.
- Browser diagnostics: 0 console errors, 0 failed same-origin requests, 0 HTTP 5xx responses.

### Read-only storefront smoke

`/products`, `/combos`, `/cart`, and `/track` each returned HTTP 200 and rendered. There were no console errors, failed same-origin requests, or HTTP 5xx responses. No checkout, order creation, payment, cancellation, inventory update, or other business mutation was performed.

## 7. Limitations and manual-testing guidance

- The displayed business data is a local snapshot of real data, not a demo fixture. Treat names, phones, emails, and order details as sensitive; do not share screenshots or exports casually.
- The acceptance database is isolated, so any later manual writes remain local, but this task did not validate destructive business flows.
- The local proxy supports PostgREST only. Supabase Auth, Storage, and Realtime paths fail closed; custom application auth at `/api/auth/*` is verified. Upload and realtime features are not acceptance-ready in this stack.
- External email and SePay keys are empty, so those integrations fail closed and cannot contact external services.
- The snapshot is the pre-022 production shape documented by the reconciliation report. Newer writer/RPC paths may expose known schema-drift limitations; order/payment/inventory mutation flows remain outside this handoff evidence.
- The main worktree has no `scripts/dev/start-rehearsal.ps1`; the available launcher exists only in another worktree and targets a synthetic database, so it was not used or misrepresented as this restored-data stack.

## 8. Owner handoff

- Open: `http://127.0.0.1:3790`
- Admin login: `http://127.0.0.1:3790/admin/login`
- Read the account and password from the ACL-restricted handoff file in §5.
- Safe stop command from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .tmp\h29-stop-local-acceptance.ps1
```

The stop script validates the recorded PID, process name, and loopback port before stopping only Next.js, the REST proxy, and PostgREST. It intentionally leaves the pre-existing PostgreSQL cluster on port 55442 running.

## 9. Final decision

**LOCAL_ACCEPTANCE_READY**

The backup is integrity-verified, restored into a separate loopback-only database, validated against the prior rehearsal at row and schema-metadata level, connected to the current application without reading `.env.local`, and verified through fresh unauthenticated auth, login, restored roster, server-side logout, post-logout redirect, protected APIs, and representative read-only storefront pages.
