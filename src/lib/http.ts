/**
 * HTTP client for upstream providers.
 *
 * The free football APIs this app depends on rate-limit aggressively —
 * TheSportsDB returns a Cloudflare 1015 ban after roughly a dozen rapid
 * requests. So every outbound call goes through here, which enforces
 * timeouts, retries idempotent failures with exponential backoff + jitter,
 * and treats 429 as a hard stop rather than something to hammer.
 */

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly rateLimited: boolean = false,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

interface FetchOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  /** Label used in logs so a failing provider is identifiable. */
  label?: string;
  /**
   * Called with the response headers on every completed request.
   *
   * Providers that publish their remaining quota (football-data.org sends
   * `X-Requests-Available-Minute`) use this to throttle themselves rather than
   * discovering the limit by being banned.
   */
  onHeaders?: (headers: Headers) => void;
}

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_RETRIES = 2;

const USER_AGENT =
  "SportX/1.0 (+https://github.com/pheelip1577/sportx)";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exponential backoff with full jitter, capped, to avoid thundering herds. */
function backoffDelay(attempt: number): number {
  const base = Math.min(1_000 * 2 ** attempt, 6_000);
  return Math.round(base / 2 + Math.random() * (base / 2));
}

/**
 * Cloudflare's rate-limit response is HTML/plain text carrying "error code: 1015"
 * with a 200-ish or 429 status depending on the edge. Detect it explicitly,
 * because parsing it as JSON produces a confusing syntax error instead.
 */
function looksRateLimited(status: number, body: string): boolean {
  if (status === 429) return true;
  return body.includes("error code: 1015") || body.includes("Access denied");
}

export async function fetchJson<T = unknown>(
  url: string,
  options: FetchOptions = {},
): Promise<T> {
  const {
    headers = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    label = "upstream",
    onHeaders,
  } = options;

  let lastError: Error = new UpstreamError(`${label}: no attempt made`, null);

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...headers },
        signal: controller.signal,
        cache: "no-store",
      });

      onHeaders?.(response.headers);

      const text = await response.text();

      if (looksRateLimited(response.status, text)) {
        // Never retry a rate limit — that is what earns a longer ban.
        throw new UpstreamError(`${label}: rate limited by upstream`, response.status, true);
      }

      if (!response.ok) {
        throw new UpstreamError(
          `${label}: HTTP ${response.status}`,
          response.status,
        );
      }

      if (!text.trim()) {
        throw new UpstreamError(`${label}: empty response body`, response.status);
      }

      try {
        return JSON.parse(text) as T;
      } catch {
        throw new UpstreamError(
          `${label}: response was not valid JSON (first 80 chars: ${text.slice(0, 80)})`,
          response.status,
        );
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      lastError = err;

      // Rate limits and client errors are not worth retrying.
      const isRateLimit = err instanceof UpstreamError && err.rateLimited;
      const isClientError =
        err instanceof UpstreamError &&
        err.status !== null &&
        err.status >= 400 &&
        err.status < 500;

      if (isRateLimit || isClientError || attempt === retries) break;

      await sleep(backoffDelay(attempt));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError;
}

/** Fetch raw text (used for RSS, which is XML rather than JSON). */
export async function fetchText(
  url: string,
  options: FetchOptions = {},
): Promise<string> {
  const {
    headers = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
    label = "upstream",
  } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/rss+xml, application/xml, text/xml",
        ...headers,
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new UpstreamError(`${label}: HTTP ${response.status}`, response.status);
    }
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}
