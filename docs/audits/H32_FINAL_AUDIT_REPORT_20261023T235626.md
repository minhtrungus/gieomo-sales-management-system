# H32 Final Audit Report — 2026-10-23 23:56:26 (Asia/Ho_Chi_Minh)

## Verdict

**D. BLOCKED**

H32 repaired the two confirmed P0 privacy/session defects and several P1 endpoint/data-loss defects, and the final code suite, type-check and production build pass. Local acceptance cannot be declared because lint fails, 74 database tests remain unexecuted, migration tip 037 has not been replayed on isolated PostgreSQL, no safe H32 web/browser session is running, a fresh read-only production snapshot remains unavailable, and material P1 scope gaps remain.

## Repairs completed

1. **Public order IDOR/privacy**
   - Order code alone is no longer sufficient for public detail.
   - Public lookup requires exact phone ownership or an order-bound proof token.
   - Proof tokens are checked against both order code and order ID.
   - Customer projections omit receipt URLs and staff/internal data.

2. **Session revocation/logout**
   - Session authorization reloads current member status, role and `updated_at` version on every protected request.
   - Inactive, demoted or version-stale accounts fail closed.
   - Login no longer returns/stores a JavaScript-readable bearer token.
   - Admin and sale logout call the server endpoint, clear legacy storage/cookies, and rotate the member session version.

3. **Endpoint protection and online login control**
   - Product/content media upload is admin-only before multipart parsing or service-role storage access.
   - Email notification trigger is admin-only before database/provider access.
   - A bounded process-local failed-login limiter returns 429 after five failures in fifteen minutes. It is a local defense, not distributed rate limiting.

4. **Field round-trip repairs**
   - Migration 036 adds already-modeled `member_delivery`, `event_sale`, and `pickup_points.location_guide` fields.
   - Migration 037 safely replaces the order writer after the enum additions commit, preserving explicit delivery/source semantics and service-role-only execution.
   - Browser order payload forwards `source_type`.
   - Pickup create/update round-trips `location_guide`; UUID PATCH now targets the supplied ID.
   - Migration chain/workflow/replay guards advance to tip 037.

5. **Font/build regression**
   - Current code continues to use Montserrat via `next/font`, includes Vietnamese and weight 800, and consumes non-circular variables.
   - Boldonse remains unavailable; Montserrat is the explicit fallback.

## Evidence summary

- Full tests: **540 pass, 0 fail, 74 skip** (614 total).
- Focused H32 security/field tests: **45/45 pass**.
- Post-fix compatibility tests: **37/37 pass**.
- TypeScript: **PASS**.
- Next.js 16.3.5 production build: **PASS**, 51 static pages.
- Broad lint: **FAIL**, 398 errors and 195 warnings in the measured run.
- PostgreSQL tip-037 replay/concurrency: **BLOCKED / NOT RUN successfully**.
- H32 browser smoke: **NOT RUN**.

Detailed evidence: `H32_TEST_RESULTS_20261023T235626.md`.

## Gate table

| Gate | Result | Evidence / blocker |
|---|---|---|
| G1 WIP preservation | **PASS** | Branch `main` and HEAD `1c51af625a575a41733d59b29cc9be9ae0892c60` unchanged; no reset/clean/stash/stage/commit/push/merge |
| G2 Regression | **PARTIAL** | 29-item ledger plus full code suite; database/browser regressions incomplete |
| G3 Data fields | **PARTIAL** | Delivery/source/pickup loss fixed in code; voucher caps, cost snapshots, warehouses, shipments/CMS gaps remain |
| G4 Security | **PARTIAL / NO-GO** | P0 IDOR and stale-session defects fixed; broad role matrix, distributed throttling and audit coverage remain |
| G5 Business logic | **PARTIAL** | Unit/source suite passes; mandatory PostgreSQL behavior not verified |
| G6 Build | **PARTIAL** | Type-check/build pass; lint fails |
| G7 Database | **BLOCKED** | Fresh snapshot unavailable; tip 037 not replayed in H32 |
| G8 Runtime | **FAIL** | No verified H32 Next.js listener/database path |
| G9 UI | **PARTIAL / FAIL** | Font config passes; required routes/states and authenticated browser smoke remain incomplete |
| G10 Regression safety | **PASS for code, BLOCKED for DB/browser** | 540 code tests pass after final fixes; 74 skipped |
| G11 Production safety | **PASS** | Zero production writes, migrations, deployments or credential provisioning |
| G12 Documentation | **PASS** | Baseline, regression ledger, field matrix, security audit, test results and final report created |

## Open release blockers

- General order PATCH still permits non-cancel lifecycle changes without one atomic transition/history/audit RPC.
- `requireAuth` still allows all signed staff roles; member-roster PII and inventory access need an owner-approved role matrix.
- Voucher cap/min-items/gift/visibility fields remain absent from the canonical schema and fail closed.
- Order-item cost/discount snapshots remain incomplete; multi-warehouse UI remains non-relational/partly synthetic.
- Required public/admin routes and route-level loading/error/not-found coverage remain incomplete.
- The Unicode cover-image WIP may still produce `/_next/image` 400; H32 did not alter the user's asset.
- The October 22 production-derived snapshot is historical and PII-bearing; it was not used as a mutation target or represented as fresh.

## Operational handoff

No local web URL is claimed.

After approval capacity is restored, the next safe command is the repository's isolated replay harness, which creates a unique disposable cluster, applies migrations 001–037, runs SQL integrity plus all mandatory PG tests, and tears it down with guarded paths:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\postgres\replay-canonical-migrations.ps1
```

The interrupted retained synthetic process should be stopped gracefully by an owner/elevated shell only after confirming its exact data directory:

```powershell
C:\Users\MT\scoop\apps\postgresql\current\bin\pg_ctl.exe -D C:\Users\MT\Workspaces\gieomo-sales-management-system\.tmp\postgres-canonical-91fc9aa5e3 stop -m fast
```

Do not use `taskkill /T /F`, do not point the replay harness at the production-derived restore, and do not run the application against `.env.local` until its target is proven safe.

## WIP and production assurance

Final status contains 210 porcelain entries (65 tracked changes, 145 untracked entries), reflecting extensive pre-existing WIP plus H32 artifacts. No attempt was made to flatten, revert or claim ownership of unrelated hunks. No production write, remote role rotation, deployment, commit, push or merge occurred.
