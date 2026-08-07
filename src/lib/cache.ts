/**
 * In-process cache with request coalescing and stale-on-error fallback.
 *
 * Why this exists: the upstream providers rate-limit hard, and a single page
 * load fans out into several data calls. Without coalescing, ten concurrent
 * visitors asking for the same standings table become ten upstream requests
 * and an immediate ban. With it, they become one.
 *
 * Scope note: this is per-instance memory. On a single long-running server it
 * behaves as a true shared cache; on serverless it is per-warm-instance, which
 * still collapses the common burst case. A shared Redis would be the next step
 * if this ran at real traffic — the interface here is deliberately small enough
 * to swap.
 */

interface CacheEntry<T> {
  value: T;
  /** After this, the value should be refreshed. */
  freshUntil: number;
  /** After this, the value is too old to serve even as a fallback. */
  staleUntil: number;
  storedAt: number;
}

export interface CachedValue<T> {
  value: T;
  /** True when upstream failed and this is a previously-cached response. */
  stale: boolean;
  /** When the value was actually fetched from upstream. */
  fetchedAt: Date;
}

const store = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

/** Cache windows, tuned to how fast each kind of data actually changes. */
export const TTL = {
  /** Live scores genuinely move minute to minute. */
  live: 30_000,
  /** Tables only change when matches finish. */
  standings: 5 * 60_000,
  /** Fixture lists are effectively static within a day. */
  fixtures: 10 * 60_000,
  /** Scorer lists update after matchdays. */
  scorers: 15 * 60_000,
  /** News feeds publish continuously but not by the second. */
  news: 5 * 60_000,
  /** Squads and crests almost never change. */
  reference: 60 * 60_000,
} as const;

/** How long a stale value may still be served if upstream is failing. */
const STALE_GRACE_MS = 6 * 60 * 60_000; // 6 hours

export function cacheKey(...parts: (string | number | undefined | null)[]): string {
  return parts.filter((p) => p !== undefined && p !== null).join(":");
}

/**
 * Fetch through the cache.
 *
 * - Fresh hit  -> returned immediately.
 * - Concurrent miss -> all callers await the same in-flight promise.
 * - Upstream failure with a stale entry available -> stale value, flagged.
 * - Upstream failure with nothing cached -> the error propagates, so the
 *   caller can render an honest error state rather than empty data.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<CachedValue<T>> {
  const now = Date.now();
  const entry = store.get(key) as CacheEntry<T> | undefined;

  if (entry && now < entry.freshUntil) {
    return { value: entry.value, stale: false, fetchedAt: new Date(entry.storedAt) };
  }

  // Coalesce: a request for this key is already in flight, so join it.
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) {
    try {
      const value = await existing;
      return { value, stale: false, fetchedAt: new Date() };
    } catch {
      // Fall through to the stale check below rather than double-reporting.
    }
  }

  const promise = loader();
  inflight.set(key, promise);

  try {
    const value = await promise;
    store.set(key, {
      value,
      freshUntil: Date.now() + ttlMs,
      staleUntil: Date.now() + STALE_GRACE_MS,
      storedAt: Date.now(),
    });
    return { value, stale: false, fetchedAt: new Date() };
  } catch (error) {
    if (entry && Date.now() < entry.staleUntil) {
      // Serving slightly old real data beats showing nothing, as long as we
      // tell the user it is old.
      return { value: entry.value, stale: true, fetchedAt: new Date(entry.storedAt) };
    }
    throw error;
  } finally {
    inflight.delete(key);
  }
}

/** Test/debug helper. */
export function clearCache(): void {
  store.clear();
  inflight.clear();
}

export function cacheStats(): { entries: number; inflight: number } {
  return { entries: store.size, inflight: inflight.size };
}
