import { describe, expect, test } from "bun:test";
import { DOMAIN_FIELDS } from "./fields.js";
import {
  guessMapping,
  MATCH_THRESHOLD,
  type MappableProperty,
  nameScore,
  normalize,
} from "./mapping.js";

const TMDB = DOMAIN_FIELDS.TMDB;
const field = (key: string) => TMDB.find((f) => f.key === key)!;

function props(
  ...entries: [name: string, type: MappableProperty["type"]][]
): MappableProperty[] {
  return entries.map(([name, type], i) => ({ id: `p${i}`, name, type }));
}

const byKey = (matches: ReturnType<typeof guessMapping>) =>
  Object.fromEntries(matches.map((m) => [m.key, m.propertyId]));

describe("normalize", () => {
  test("strips accents, case and punctuation", () => {
    expect(normalize("Réalisateur")).toBe("realisateur");
    expect(normalize("Date  watched!")).toBe("date watched");
    expect(normalize("  Mise-en-scène  ")).toBe("mise en scene");
  });
});

describe("nameScore", () => {
  test("an exact label match beats a partial one", () => {
    expect(nameScore("Genre", field("genre"))).toBe(100);
    expect(nameScore("Genres", field("genre"))).toBe(100); // alias
    expect(nameScore("Main genre", field("genre"))).toBeLessThan(100);
  });

  test("matches French column names through the alias list", () => {
    expect(nameScore("Réalisateur", field("director"))).toBe(100);
    expect(nameScore("Sortie", field("releaseDate"))).toBe(100);
  });

  test("unrelated names score below the threshold", () => {
    expect(nameScore("Budget", field("director"))).toBeLessThan(
      MATCH_THRESHOLD,
    );
    expect(nameScore("Notes", field("genre"))).toBeLessThan(MATCH_THRESHOLD);
  });

  test("a short alias does not match a word that merely embeds it", () => {
    // GBook's "by" is a substring of "Hobby". Raw substring containment scored
    // that 72 and silently mapped an unrelated column as the author field.
    const author = DOMAIN_FIELDS.GBook.find((f) => f.key === "author")!;

    expect(nameScore("Hobby", author)).toBeLessThan(MATCH_THRESHOLD);
    expect(nameScore("Nearby", author)).toBeLessThan(MATCH_THRESHOLD);
    // …but the alias itself still matches on a word boundary.
    expect(nameScore("Written by", author)).toBeGreaterThanOrEqual(
      MATCH_THRESHOLD,
    );
  });

  test("does not confuse Rating with Release date", () => {
    expect(nameScore("Rating", field("releaseDate"))).toBeLessThan(
      MATCH_THRESHOLD,
    );
    expect(nameScore("Release date", field("rating"))).toBeLessThan(
      MATCH_THRESHOLD,
    );
  });

  // Each connector now has two fields of some type where it used to have one,
  // so the pairs below compete for the same columns and only the alias lists
  // keep them apart.
  test("a second field of the same type does not poach the first one's column", () => {
    // TMDB: Cast and Director are both rich_text, Runtime and Rating both numbers.
    expect(nameScore("Director", field("cast"))).toBeLessThan(MATCH_THRESHOLD);
    expect(nameScore("Réalisateur", field("cast"))).toBeLessThan(
      MATCH_THRESHOLD,
    );
    expect(nameScore("Rating", field("runtime"))).toBeLessThan(MATCH_THRESHOLD);
    expect(nameScore("Note", field("runtime"))).toBeLessThan(MATCH_THRESHOLD);

    // GBook: Publisher and Author are both rich_text. "Published by" has to
    // reach Publisher even though AUTHOR's "by" also matches it.
    const gbook = (key: string) =>
      DOMAIN_FIELDS.GBook.find((f) => f.key === key)!;

    expect(nameScore("Publisher", gbook("author"))).toBeLessThan(
      MATCH_THRESHOLD,
    );
    expect(nameScore("Published by", gbook("publisher"))).toBeGreaterThan(
      nameScore("Published by", gbook("author")),
    );

    // IGDB: a bare score column belongs to the players' rating, not the press's.
    const igdb = (key: string) =>
      DOMAIN_FIELDS.IGDB.find((f) => f.key === key)!;

    expect(nameScore("Rating", igdb("criticRating"))).toBeLessThan(
      nameScore("Rating", igdb("rating")),
    );
    expect(nameScore("Note", igdb("criticRating"))).toBeLessThan(
      nameScore("Note", igdb("rating")),
    );
  });
});

describe("guessMapping", () => {
  test("maps a conventionally named database end to end", () => {
    const mapped = byKey(
      guessMapping(
        TMDB,
        props(
          ["Name", "title"],
          ["URL", "url"],
          ["Watched on", "date"],
          ["Release date", "date"],
          ["Genres", "multi_select"],
          ["Director", "rich_text"],
          ["Rating", "number"],
        ),
      ),
    );

    expect(mapped).toEqual({
      title: "p0",
      url: "p1",
      status: "p2",
      releaseDate: "p3",
      genre: "p4",
      director: "p5",
      rating: "p6",
    });
  });

  test("never maps a property onto an incompatible type", () => {
    // "Watched on" is the right *name* for status but a checkbox, not a date.
    const mapped = byKey(
      guessMapping(TMDB, props(["Watched on", "checkbox"], ["URL", "url"])),
    );

    expect(mapped["status"]).toBeUndefined();
    expect(mapped["url"]).toBe("p1");
  });

  test("claims the only title property whatever it is called", () => {
    const mapped = byKey(guessMapping(TMDB, props(["Œuvre", "title"])));

    expect(mapped["title"]).toBe("p0");
  });

  test("a lone date property does not get claimed as the sync marker when it is plainly the release date", () => {
    // The regression the conservative rule exists for: silently taking this as
    // `status` would make every sync write to the release-date column.
    const mapped = byKey(guessMapping(TMDB, props(["Release date", "date"])));

    expect(mapped["releaseDate"]).toBe("p0");
    expect(mapped["status"]).toBeUndefined();
  });

  test("required fields get first pick of an ambiguous date", () => {
    // Both fields could take "Date"; status is required, so it wins.
    const mapped = byKey(guessMapping(TMDB, props(["Date", "date"])));

    expect(mapped["status"]).toBe("p0");
    expect(mapped["releaseDate"]).toBeUndefined();
  });

  test("one property is never assigned to two fields", () => {
    const matches = guessMapping(
      TMDB,
      props(["Date", "date"], ["Date", "date"]),
    );
    const ids = matches.map((m) => m.propertyId);

    expect(new Set(ids).size).toBe(ids.length);
  });

  test("leaves everything unmapped for an empty database", () => {
    expect(guessMapping(TMDB, [])).toEqual([]);
  });

  test("skips speculative matches rather than guessing wrong", () => {
    const mapped = byKey(
      guessMapping(TMDB, props(["Col A", "rich_text"], ["Col B", "number"])),
    );

    expect(mapped).toEqual({});
  });

  test("assigns each new field its own column end to end", () => {
    const mapped = byKey(
      guessMapping(
        TMDB,
        props(
          ["Name", "title"],
          ["URL", "url"],
          ["Watched on", "date"],
          ["Director", "rich_text"],
          ["Cast", "rich_text"],
          ["Rating", "number"],
          ["Runtime", "number"],
        ),
      ),
    );

    expect(mapped["director"]).toBe("p3");
    expect(mapped["cast"]).toBe("p4");
    expect(mapped["rating"]).toBe("p5");
    expect(mapped["runtime"]).toBe("p6");
  });

  test("every connector maps its own conventional shape", () => {
    const shapes: Record<string, MappableProperty[]> = {
      GBook: props(
        ["Title", "title"],
        ["Link", "url"],
        ["Date read", "date"],
        ["Author", "rich_text"],
      ),
      IGDB: props(
        ["Title", "title"],
        ["Link", "url"],
        ["Date played", "date"],
        ["Studio", "rich_text"],
      ),
      BilletReduc: props(
        ["Title", "title"],
        ["Link", "url"],
        ["Date seen", "date"],
        ["Venue", "rich_text"],
      ),
    };

    for (const [domain, properties] of Object.entries(shapes)) {
      const mapped = byKey(
        guessMapping(
          DOMAIN_FIELDS[domain as keyof typeof DOMAIN_FIELDS],
          properties,
        ),
      );

      expect(mapped["title"]).toBe("p0");
      expect(mapped["url"]).toBe("p1");
      expect(mapped["status"]).toBe("p2");
    }
  });
});
