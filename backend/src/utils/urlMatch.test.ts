import { describe, expect, it } from "bun:test";
import { GBookClient } from "../providers/GBook/GBookClient.js";
import { IgdbClient } from "../providers/Igdb/IgdbClient.js";
import { TmdbClient } from "../providers/Tmdb/TmdbClient.js";
import { matchesUrl } from "./urlMatch.js";

describe("matchesUrl", () => {
  it("matches an exact url", () => {
    expect(
      matchesUrl(
        { equals: "https://www.themoviedb.org/movie/27" },
        "https://www.themoviedb.org/movie/27",
      ),
    ).toBe(true);
  });

  // The whole reason the derivable connectors use `equals`. Under `contains`,
  // asking about film 27 would claim the row for film 271 and the widget would
  // tell someone they already have a film they have never added.
  it("does not let a shorter id claim a longer one", () => {
    expect(
      matchesUrl(
        { equals: "https://www.themoviedb.org/movie/27" },
        "https://www.themoviedb.org/movie/271",
      ),
    ).toBe(false);
  });

  it("matches a token anywhere in the stored url", () => {
    expect(
      matchesUrl(
        { contains: "zyTuhTFYQg8C" },
        "https://books.google.com/books/about/Dune.html?id=zyTuhTFYQg8C",
      ),
    ).toBe(true);
  });

  it("does not match a token that is absent", () => {
    expect(
      matchesUrl(
        { contains: "zyTuhTFYQg8C" },
        "https://books.google.com/books/about/Emma.html?id=Ovc4AAAAMAAJ",
      ),
    ).toBe(false);
  });

  // `{}` reaches here whenever a provider cannot describe an item. Falling
  // through to "matches" would badge the entire result list.
  it("never matches on an empty descriptor", () => {
    expect(matchesUrl({}, "https://www.themoviedb.org/movie/27")).toBe(false);
    expect(matchesUrl({ contains: "" }, "https://anything")).toBe(false);
  });
});

describe("urlFor", () => {
  // Each provider's `urlFor` has to agree with the URL its own
  // `loadNotionEntry` writes into the mapped column, or the badge silently
  // never appears. These pin the two that are built from the id.
  it("rebuilds the url TMDB stores", () => {
    const urlFor = TmdbClient.prototype.urlFor.call(null as any, "438631");

    expect(urlFor).toEqual({
      equals: "https://www.themoviedb.org/movie/438631",
    });
  });

  it("rebuilds the url IGDB stores", () => {
    const urlFor = IgdbClient.prototype.urlFor.call(null as any, "hades");

    expect(urlFor).toEqual({ equals: "https://www.igdb.com/games/hades" });
  });

  // GBook stores Google's canonical link, which carries the title and so
  // cannot be rebuilt — it matches on the opaque volume id instead.
  it("falls back to the volume id for GBook", () => {
    const urlFor = GBookClient.prototype.urlFor.call(
      null as any,
      "zyTuhTFYQg8C",
    );

    expect(urlFor).toEqual({ contains: "zyTuhTFYQg8C" });
  });
});
