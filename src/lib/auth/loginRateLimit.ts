import { createHash } from "node:crypto";

export const LOGIN_RATE_LIMIT_MAX_FAILURES = 5;
export const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

const MAX_TRACKED_KEYS = 5_000;

interface LoginAttemptWindow {
  failures: number;
  resetAt: number;
}

export interface LoginRateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

const attempts = new Map<string, LoginAttemptWindow>();

function removeExpired(now: number): void {
  for (const [key, entry] of attempts) {
    if (entry.resetAt <= now) attempts.delete(key);
  }
}

function ensureCapacity(now: number): void {
  if (attempts.size < MAX_TRACKED_KEYS) return;
  removeExpired(now);
  while (attempts.size >= MAX_TRACKED_KEYS) {
    const oldestKey = attempts.keys().next().value as string | undefined;
    if (!oldestKey) break;
    attempts.delete(oldestKey);
  }
}

/**
 * Produces a non-reversible, process-local key without retaining the account or
 * client address in memory. The first forwarded address is used because this
 * application is expected to run behind a trusted reverse proxy.
 */
export function getLoginRateLimitKey(request: Request, account: string): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const clientAddress = forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
  return createHash("sha256")
    .update(`${clientAddress.toLowerCase()}\n${account.trim().toLowerCase()}`)
    .digest("hex");
}

export function checkLoginRateLimit(
  key: string,
  now: number = Date.now()
): LoginRateLimitDecision {
  const entry = attempts.get(key);
  if (!entry) return { allowed: true, retryAfterSeconds: 0 };
  if (entry.resetAt <= now) {
    attempts.delete(key);
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (entry.failures < LOGIN_RATE_LIMIT_MAX_FAILURES) {
    return { allowed: true, retryAfterSeconds: 0 };
  }
  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
  };
}

export function recordLoginFailure(key: string, now: number = Date.now()): void {
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    ensureCapacity(now);
    attempts.set(key, { failures: 1, resetAt: now + LOGIN_RATE_LIMIT_WINDOW_MS });
    return;
  }
  current.failures += 1;
  // Refresh insertion order so capacity eviction favors inactive keys.
  attempts.delete(key);
  attempts.set(key, current);
}

export function clearLoginFailures(key: string): void {
  attempts.delete(key);
}

/** Test-only reset for deterministic unit tests; not used by the route. */
export function resetLoginRateLimitForTests(): void {
  attempts.clear();
}
