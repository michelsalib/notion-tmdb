import { describe, expect, test } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_DOMAINS } from "./domains.js";
import {
  connectorPitches,
  type PageMeta,
  pageMeta,
  stampHead,
} from "./pageMeta.js";

const SOURCE_INDEX = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../frontend/index.html",
);

function meta(overrides: Partial<PageMeta> = {}): PageMeta {
  return {
    title: "Notion ⇄ TMDB",
    ogTitle: "Type a film. Get a filled-in row.",
    description: "Search for a film and the poster lands in your database.",
    canonical: "https://notion-tmdb.micheldev.com/",
    noindex: false,
    ...overrides,
  };
}

describe("stampHead", () => {
  test("leaves exactly one description in the shipped document", async () => {
    const html = stampHead(await Bun.file(SOURCE_INDEX).text(), meta());

    // Pins the regex against the head's formatting: two description tags means
    // the generic all-connectors sentence is still a snippet candidate, and
    // that failure is invisible in a browser.
    expect(html.match(/name="description"/g)).toHaveLength(1);
    expect(html).toContain(
      'content="Search for a film and the poster lands in your database."',
    );
    expect(html).not.toContain("films, games, books, plays");
  });

  test("keeps the document's own description when a connector has none", async () => {
    const html = stampHead(
      await Bun.file(SOURCE_INDEX).text(),
      meta({ description: undefined }),
    );

    expect(html.match(/name="description"/g)).toHaveLength(1);
    expect(html).toContain("films, games, books, plays");
    expect(html).not.toContain("og:description");
  });

  test("stamps the title, canonical and unfurl card inside the head", () => {
    const html = stampHead("<head>\n  </head><body></body>", meta());

    expect(html).toContain("<title>Notion ⇄ TMDB</title>");
    expect(html).toContain(
      '<link rel="canonical" href="https://notion-tmdb.micheldev.com/" />',
    );
    expect(html).toContain('property="og:site_name" content="Notion ⇄ TMDB"');
    expect(html).toContain(
      'property="og:title" content="Type a film. Get a filled-in row."',
    );
    expect(html).toContain(
      'property="og:url" content="https://notion-tmdb.micheldev.com/"',
    );
    expect(html.indexOf("<title>")).toBeLessThan(html.indexOf("</head>"));
  });

  test("adds robots noindex only when asked", () => {
    expect(stampHead("<head></head>", meta())).not.toContain("noindex");
    expect(stampHead("<head></head>", meta({ noindex: true }))).toContain(
      '<meta name="robots" content="noindex, follow" />',
    );
  });

  test("escapes copy so a quote cannot end an attribute", () => {
    const html = stampHead(
      "<head></head>",
      meta({ ogTitle: 'A "quoted" <b>title</b> & more' }),
    );

    expect(html).toContain(
      'content="A &quot;quoted&quot; &lt;b&gt;title&lt;/b&gt; &amp; more"',
    );
  });
});

describe("pageMeta", () => {
  test("titles every connector the way the client does", async () => {
    const titles = await Promise.all(
      ALL_DOMAINS.map(
        async (domain) => (await pageMeta(domain, "https://x/", false)).title,
      ),
    );

    expect(titles).toEqual([
      "Notion ⇄ TMDB",
      "Notion ⇄ IGDB",
      "Notion ⇄ GBook",
      "Notion ⇄ BilletRéduc",
      "Notion ⇄ Backup",
      "Bitwarden ⇄ Bitwarden Backup",
    ]);
  });

  test("every connector has its own pitch to unfurl with", async () => {
    const pitches = await connectorPitches();

    for (const domain of ALL_DOMAINS) {
      expect(pitches[domain].description).toBeTruthy();
      expect(pitches[domain].ogTitle).not.toContain("⇄");
    }

    // Distinct per connector — the whole point is that six hosts stop looking
    // like one page.
    const descriptions = ALL_DOMAINS.map((d) => pitches[d].description);
    expect(new Set(descriptions).size).toBe(ALL_DOMAINS.length);
  });
});
