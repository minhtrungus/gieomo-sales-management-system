import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  LOGIN_RATE_LIMIT_MAX_FAILURES,
  LOGIN_RATE_LIMIT_WINDOW_MS,
  checkLoginRateLimit,
  clearLoginFailures,
  getLoginRateLimitKey,
  recordLoginFailure,
  resetLoginRateLimitForTests,
} from "../src/lib/auth/loginRateLimit.ts";

beforeEach(() => resetLoginRateLimitForTests());

test("login limiter blocks after the configured number of failures and returns deterministic retry time", () => {
  const key = "test-key";
  const now = 1_000_000;
  for (let i = 0; i < LOGIN_RATE_LIMIT_MAX_FAILURES; i += 1) {
    assert.equal(checkLoginRateLimit(key, now).allowed, true);
    recordLoginFailure(key, now);
  }
  assert.deepEqual(checkLoginRateLimit(key, now), {
    allowed: false,
    retryAfterSeconds: LOGIN_RATE_LIMIT_WINDOW_MS / 1000,
  });
});

test("login limiter expires the window and successful authentication clears failures", () => {
  const key = "test-key";
  const now = 2_000_000;
  for (let i = 0; i < LOGIN_RATE_LIMIT_MAX_FAILURES; i += 1) recordLoginFailure(key, now);
  assert.equal(checkLoginRateLimit(key, now).allowed, false);
  assert.equal(checkLoginRateLimit(key, now + LOGIN_RATE_LIMIT_WINDOW_MS).allowed, true);

  recordLoginFailure(key, now + LOGIN_RATE_LIMIT_WINDOW_MS + 1);
  clearLoginFailures(key);
  assert.equal(checkLoginRateLimit(key, now + LOGIN_RATE_LIMIT_WINDOW_MS + 1).allowed, true);
});

test("login limiter key canonicalizes account and first forwarded address without retaining plaintext", () => {
  const requestA = new Request("http://localhost/api/auth/login", {
    headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.2" },
  });
  const requestB = new Request("http://localhost/api/auth/login", {
    headers: { "x-forwarded-for": "203.0.113.10" },
  });
  const keyA = getLoginRateLimitKey(requestA, " Admin@Example.com ");
  const keyB = getLoginRateLimitKey(requestB, "admin@example.com");
  assert.equal(keyA, keyB);
  assert.equal(keyA.length, 64);
  assert.doesNotMatch(keyA, /admin|203\.0\.113\.10/i);
});

test("login route checks limit before database access, records failures, clears success, and returns 429", () => {
  const source = readFileSync(new URL("../src/app/api/auth/login/route.ts", import.meta.url), "utf8");
  const checkIndex = source.indexOf("checkLoginRateLimit(rateLimitKey)");
  const dbIndex = source.indexOf("createAdminClient()");
  assert.ok(checkIndex >= 0 && dbIndex > checkIndex);
  assert.match(source, /recordLoginFailure\(rateLimitKey\)/);
  assert.match(source, /clearLoginFailures\(rateLimitKey\)/);
  assert.match(source, /status:\s*429/);
  assert.match(source, /"Retry-After"/);
});

test("login distinguishes invalid credentials from an unavailable database", () => {
  const source = readFileSync(new URL("../src/app/api/auth/login/route.ts", import.meta.url), "utf8");
  const dbErrorBranch = source.slice(source.indexOf("if (dbError)"), source.indexOf("const matchedMember"));
  assert.match(dbErrorBranch, /status:\s*503/);
  assert.doesNotMatch(dbErrorBranch, /recordLoginFailure/);
  assert.match(source, /status:\s*401/);
  assert.match(source, /clearLoginFailures\(rateLimitKey\)/);
  assert.match(source, /response\.cookies\.set/);
});
