export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-pitch-line">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <p className="max-w-2xl text-[13px] leading-relaxed text-chalk-faint">
          Every number in SportX is computed from published data and labelled
          with its source and fetch time. Where a figure is unavailable, the
          interface says so rather than estimating one. Percentiles are ranks
          within a stated population, not ratings.
        </p>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[11px] text-chalk-faint">
          <a
            href="https://www.football-data.org"
            target="_blank"
            rel="noreferrer noopener"
            className="transition-colors hover:text-flood"
          >
            football-data.org
          </a>
          <a
            href="https://www.thesportsdb.com"
            target="_blank"
            rel="noreferrer noopener"
            className="transition-colors hover:text-flood"
          >
            TheSportsDB
          </a>
          <a
            href="/api/health"
            className="transition-colors hover:text-flood"
          >
            status
          </a>
        </div>
      </div>
    </footer>
  );
}
