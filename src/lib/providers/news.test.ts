import { describe, expect, it } from "vitest";
import type { NewsArticle } from "@/lib/types";
import { decodeEntities, dedupeArticles } from "./news";

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

describe("decodeEntities", () => {
  it("decodes named entities", () => {
    expect(decodeEntities("&amp; &lt; &gt; &quot; &apos; &nbsp;")).toBe("& < > \" '  ");
  });

  it("decodes decimal numeric character references", () => {
    expect(decodeEntities("Arsenal&#39;s win &#8217;special&#8217;")).toBe("Arsenal's win ’special’");
  });

  it("decodes hexadecimal character entity references", () => {
    expect(decodeEntities("Arsenal&#x27;s victory &#x2019;superb&#x2019;")).toBe("Arsenal's victory ’superb’");
    expect(decodeEntities("&#x3C;tag&#x3E; &amp; &#x26;")).toBe("<tag> & &");
  });

  it("handles case-insensitive hex characters", () => {
    expect(decodeEntities("&#x2F; &#x2f;")).toBe("/ /");
  });

  it("safely handles invalid or out-of-range code points", () => {
    expect(decodeEntities("&#x9999999;")).toBe("&#x9999999;");
    expect(decodeEntities("&#0;")).toBe("");
  });

  it("leaves unknown entities unchanged without crashing", () => {
    expect(decodeEntities("&foobar; &unknown;")).toBe("&foobar; &unknown;");
  });
});
