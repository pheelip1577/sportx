/**
 * Interface primitives.
 *
 * The important one here is `DataState`. Every data-bearing surface in the app
 * routes failures through it, so an outage, a missing API key and a genuinely
 * empty result render as three visibly different things. The previous version
 * of this project rendered all three as plausible-looking numbers.
 */

import type { ReactNode } from "react";
import { clsx } from "clsx";
import type { Attribution, DataResult, DataUnavailableReason } from "@/lib/types";

export function Card({
  children,
  className,
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article";
}) {
  return (
    <Tag
      className={clsx(
        "relative overflow-hidden rounded-xl border border-pitch-line bg-pitch-raised/70 backdrop-blur-sm",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  eyebrow,
  action,
}: {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-pitch-line px-5 py-4">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-chalk-faint">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="truncate text-base font-semibold tracking-tight text-chalk">
          {title}
        </h2>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** Live indicator. Amber is reserved for genuinely in-play data. */
export function LiveDot({ label = "Live" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-live">
      <span className="relative flex h-1.5 w-1.5">
        <span className="live-pulse absolute inline-flex h-full w-full rounded-full bg-live" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-live" />
      </span>
      {label}
    </span>
  );
}

/**
 * Team crest with a typographic fallback.
 *
 * Crest URLs go missing regularly. Rather than a broken image icon (or the
 * previous version's approach of substituting an unrelated stock photo), an
 * absent crest renders the club's initials.
 */
export function Crest({
  name,
  src,
  size = 24,
}: {
  name: string;
  src: string | null;
  size?: number;
}) {
  const initials = name
    .split(/\s+/)
    .filter((w) => !/^(fc|afc|cf|sc|ac)$/i.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  if (!src) {
    return (
      <span
        aria-hidden
        style={{ width: size, height: size, fontSize: size * 0.38 }}
        className="inline-flex shrink-0 items-center justify-center rounded-full border border-pitch-line-bright bg-pitch-float font-mono font-semibold text-chalk-dim"
      >
        {initials}
      </span>
    );
  }

  // Deliberately a plain <img>: crests are served from many hosts that change
  // over time, and next/image would require an ever-growing remotePatterns
  // allowlist that fails closed (broken image) whenever a new host appears.
  // These are small, lazily loaded, and already CDN-optimised upstream.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      className="shrink-0 object-contain"
      style={{ width: size, height: size }}
    />
  );
}

/**
 * Percentile meter: the app's core data primitive.
 *
 * Shows the real value prominently, the percentile as a filled track, and a
 * tick at the 50th percentile so "above/below league median" is readable at a
 * glance. The percentile is explicitly labelled as a rank, never presented as
 * if it were a rating out of 100.
 */
/** 1 -> "1st", 2 -> "2nd", 11 -> "11th", 61 -> "61st". */
function ordinal(n: number): string {
  const rounded = Math.round(n);
  const mod100 = rounded % 100;
  // 11, 12 and 13 are irregular and take "th" despite ending in 1, 2, 3.
  if (mod100 >= 11 && mod100 <= 13) return `${rounded}th`;
  switch (rounded % 10) {
    case 1:
      return `${rounded}st`;
    case 2:
      return `${rounded}nd`;
    case 3:
      return `${rounded}rd`;
    default:
      return `${rounded}th`;
  }
}

export function PercentileMeter({
  label,
  display,
  percentile,
  explanation,
  sampleSize,
}: {
  label: string;
  display: string;
  percentile: number;
  explanation: string;
  sampleSize: number;
}) {
  const strong = percentile >= 66;
  const weak = percentile <= 33;

  return (
    <div className="group py-2.5">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span
          className="cursor-help text-[13px] text-chalk-dim decoration-pitch-line-bright decoration-dotted underline-offset-4 group-hover:underline"
          title={`${explanation} Percentile is this value's rank against ${sampleSize} peers.`}
        >
          {label}
        </span>
        <span data-numeric className="text-[13px] font-semibold text-chalk">
          {display}
        </span>
      </div>

      <div className="relative h-1.5 overflow-hidden rounded-full bg-pitch-float">
        <div
          className="meter-grow h-full rounded-full"
          style={{
            width: `${percentile}%`,
            backgroundColor: strong
              ? "var(--color-flood)"
              : weak
                ? "var(--color-chalk-faint)"
                : "var(--color-flood-dim)",
          }}
        />
        {/* League median marker. */}
        <div
          aria-hidden
          className="absolute inset-y-0 left-1/2 w-px bg-pitch-base/80"
        />
      </div>

      <p className="mt-1 font-mono text-[10px] text-chalk-faint">
        {ordinal(percentile)} percentile of {sampleSize}
      </p>
    </div>
  );
}

const REASON_COPY: Record<
  DataUnavailableReason,
  { title: string; tone: "neutral" | "warn" }
> = {
  "missing-credentials": { title: "Not configured", tone: "neutral" },
  "upstream-error": { title: "Source unreachable", tone: "warn" },
  "rate-limited": { title: "Rate limited", tone: "warn" },
  "not-found": { title: "Nothing found", tone: "neutral" },
  "no-data-for-period": { title: "No data for this period", tone: "neutral" },
};

/**
 * The honest failure surface. Distinguishes *why* data is absent, because
 * "the season hasn't started" and "the API is down" are different facts and a
 * user acts on them differently.
 */
export function DataState({
  reason,
  message,
}: {
  reason: DataUnavailableReason;
  message: string;
}) {
  const copy = REASON_COPY[reason];
  return (
    <div className="px-5 py-10 text-center">
      <p
        className={clsx(
          "font-mono text-[11px] uppercase tracking-[0.16em]",
          copy.tone === "warn" ? "text-alert" : "text-chalk-faint",
        )}
      >
        {copy.title}
      </p>
      <p className="mx-auto mt-2 max-w-sm text-balance text-sm leading-relaxed text-chalk-dim">
        {message}
      </p>
    </div>
  );
}

/** Empty result that is genuinely empty, as opposed to an error. */
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="px-5 py-10 text-center text-sm text-chalk-faint">
      {children}
    </div>
  );
}

/** Source + freshness line. Every dataset in the UI carries one. */
export function SourceLine({ attribution }: { attribution: Attribution }) {
  const fetched = new Date(attribution.fetchedAt);
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 px-5 py-3 font-mono text-[10px] text-chalk-faint">
      <span>
        Source:{" "}
        <a
          href={attribution.url}
          target="_blank"
          rel="noreferrer noopener"
          className="text-chalk-dim underline decoration-pitch-line-bright underline-offset-2 transition-colors hover:text-flood"
        >
          {attribution.label}
        </a>
      </span>
      <span aria-hidden className="text-pitch-line-bright">
        /
      </span>
      <time dateTime={attribution.fetchedAt}>
        fetched {fetched.toISOString().slice(11, 16)} UTC
      </time>
      {attribution.stale ? (
        <span className="rounded-sm bg-alert/15 px-1.5 py-0.5 text-alert">
          cached — upstream unavailable
        </span>
      ) : null}
    </p>
  );
}

/** Prominent notice, e.g. "showing last season because this one hasn't begun". */
export function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="border-b border-pitch-line bg-flood/5 px-5 py-2.5 text-[12px] leading-relaxed text-chalk-dim">
      {children}
    </p>
  );
}

/** Render a DataResult, delegating failures to DataState. */
export function Resolved<T>({
  result,
  children,
}: {
  result: DataResult<T>;
  children: (data: T, attribution: Attribution) => ReactNode;
}) {
  if (!result.ok) {
    return <DataState reason={result.reason} message={result.message} />;
  }
  return <>{children(result.data, result.attribution)}</>;
}
