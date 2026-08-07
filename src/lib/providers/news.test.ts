import { describe, expect, it } from "vitest";
import type { NewsArticle } from "@/lib/types";
import { dedupeArticles } from "./news";

function article(overrides: Partial<NewsArticle> & { title: string; url: string }): NewsArticle {
  return {
    id: `${overrides.source ?? "Feed"}:${overrides.url}`,
    summary: "",
    source: "Feed",
    publishedAt: "2026-08-07T12:00:00.000Z",
    image: null,
    ...overrides,
  };
}

describe("dedupeArticles", () => {
  it("removes an item repeated within a single feed", () => {
    const url = "https://www.bbc.co.uk/sport/football/articles/c87nrpwg20vo";
    const merged = dedupeArticles([
      [article({ title: "Story A", url }), article({ title: "Story A", url })],
    ]);
    expect(merged).toHaveLength(1);
  });

  it("collapses the same URL carrying different tracking parameters", () => {
    const base = "https://www.bbc.co.uk/sport/football/articles/c87nrpwg20vo";
    const merged = dedupeArticles([
      [
        article({ title: "Headline one", url: `${base}?at_medium=RSS&at_campaign=rss` }),
        article({ title: "Headline two", url: `${base}?at_medium=social` }),
      ],
    ]);
    expect(merged).toHaveLength(1);
  });

  it("treats a trailing slash as the same URL", () => {
    const merged = dedupeArticles([
      [
        article({ title: "A", url: "https://example.com/story" }),
        article({ title: "B", url: "https://example.com/story/" }),
      ],
    ]);
    expect(merged).toHaveLength(1);
  });

  it("removes the same headline reported by two different desks", () => {
    const merged = dedupeArticles([
      [article({ title: "Palace sign defender Tomiyasu", url: "https://bbc.co.uk/a", source: "BBC" })],
      [article({ title: "Palace sign defender Tomiyasu!", url: "https://sky.com/b", source: "Sky" })],
    ]);
    expect(merged).toHaveLength(1);
  });

  it("keeps genuinely distinct stories", () => {
    const merged = dedupeArticles([
      [
        article({ title: "Story one", url: "https://example.com/1" }),
        article({ title: "Story two", url: "https://example.com/2" }),
      ],
    ]);
    expect(merged).toHaveLength(2);
  });

  it("produces unique ids, which is what React keys depend on", () => {
    const merged = dedupeArticles([
      [
        article({ title: "A", url: "https://example.com/x?utm=1" }),
        article({ title: "B", url: "https://example.com/x?utm=2" }),
        article({ title: "C", url: "https://example.com/y" }),
      ],
    ]);
    const ids = merged.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("sorts newest first", () => {
    const merged = dedupeArticles([
      [
        article({ title: "Older", url: "https://example.com/1", publishedAt: "2026-08-01T00:00:00.000Z" }),
        article({ title: "Newer", url: "https://example.com/2", publishedAt: "2026-08-07T00:00:00.000Z" }),
      ],
    ]);
    expect(merged[0].title).toBe("Newer");
  });

  it("puts undated items last rather than dropping them", () => {
    const merged = dedupeArticles([
      [
        article({ title: "Undated", url: "https://example.com/1", publishedAt: null }),
        article({ title: "Dated", url: "https://example.com/2" }),
      ],
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[1].title).toBe("Undated");
  });

  it("discards an item with an unusable empty title", () => {
    const merged = dedupeArticles([
      [article({ title: "", url: "https://example.com/1" })],
    ]);
    expect(merged).toHaveLength(0);
  });
});
