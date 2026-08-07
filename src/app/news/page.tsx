import type { Metadata } from "next";
import { getNews } from "@/lib/data";
import { Card, EmptyState, Resolved, SourceLine } from "@/components/ui";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Football news",
  description: "Headlines from established football desks, linked to source.",
};

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default async function NewsPage() {
  const news = await getNews(24);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <header className="mb-6">
        <h1 className="text-3xl tracking-[-0.03em] text-chalk">Football news</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-chalk-dim">
          Headlines aggregated from public feeds, de-duplicated across desks.
          Every item links back to the publisher — no article text is reproduced
          here.
        </p>
      </header>

      <Resolved result={news}>
        {(articles, attribution) => (
          <Card>
            {articles.length === 0 ? (
              <EmptyState>No articles available right now.</EmptyState>
            ) : (
              <ul className="divide-y divide-pitch-line">
                {articles.map((article) => (
                  <li key={article.id}>
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="group block px-5 py-4 transition-colors duration-150 hover:bg-pitch-float/50"
                    >
                      <div className="flex items-baseline justify-between gap-4">
                        <p className="text-[14px] font-medium leading-snug text-chalk transition-colors group-hover:text-flood">
                          {article.title}
                        </p>
                        <span
                          data-numeric
                          className="shrink-0 text-[10px] text-chalk-faint"
                          suppressHydrationWarning
                        >
                          {timeAgo(article.publishedAt)}
                        </span>
                      </div>
                      {article.summary ? (
                        <p className="mt-1.5 text-[13px] leading-relaxed text-chalk-dim">
                          {article.summary}
                        </p>
                      ) : null}
                      <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-chalk-faint">
                        {article.source}
                      </p>
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <SourceLine attribution={attribution} />
          </Card>
        )}
      </Resolved>
    </div>
  );
}
