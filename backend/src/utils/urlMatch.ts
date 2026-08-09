import type { UrlMatch } from "../types.js";

/**
 * Does the URL stored on a Notion row identify the item `match` describes?
 *
 * Applied after the Notion query rather than instead of it: the query is a
 * disjunction over every result in the search, so the response says that *some*
 * arm matched but never which. This re-tests each candidate against each row to
 * pair them back up.
 *
 * The asymmetry between the two forms is deliberate — see `UrlMatch`. A miss
 * costs a badge that would have been nice to have; a false hit tells someone a
 * film is already in their database when it is not, and they don't add it.
 */
export function matchesUrl(match: UrlMatch, storedUrl: string): boolean {
  if (match.equals !== undefined) {
    return storedUrl === match.equals;
  }

  if (match.contains !== undefined) {
    // An empty token would match every row in the database.
    return match.contains.length > 0 && storedUrl.includes(match.contains);
  }

  return false;
}
