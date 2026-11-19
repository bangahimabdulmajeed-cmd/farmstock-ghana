/**
 * Minimal in-process rate limiter.
 *
 * Good enough for a single Node instance and for stopping OTP hammering,
 * brute-force loops and SMS-cost abuse. If the app is ever scaled
 * horizontally this must move to Redis or a DB-backed counter — the per-process
 * window would otherwise be multiplied by the number of instances.
 */

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
};

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 10_000;

function prune(now: number) {
  if (buckets.size <= MAX_KEYS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  prune(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: Math.max(0, limit - 1), retryAfterMs: 0 };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, bucket.resetAt - now) };
  }

  return { allowed: true, remaining: Math.max(0, limit - bucket.count), retryAfterMs: 0 };
}

/** Test hook. */
export function resetRateLimits() {
  buckets.clear();
}
