import Link from "next/link";
import { features } from "@/lib/config";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/live", label: "Live" },
  { href: "/fixtures", label: "Fixtures" },
  { href: "/table", label: "Table" },
  { href: "/scorers", label: "Scorers" },
  { href: "/news", label: "News" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-pitch-line bg-pitch-base/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link
          href="/"
          className="group flex shrink-0 items-baseline gap-2 rounded-sm transition-opacity hover:opacity-90"
        >
          <span className="text-xl font-bold leading-none tracking-[-0.04em] text-chalk">
            SportX
          </span>
          <span
            aria-hidden
            className="h-2 w-2 rounded-full bg-flood transition-transform duration-300 group-hover:scale-125"
          />
        </Link>

        <nav aria-label="Primary" className="min-w-0 flex-1">
          <ul className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block whitespace-nowrap rounded-md px-2.5 py-1.5 text-[13px] text-chalk-dim transition-colors duration-150 hover:bg-pitch-raised hover:text-chalk active:text-flood"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {features.assistant ? (
          <Link
            href="/ask"
            className="shrink-0 rounded-md border border-flood/30 bg-flood/10 px-2.5 py-1 text-[13px] font-medium text-flood transition-colors duration-150 hover:bg-flood/20 sm:px-3 sm:py-1.5"
          >
            Ask
          </Link>
        ) : null}
      </div>
    </header>
  );
}
