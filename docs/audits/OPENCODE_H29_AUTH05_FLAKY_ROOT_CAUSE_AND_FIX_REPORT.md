# H29 — AUTH-05 flaky root-cause and fix report

Date: 2026-10-22 (Asia/Saigon)  
Scope: local loopback only; no deploy, remote migration, commit, push, or production write  
Final status: **AUTH-05_FIXED**

## 1. Git baseline and workspace safety

- Repository: `C:\Users\MT\Workspaces\gieomo-sales-management-system`
- Branch: `main`
- HEAD before and after: `1c51af625a575a41733d59b29cc9be9ae0892c60`
- The worktree was already heavily dirty. In particular, `src/lib/data/orderStore.ts` was already modified before this investigation. No existing WIP was reset, stashed, reverted, committed, or overwritten.
- Files intentionally changed/added for AUTH-05:
  - `src/lib/data/orderStore.ts` — make `clearAdminSession()` idempotent with respect to the auth-change event.
  - `tests/adminAuthRedirect.test.ts` — regression contract for the event guard.
  - `.tmp/h29-auth05-controlled-probe.mjs` and `.tmp/h29-auth-valid-flow-probe.mjs` — local, redacted browser probes.
  - This report.
- Final Git status retains all pre-existing changes. The only new tracked-scope test is `tests/adminAuthRedirect.test.ts`; `src/lib/data/orderStore.ts` remains modified and contains substantial pre-existing WIP outside the small AUTH-05 hunk around `clearAdminSession()`.

## 2. AUTH-05 test and expected behavior

The browser case is defined in `.tmp/recon-20261022/rc1-e2e-browser.mjs`:

- Open `/admin/members` in a completely fresh browser context.
- Wait for navigation to `/admin/login`.
- Fail if the final URL remains `/admin/members`.

Historical local runs showed the flaky signature:

- Run 1: FAIL
- Run 2: FAIL
- Run 3: FAIL
- Run 4: PASS
- Run 5: FAIL

Therefore the previous observed rate was 1 pass / 4 failures in five recorded runs.

## 3. Source inspection

### Admin layout

`src/app/admin/layout.tsx` is a client layout. For non-login admin paths it:

1. fetches `/api/auth/session`;
2. keeps `isAuthChecked=false`, so admin children are replaced by the auth-loading screen until authentication succeeds;
3. on unauthenticated/error response, calls `clearAdminSession()` and `router.replace('/admin/login')`;
4. listens for `gieomo_admin_auth_changed` and calls the same `verifyAuth()` function again;
5. cleans up its focus listener, auth listener, and heartbeat interval on unmount.

The layout did **not** render the members page before successful auth verification. The failure was navigation starvation, not early rendering of admin children.

### Session clearing and root cause

Before the fix, `clearAdminSession()` always did both of the following, even when local storage had no session:

1. remove `gieomo_admin_session`;
2. dispatch `gieomo_admin_auth_changed`.

In a fresh unauthenticated context this formed a self-triggering loop:

`verifyAuth()` → session says unauthenticated → `clearAdminSession()` → auth-change event → `verifyAuth()` again.

Every response scheduled another session request and another `router.replace()`. The request/event storm could starve or repeatedly supersede the client navigation, explaining why the same test sometimes passed but usually remained on `/admin/members`.

### Server authorization

- `GET /api/auth/session` intentionally returns HTTP 200 with `{ authenticated:false, user:null }` when no valid session exists.
- `GET /api/members` intentionally exposes only the public referral trio to unauthenticated callers: `memberId`, `fullName`, `referralCode`. It does not expose email, phone, role, status, password, or password hash.
- `GET /api/orders?limit=1` without a session and without an order code returns 401.
- `GET /api/members/presence` without a session returns 401.
- Admin children did not render during the failed redirect, so no page-driven roster/orders/presence fetch occurred before authorization.

Classification:

- **Security data leak:** not reproduced.
- **UI authorization failure:** reproduced.
- **Redirect behavior mismatch:** no; the layout and test both require redirect to `/admin/login`.
- **Environment issue:** no; loopback session and mock PostgREST endpoints were responsive.
- **Root cause:** auth-change feedback loop caused by non-idempotent session clearing.

## 4. Controlled reproduction before the fix

The probe used fresh incognito-like contexts, a finite 20-second deadline, URL navigation tracking, redacted DOM classification, and status/key-only API inspection.

Three controlled pre-fix runs all reproduced the defect:

| Run | Final URL | Session | DOM | Browser requests | Sensitive API result |
|---|---|---|---|---|---|
| 1 | `/admin/members` | 200, unauthenticated | no roster/login; auth gate remained | continuous `/api/auth/session` storm | members public trio only; orders 401 |
| 2 | `/admin/members` | 200, unauthenticated | no roster/login; auth gate remained | continuous `/api/auth/session` storm | members public trio only; orders 401 |
| 3 | `/admin/members` | 200, unauthenticated | no roster/login; auth gate remained | continuous `/api/auth/session` storm | members public trio only; orders 401 |

The probe output contained hundreds of session responses per run; no response body, cookie, token, password, hash, or PII was logged.

## 5. Fix

`clearAdminSession()` now checks whether `gieomo_admin_session` existed before removal and dispatches `gieomo_admin_auth_changed` only when clearing changed local auth state.

Why this is the minimum root fix:

- A fresh unauthenticated context no longer emits a false auth-state change, so layout verification cannot trigger itself.
- A real logged-in local session still emits the event when cleared, preserving logout/component notification behavior.
- A second clear is idempotent and produces no redundant event.
- No session response contract, role rule, API authorization rule, timeout, or browser-test expectation was weakened.

## 6. Post-fix browser evidence

### AUTH-05 repeat run

Command:

```powershell
$env:AUTH05_RUNS='10'; node .tmp/h29-auth05-controlled-probe.mjs
```

Result: **10/10 PASS**.

Every run produced:

- final URL `/admin/login`;
- login form rendered;
- no members roster rendered before redirect;
- zero browser console errors;
- session HTTP 200 with `authenticated=false`, `user=null`;
- unauthenticated members response HTTP 200, two synthetic rows, exactly `fullName/memberId/referralCode`, no sensitive keys;
- unauthenticated orders response HTTP 401;
- unauthenticated presence response HTTP 401;
- two session checks (React development behavior), not an unbounded request loop.

A second three-run probe after improving DOM classification also passed 3/3 with the same results.

### Valid login, roster, and logout regression

Command:

```powershell
node .tmp/h29-auth-valid-flow-probe.mjs
```

Result: **PASS**.

- login POST: 200;
- session after login: authenticated admin;
- `/admin/members`: admin shell and synthetic fixture roster rendered;
- `password_hash` absent from DOM;
- logout POST: 200;
- direct revisit to `/admin/members` after logout redirected to `/admin/login`;
- console errors: 0.

Only synthetic `.invalid` fixture identities were used; no credentials or tokens were printed.

## 7. Automated regression and build evidence

### Targeted + related auth/security tests

```powershell
node --test tests/authPrimitives.test.ts tests/authHygieneBatch4.test.ts tests/authorizationPhase4.test.ts tests/adminAuthRedirect.test.ts
```

Result: **PASS — 22 tests, 0 fail, 0 skipped**.

### Type-check

```powershell
node node_modules/typescript/bin/tsc --noEmit
```

Result: **PASS — exit 0**.

### Production build

The live dev server on port 3790 (PID 27672) was not stopped because its command line could not be read under current permissions. To avoid its `.next` lock and preserve the original workspace, the current working tree was copied to `.tmp/h29-auth05-build-workspace` without `.git`, `.next`, `.tmp`, or a second dependency tree; `node_modules` was connected read-only by a junction.

First sandboxed build attempt compiled source but failed only because `next/font` could not reach Google Fonts. After explicitly approved network access, the same local build command completed successfully:

```powershell
node node_modules/next/dist/bin/next build
```

Result: **PASS — compiled, TypeScript finished, 48/48 static pages generated, route table included `/admin/members` and all auth APIs**.

### Scoped lint

```powershell
node node_modules/eslint/bin/eslint.js src/lib/data/orderStore.ts tests/adminAuthRedirect.test.ts
```

Result: **FAIL — 33 errors and 17 warnings, all reported in the large pre-existing `orderStore.ts` body; no finding points to the AUTH-05 hunk (lines 3622–3633) or the new test**. The repository already documents a broad lint debt, so this is not reported as a clean lint pass and was not expanded into an unrelated cleanup.

## 8. Limits

- Tests used a local synthetic PostgREST fixture and loopback Next dev server; no hosted Supabase, Preview, Staging, or Production system was contacted for application data.
- No remote database, migration, deployment, commit, push, merge, reset, clean, or stash was performed.
- Full repository lint remains red because of existing debt.
- The active loopback listeners were left untouched: port 3790 PID 27672 and port 55843 PID 32688.

## 9. Final decision

**AUTH-05_FIXED**

The failure is deterministically explained by the self-triggering auth event loop, the minimum code fix removes that loop, unauthenticated behavior is directly verified, sensitive admin APIs remain protected, valid login/logout behavior passes, AUTH-05 passes 10 consecutive fresh-context runs, related auth/security tests and type-check pass, and a production build passes in an isolated local workspace.
