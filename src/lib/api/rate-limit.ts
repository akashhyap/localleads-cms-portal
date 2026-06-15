import { ApiError } from "./context";

/**
 * Minimal fixed-window rate limiter for mutation endpoints.
 *
 * This in-memory implementation protects a single instance and is sufficient
 * for development and low-traffic internal use. For multi-instance production
 * on Vercel, swap the store for Upstash/Redis behind the same interface — the
 * call sites don't change.
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(
  key: string,
  opts: { limit: number; windowMs: number } = { limit: 30, windowMs: 60_000 },
): void {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > opts.limit) {
    throw new ApiError(429, "Too many requests — slow down and try again shortly");
  }
}
