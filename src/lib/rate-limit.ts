/**
 * Fixed-window rate limiter.
 *
 * The assistant endpoint spends money and burns a shared upstream quota on
 * every call, so it cannot be left open the way the previous version's chat
 * endpoint was (no limit, no input cap, one loop away from draining the key).
 *
 * In-process and therefore per-instance. Adequate for a single server or a
 * modest serverless deployment; a shared store is the next step under real
 * traffic, and the interface is small enough to swap.
 */

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

/** Bound memory so a flood of unique keys cannot grow the map indefinitely. */
const MAX_TRACKED_KEYS = 10_000;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets. */
  retryAfter: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const existing = windows.get(key);

  if (!existing || now >= existing.resetAt) {
    if (windows.size >= MAX_TRACKED_KEYS) {
      // Cheap eviction: drop entries whose window has already elapsed.
      for (const [k, w] of windows) {
        if (now >= w.resetAt) windows.delete(k);
      }
      // Still full means sustained abuse; refuse rather than grow.
      if (windows.size >= MAX_TRACKED_KEYS) {
        return { allowed: false, remaining: 0, retryAfter: Math.ceil(windowMs / 1000) };
      }
    }

    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfter: 0 };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: limit - existing.count,
    retryAfter: 0,
  };
}

/**
 * Best-effort client identifier.
 *
 * Proxy headers are spoofable, so this is a courtesy limiter that stops
 * accidental loops and casual abuse - not a security control.
 */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "anonymous";
}
