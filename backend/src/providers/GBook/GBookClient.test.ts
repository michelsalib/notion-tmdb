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
  canonicalVolumeLink: "https://books.google.com/books?id=V4XztgAACAAJ",
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
