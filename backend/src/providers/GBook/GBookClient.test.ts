import { describe, expect, test } from "bun:test";
import type { GBookDbConfig } from "../../types.js";
import { GBookClient } from "./GBookClient.js";

const logger = { log() {}, warn() {}, error() {}, bindAxios() {} };

const dbConfig = {
  id: "db-1",
  url: "Link",
  status: "Sync date",
  title: "Title",
  releaseDate: "Release date",
  genre: "Genre",
  author: "Author",
  publisher: "Publisher",
  pageCount: "Page count",
} as unknown as GBookDbConfig;

/** A client whose `/volumes/{id}` hands back the given `volumeInfo`. */
function withVolume(volumeInfo: Record<string, unknown>): GBookClient {
  const gbook = new GBookClient("test-key", logger as any);

  (gbook as any).client = {
    get: async () => ({ data: { volumeInfo } }),
  };

  return gbook;
}

const BASE = {
  title: "Les jardins statuaires",
  publishedDate: "1982-01-01",
  // What Google actually returns for these — a Play Store URL that 404s for
  // anything the store does not sell. Present here to prove it is not used.
  canonicalVolumeLink: "https://play.google.com/store/books/details?id=DEAD",
};

describe("loadNotionEntry", () => {
  // Notion rejects `external.url: ""` outright, failing the whole page — so a
  // volume with no artwork has to come back with neither key rather than with
  // empty ones. Several editions of the title above carry no `imageLinks`,
  // which is what surfaced this as "Could not add that book".
  test("omits cover and icon entirely when the volume has no thumbnail", async () => {
    const { notionItem } = await withVolume(BASE).loadNotionEntry(
      "V4XztgAACAAJ",
      dbConfig,
    );

    expect(notionItem).not.toHaveProperty("cover");
    expect(notionItem).not.toHaveProperty("icon");
  });

  test("omits them when imageLinks exists but carries no thumbnail", async () => {
    const { notionItem } = await withVolume({
      ...BASE,
      imageLinks: { smallThumbnail: "https://example.test/small.jpg" },
    }).loadNotionEntry("V4XztgAACAAJ", dbConfig);

    expect(notionItem).not.toHaveProperty("cover");
    expect(notionItem).not.toHaveProperty("icon");
  });

  test("sets both from the thumbnail when there is one", async () => {
    const thumbnail = "https://books.google.com/content?id=SsjGEQAAQBAJ";

    const { notionItem, title } = await withVolume({
      ...BASE,
      imageLinks: { thumbnail },
    }).loadNotionEntry("SsjGEQAAQBAJ", dbConfig);

    expect(notionItem.cover).toEqual({ external: { url: thumbnail } });
    expect(notionItem.icon).toEqual({ external: { url: thumbnail } });
    expect(title).toBe("Les jardins statuaires");
  });
});

describe("the link it writes", () => {
  // `canonicalVolumeLink` is a play.google.com URL that 404s for any volume
  // the Play store does not sell, which is most physical books. It must never
  // reach Notion — not in the url column, and not as the author's hyperlink.
  test("is built from the id, never canonicalVolumeLink", async () => {
    const { notionItem } = await withVolume({
      ...BASE,
      authors: ["Jacques Abeille"],
    }).loadNotionEntry("V4XztgAACAAJ", dbConfig);

    const expected = "https://books.google.com/books?id=V4XztgAACAAJ";
    const props = notionItem.properties as any;

    expect(props.Link.url).toBe(expected);
    expect(props.Author.rich_text[0].text.link.url).toBe(expected);
    expect(JSON.stringify(notionItem)).not.toContain("play.google.com");
  });
});

describe("release date", () => {
  test("is left alone when the volume has no publishedDate", async () => {
    const { notionItem } = await withVolume({
      title: "Les jardins statuaires",
    }).loadNotionEntry("V4XztgAACAAJ", dbConfig);

    // `start: undefined` is not the same as not writing the column.
    expect(notionItem.properties).not.toHaveProperty("Release date");
  });

  test("passes a bare year through rather than discarding it", async () => {
    const { notionItem } = await withVolume({
      ...BASE,
      publishedDate: "2010",
    }).loadNotionEntry("V4XztgAACAAJ", dbConfig);

    expect((notionItem.properties as any)["Release date"].date.start).toBe(
      "2010",
    );
  });
});
