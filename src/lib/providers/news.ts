/**
 * News provider: public RSS feeds from established football desks.
 *
 * Parsing note: this deliberately does NOT use a general XML parser. Feeds are
 * untrusted remote input, and general XML parsers are the usual way an app
 * picks up entity-expansion (billion laughs) and external-entity issues. A
 * narrow, tag-scoped extractor cannot expand entities because it never
 * resolves them, and it degrades to "no articles" rather than crashing when a
 * feed changes shape.
 *
 * Only headline, summary, link and timestamp are read. Article bodies are not
 * copied - each item links back to the publisher.
 */

import { fetchText } from "@/lib/http";
import type { NewsArticle } from "@/lib/types";

interface Feed {
  name: string;
  url: string;
}

const FEEDS: Feed[] = [
  { name: "BBC Sport", url: "https://feeds.bbci.co.uk/sport/football/rss.xml" },
  { name: "Sky Sports", url: "https://www.skysports.com/rss/12040" },
  { name: "The Guardian", url: "https://www.theguardian.com/football/rss" },
];

/** Longest feed we will parse, as a simple resource guard. */
const MAX_FEED_BYTES = 2_000_000;

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

/**
 * Decode only the fixed set of named entities above, plus numeric (decimal and hex) ones.
 * Unknown entities are left as literal text rather than resolved, which is
 * what keeps this immune to entity-expansion attacks.
 */
export function decodeEntities(input: string): string {
  return input
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d{1,6});/g, (_, code: string) => {
      const n = Number.parseInt(code, 10);
      return n > 0 && n < 0x10ffff ? String.fromCodePoint(n) : "";
    })
    .replace(/&#x([0-9a-fA-F]{1,6});/gi, (_, hex: string) => {
      const n = Number.parseInt(hex, 16);
      return n > 0 && n < 0x10ffff ? String.fromCodePoint(n) : "";
    });
}

function stripTags(input: string): string {
  return input.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function unwrapCdata(input: string): string {
  const match = input.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return match ? match[1] : input;
}

/** Extract the text content of the first `<tag>` inside a chunk. */
function tagText(chunk: string, tag: string): string | null {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i");
  const match = chunk.match(re);
  if (!match) return null;
  const value = decodeEntities(stripTags(unwrapCdata(match[1])));
  return value.length > 0 ? value : null;
}

/** Extract an attribute from the first matching self-closing-ish tag. */
function tagAttr(chunk: string, tag: string, attr: string): string | null {
  const re = new RegExp(`<${tag}[^>]*\\s${attr}=["']([^"']+)["'][^>]*>`, "i");
  const match = chunk.match(re);
  return match ? decodeEntities(match[1]) : null;
}

function parseDate(raw: string | null): string | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function truncate(text: string, max = 200): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function parseFeed(xml: string, source: string): NewsArticle[] {
  const items = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) ?? [];
  const articles: NewsArticle[] = [];

  for (const item of items) {
    const title = tagText(item, "title");
    const link = tagText(item, "link");
    if (!title || !link) continue; // An article without either is unusable.

    const description = tagText(item, "description");
    const image =
      tagAttr(item, "media:thumbnail", "url") ??
      tagAttr(item, "media:content", "url") ??
      tagAttr(item, "enclosure", "url");

    articles.push({
      id: `${source}:${link}`,
      title,
      summary: description ? truncate(description) : "",
      url: link,
      source,
      publishedAt: parseDate(tagText(item, "pubDate")),
      image,
    });
  }

  return articles;
}

/**
 * Fetch and merge all feeds, newest first.
 *
 * A single failing publisher must not take down the news section, so feeds are
 * fetched concurrently and failures are dropped individually. If every feed
 * fails, the error propagates so the caller can show an error state rather
 * than an empty list that looks like "no news today".
 */
export async function getNews(limit = 12): Promise<NewsArticle[]> {
  const results = await Promise.allSettled(
    FEEDS.map(async (feed) => {
      const xml = await fetchText(feed.url, {
        label: `rss ${feed.name}`,
        timeoutMs: 6_000,
      });
      if (xml.length > MAX_FEED_BYTES) {
        throw new Error(`${feed.name}: feed exceeded size guard`);
      }
      return parseFeed(xml, feed.name);
    }),
  );

  const succeeded = results.filter(
    (r): r is PromiseFulfilledResult<NewsArticle[]> => r.status === "fulfilled",
  );

  if (succeeded.length === 0) {
    throw new Error("all news feeds failed");
  }

  return dedupeArticles(succeeded.map((r) => r.value)).slice(0, limit);
}

/**
 * Merge feeds, removing duplicates, newest first.
 *
 * Feeds duplicate in three distinct ways, and each needs its own check:
 *   1. The same item appears twice within one feed (catch by canonical URL).
 *   2. A story is syndicated under a different headline (catch by URL).
 *   3. Two desks cover the same story separately (catch by normalised title).
 *
 * Exported separately from the network call so it can be tested directly.
 */
export function dedupeArticles(lists: NewsArticle[][]): NewsArticle[] {
  const seenTitles = new Set<string>();
  const seenUrls = new Set<string>();
  const merged: NewsArticle[] = [];

  for (const list of lists) {
    for (const article of list) {
      const titleKey = article.title.toLowerCase().replace(/[^a-z0-9]/g, "");
      // Strip tracking parameters so ?at_medium=RSS variants collapse together.
      const urlKey = article.url.split("?")[0].replace(/\/$/, "");

      if (!titleKey || seenTitles.has(titleKey) || seenUrls.has(urlKey)) continue;

      seenTitles.add(titleKey);
      seenUrls.add(urlKey);
      merged.push(article);
    }
  }

  merged.sort((a, b) => {
    if (!a.publishedAt) return 1;
    if (!b.publishedAt) return -1;
    return b.publishedAt.localeCompare(a.publishedAt);
  });

  return merged;
}
