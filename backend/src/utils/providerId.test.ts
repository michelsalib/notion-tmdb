import { describe, expect, test } from "bun:test";
import { entryUrl, idAfterSegment, idFromQuery } from "./providerId.js";

/** A Notion row carrying one url property, keyed by property id as the API returns it. */
function row(properties: Record<string, unknown>): any {
  return { properties };
}

describe("entryUrl", () => {
  test("finds the link by property id, not by name", () => {
    const entry = row({
      "Any column name": {
        id: "abc%3D",
        type: "url",
        url: "https://www.themoviedb.org/movie/550",
      },
    });

    expect(entryUrl(entry, "abc%3D")).toBe(
      "https://www.themoviedb.org/movie/550",
    );
  });

  test.each([
    ["the column is missing", row({ Name: { id: "other", type: "title" } })],
    ["the cell is empty", row({ Link: { id: "abc", type: "url", url: null } })],
    ["the row has no properties", row(undefined as any)],
  ])("returns undefined when %s", (_label, entry) => {
    expect(entryUrl(entry, "abc")).toBeUndefined();
  });
});

describe("idAfterSegment", () => {
  test("reads the id out of a canonical link", () => {
    expect(
      idAfterSegment("https://www.themoviedb.org/movie/550", "movie"),
    ).toBe("550");
  });

  test("keeps the slug TMDB itself puts in the path", () => {
    expect(
      idAfterSegment(
        "https://www.themoviedb.org/movie/550-fight-club",
        "movie",
      ),
    ).toBe("550-fight-club");
  });

  // The regression. A link copied from the TMDB website carries `?language=…`;
  // the greedy `(.*)$` this replaced folded it into the id, so the request went
  // out as `/movie/550?language=en-US` with axios appending its own `language`
  // after it — TMDB answered 400 and the whole run died on its first row.
  test("drops a query string rather than folding it into the id", () => {
    expect(
      idAfterSegment(
        "https://www.themoviedb.org/movie/550?language=en-US",
        "movie",
      ),
    ).toBe("550");
  });

  test("drops a fragment", () => {
    expect(
      idAfterSegment("https://www.themoviedb.org/movie/550#cast", "movie"),
    ).toBe("550");
  });

  // Was a 404: the id came out as "550/" and TMDB does not resolve that.
  test("tolerates a trailing slash", () => {
    expect(
      idAfterSegment("https://www.themoviedb.org/movie/550/", "movie"),
    ).toBe("550");
  });

  test("ignores host and scheme differences", () => {
    expect(idAfterSegment("http://themoviedb.org/movie/550", "movie")).toBe(
      "550",
    );
  });

  test("finds the segment anywhere in the path", () => {
    expect(idAfterSegment("https://www.igdb.com/games/portal-2", "games")).toBe(
      "portal-2",
    );
  });

  test.each([
    ["a link to something else", "https://www.themoviedb.org/tv/1399"],
    ["the segment with nothing after it", "https://www.themoviedb.org/movie"],
    ["a trailing segment and no id", "https://www.themoviedb.org/movie/"],
    ["free text", "not a url at all"],
    ["an empty cell", ""],
  ])("returns undefined for %s", (_label, url) => {
    expect(idAfterSegment(url, "movie")).toBeUndefined();
  });

  // `listDatabaseEntries` filters on `is_not_empty`, but a row can still race a
  // user clearing the cell, and `null.toString()` would take the run down.
  test("returns undefined for a non-string cell", () => {
    expect(idAfterSegment(null, "movie")).toBeUndefined();
    expect(idAfterSegment(undefined, "movie")).toBeUndefined();
  });
});

describe("idFromQuery", () => {
  test("reads the volume id", () => {
    expect(
      idFromQuery("https://books.google.com/books?id=zyTCAlFPjgYC", "id"),
    ).toBe("zyTCAlFPjgYC");
  });

  // The greedy `\?id=(.*)$` this replaced returned "zyTCAlFPjgYC&hl=fr".
  test("stops at the next parameter", () => {
    expect(
      idFromQuery("https://books.google.com/books?id=zyTCAlFPjgYC&hl=fr", "id"),
    ).toBe("zyTCAlFPjgYC");
  });

  test("reads it whatever its position", () => {
    expect(
      idFromQuery("https://books.google.com/books?hl=fr&id=zyTCAlFPjgYC", "id"),
    ).toBe("zyTCAlFPjgYC");
  });

  test.each([
    ["no such parameter", "https://books.google.com/books?hl=fr"],
    ["an empty value", "https://books.google.com/books?id="],
    ["free text", "not a url at all"],
  ])("returns undefined for %s", (_label, url) => {
    expect(idFromQuery(url, "id")).toBeUndefined();
  });
});
