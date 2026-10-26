# Release and rollback

## Application release gate

1. Work on a non-`main` branch and open a pull request.
2. The exact commit must pass the GitHub check `source-and-postgres`. That job validates and replays the full migration chain in an isolated PostgreSQL service, runs the zero-skip mandatory PostgreSQL suite, the complete Node test suite, lint, type-check, production build, and browser acceptance tests.
3. GitHub branch protection must require `source-and-postgres` with strict status checks. Do not bypass the protection or force-push `main`.
4. Vercel's production deployment check `GitHub: source-and-postgres` must block `deployment-alias` for the `production` target. Vercel may build a candidate from `main`, but custom production domains must not move until the exact commit's check succeeds.
5. Keep Supabase GitHub Integration **Deploy to production** disabled. Production migrations use only the reviewed manual workflow described below.

If the required GitHub or Vercel check is missing, pending, skipped, cancelled, or failed, the release is a **NO-GO**. A successful build alone is not release approval.

## Production migrations

Use `.github/workflows/deploy-production-migrations.yml` only from `main`, after `source-and-postgres` succeeds on the exact SHA. Supply the reviewed SHA, production project ref, change ticket, independently verified restorable-backup evidence, and the confirmation phrase. The protected `production-readonly` environment performs target verification and a dry run. The protected `production` environment applies migrations only when `PRODUCTION_DEPLOY_ENABLED` is exactly `true` and its reviewers approve.

Never use this workflow to discover whether a migration is safe, repair an unknown migration ledger, or bypass a failed Supabase integration check. Never run its write stage without a fresh approved backup and rollback owner.

## Application rollback

1. Stop further releases and identify the last known-good immutable Git SHA and Vercel deployment ID.
2. Prefer a reviewed revert commit through the same `source-and-postgres` gate. This preserves history and produces an auditable deployment.
3. For an active incident, an authorized owner may use Vercel's rollback/promote control to restore the last known-good deployment, then immediately create the reviewed revert commit. Record the deployment ID, SHA, actor, time, reason, and verification evidence.
4. Verify the production domains resolve to the intended deployment and run non-destructive smoke checks. CI success is not proof that alias promotion succeeded.

Do not force-promote a deployment whose required check failed, and do not use a manual CLI deployment as a routine release path.

## Database rollback

Database migrations are additive and are not rolled back by rewriting migration history. If a migration causes an incident, stop application release traffic as appropriate and use one of these owner-approved paths:

- deploy a reviewed forward-fix migration through the same protected workflow; or
- restore an independently verified backup to an explicitly approved target under the incident runbook.

Never restore over Production or execute ad-hoc reverse SQL without explicit owner approval, a named rollback operator, and verified backup evidence.
