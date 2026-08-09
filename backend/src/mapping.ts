/**
 * Guess which Notion property belongs to which connector field.
 *
 * Mapping columns by hand was the step users abandoned: seven identical
 * dropdowns, each listing every property in the database with the incompatible
 * ones greyed out and unexplained. It is also the step most amenable to being
 * guessed — a database called "Films" with columns "URL", "Watched on", "Name"
 * and "Genres" is unambiguous once you look at both the type and the name.
 *
 * The result is always shown to the user as a reviewable suggestion, never
 * applied silently, so a wrong guess costs one dropdown instead of trust.
 */
import type { FieldSpec, NotionPropertyType } from "./fields.js";

export interface MappableProperty {
  id: string;
  name: string;
  type: NotionPropertyType;
}

export interface Match {
  /** `FieldSpec.key` this property was matched to. */
  key: string;
  propertyId: string;
  /** 0–100. Only matches at or above `MATCH_THRESHOLD` are returned. */
  score: number;
}

/**
 * Below this a name match is too speculative to preselect — the user would
 * have to notice and undo it, which is worse than leaving the field empty.
 */
export const MATCH_THRESHOLD = 55;

/** Lowercase, strip accents and punctuation, collapse whitespace. */
export function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036F]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(value: string): string[] {
  return normalize(value).split(" ").filter(Boolean);
}

/** Every token of `inner` appears in `outer`. */
function covers(outer: string[], inner: string[]): boolean {
  return inner.length > 0 && inner.every((t) => outer.includes(t));
}

/**
 * How well a property name matches one field, ignoring type. 0–100.
 *
 * Deliberately not a generic string distance: "Rating" and "Release date" score
 * high on character overlap but mean completely different things. Matching
 * whole words against a curated alias list is both more accurate here and much
 * easier to reason about when a guess looks wrong.
 */
export function nameScore(propertyName: string, field: FieldSpec): number {
  const name = normalize(propertyName);

  if (!name) {
    return 0;
  }

  const candidates = [normalize(field.label), ...field.aliases.map(normalize)];
  const nameTokens = tokens(propertyName);
  let best = 0;

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    if (name === candidate) {
      best = Math.max(best, 100);
      continue;
    }

    const candidateTokens = candidate.split(" ").filter(Boolean);

    // Containment, on whole words: "watched on" contains the alias "watched".
    //
    // Compared token-wise rather than as raw substrings. Raw `includes` scores
    // any short alias against any word that happens to embed it — GBook's "by"
    // is a substring of "Hobby", which scored 72 and silently mapped an
    // unrelated column as the author field.
    if (
      covers(nameTokens, candidateTokens) ||
      covers(candidateTokens, nameTokens)
    ) {
      const ratio =
        Math.min(name.length, candidate.length) /
        Math.max(name.length, candidate.length);

      best = Math.max(best, 60 + Math.round(ratio * 30));
      continue;
    }

    // Whole-word overlap: "Date I watched it" shares "watched".
    const shared = candidateTokens.filter((t) => nameTokens.includes(t)).length;

    if (shared > 0) {
      const coverage = shared / Math.max(candidateTokens.length, 1);

      best = Math.max(best, 45 + Math.round(coverage * 30));
    }
  }

  return best;
}

/**
 * Match fields to properties.
 *
 * Type compatibility is a hard filter — Notion rejects a write to a property of
 * the wrong type, so a same-type match is the only kind worth suggesting.
 * Assignment is then greedy over every (field, property) pair sorted by how
 * confident the name match is, so the strongest reading of each column wins and
 * no property is ever handed to two fields.
 */
export function guessMapping(
  fields: readonly FieldSpec[],
  properties: readonly MappableProperty[],
): Match[] {
  interface Candidate extends Match {
    required: boolean;
  }

  const candidates: Candidate[] = [];

  for (const field of fields) {
    const compatible = properties.filter((p) => p.type === field.columnType);

    for (const property of compatible) {
      const score = Math.max(
        nameScore(property.name, field),
        unambiguousScore(field, fields, compatible.length),
      );

      if (score >= MATCH_THRESHOLD) {
        candidates.push({
          key: field.key,
          propertyId: property.id,
          score,
          required: field.required,
        });
      }
    }
  }

  // Score leads, `required` only breaks ties. Ordering required-first instead
  // lets a weak required match outrank a strong optional one: on a database
  // whose only date property is called "Release date", the required sync marker
  // scores 70 there (it contains the word "date") while the release-date field
  // scores a literal 100 — and required-first would hand it to the sync marker.
  candidates.sort(
    (a, b) =>
      b.score - a.score ||
      Number(b.required) - Number(a.required) ||
      a.key.localeCompare(b.key),
  );

  const matches: Match[] = [];
  const usedFields = new Set<string>();
  const usedProperties = new Set<string>();

  for (const c of candidates) {
    if (usedFields.has(c.key) || usedProperties.has(c.propertyId)) {
      continue;
    }

    usedFields.add(c.key);
    usedProperties.add(c.propertyId);
    matches.push({ key: c.key, propertyId: c.propertyId, score: c.score });
  }

  return matches;
}

/**
 * Score floor for a field whose target is decidable without reading the name.
 *
 * Applies only when one property of that type exists *and* only one field wants
 * that type — so nothing else could reasonably claim it. The narrowness is the
 * point: a database with a lone date property and both "Date watched" and
 * "Release date" competing for it must stay name-driven, or a column plainly
 * called "Release date" gets silently claimed as the sync marker and every sync
 * afterwards writes to the wrong column.
 */
function unambiguousScore(
  field: FieldSpec,
  fields: readonly FieldSpec[],
  compatibleCount: number,
): number {
  if (compatibleCount !== 1) {
    return 0;
  }

  // Notion guarantees exactly one title property per database, and it is the
  // row's name — whatever the user renamed it to.
  if (field.columnType === "title") {
    return 90;
  }

  const contenders = fields.filter((f) => f.columnType === field.columnType);

  return field.required && contenders.length === 1 ? 80 : 0;
}
