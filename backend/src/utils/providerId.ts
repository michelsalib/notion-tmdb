import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints.js";

/**
 * The provider's own id, read out of the link a Notion row stores.
 *
 * These parse the value as a URL and take the id off the parsed path or query,
 * rather than regexing it off the end of the raw string. A link copied from a
 * provider's own website routinely carries a query string
 * (`…/movie/550?language=fr-FR`) or a fragment, and the greedy `(.*)$` these
 * replace swallowed all of it into the id. TMDB then received
 * `/movie/550?language=fr-FR`, axios appended its own `language=fr-FR` after
 * the one already there, and TMDB answered `400 Invalid parameters` — which,
 * because one throw ends the whole generator, left every other row in the run
 * untouched. A trailing slash was a 404 for the same reason.
 *
 * `undefined` means "no id in this link". The caller reports that row and moves
 * on instead of requesting `/movie/undefined`.
 */

/**
 * The link cell of a row, found by property id rather than by name.
 *
 * Returns `undefined` rather than throwing when the column is absent or empty:
 * `listDatabaseEntries` filters on `is_not_empty`, but a row can race a user
 * clearing the cell, and reading `.url` off the missing property took the whole
 * run down with a `TypeError`.
 */
export function entryUrl(
  entry: PageObjectResponse,
  urlProperty: string,
): string | undefined {
  const property = Object.values(entry.properties ?? {}).find(
    (p) => p.id === urlProperty,
  );

  return property && "url" in property
    ? (property.url ?? undefined)
    : undefined;
}

function parse(url: unknown): URL | undefined {
  if (typeof url !== "string") {
    return undefined;
  }

  try {
    return new URL(url);
  } catch {
    return undefined;
  }
}

/** The path segment right after `segment`: `/movie/550-fight-club` → `550-fight-club`. */
export function idAfterSegment(
  url: unknown,
  segment: string,
): string | undefined {
  const parsed = parse(url);

  if (!parsed) {
    return undefined;
  }

  const parts = parsed.pathname.split("/").filter(Boolean);
  const index = parts.indexOf(segment);

  return index === -1 ? undefined : parts[index + 1];
}

/** A query parameter: `/books?id=abc&hl=fr` → `abc`. */
export function idFromQuery(url: unknown, param: string): string | undefined {
  return parse(url)?.searchParams.get(param) || undefined;
}
