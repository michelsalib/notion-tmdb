/**
 * What each connector writes into Notion, field by field.
 *
 * This used to live in `frontend/src/DbConfigForm.tsx` as a `getdbFields()`
 * if-chain, which was fine while the form was the only consumer. It no longer
 * is: `POST /api/database` creates a correctly-shaped database from the same
 * list, and the auto-matcher scores existing Notion properties against it. Three
 * consumers restating the same seven fields is exactly the drift `domains.ts`
 * exists to prevent, so the list lives here and everything derives from it.
 *
 * Keyed as `Record<SEARCH_DOMAIN, …>`, so adding a searchable connector to the
 * registry without describing its fields is a compile error.
 */
import { DOMAINS } from "./domains.js";
import type { DOMAIN, NotionDatabase } from "./types.js";

export type NotionPropertyType = NotionDatabase["properties"][string]["type"];

/**
 * The connectors that map columns. The backup ones store no field mapping.
 *
 * Derived from the registry's `searchable` flag rather than listed by hand, so
 * `DOMAIN_FIELDS` below really is `Record<…>`-checked: a new searchable
 * connector without a field list is a compile error instead of a connector that
 * silently maps nothing and then reports itself fully configured.
 */
export type SEARCH_DOMAIN = {
  [K in DOMAIN]: (typeof DOMAINS)[K]["searchable"] extends true ? K : never;
}[DOMAIN];

export interface FieldSpec {
  /** Key on the connector's `DbConfig` — where the chosen property id is stored. */
  key: string;
  /** What the user sees. Connector-specific: TMDB says "TMDB link". */
  label: string;
  /** The Notion property type this field can be mapped onto. */
  columnType: NotionPropertyType;
  required: boolean;
  /** Shown under the field. Describes the user's outcome, not the plugin's internals. */
  description?: string;
  /**
   * Name hints for `guessMapping`. Lowercase, unaccented; both English and
   * French, since the databases people already have are often in French.
   */
  aliases: readonly string[];
  /** Property name used when this app creates the database itself. */
  createAs: string;
}

// Every connector needs a link to match rows against the provider, and a date
// to mark a row as synced. Only the wording differs, so they are generated
// rather than repeated four times.
function linkField(domain: SEARCH_DOMAIN): FieldSpec {
  const label = DOMAINS[domain].label;

  return {
    key: "url",
    label: `${label} link`,
    columnType: "url",
    required: true,
    description: `Where the ${label} link is stored. This is how a row is matched back to ${label}.`,
    aliases: ["url", "link", "lien", "source", label.toLowerCase()],
    createAs: `${label} link`,
  };
}

/** What every connector calls its sync marker. */
export const SYNC_DATE_LABEL = "Sync date";

/**
 * The timestamp of the last successful sync for a row.
 *
 * Never "Status": that sends people to their Notion *status* property, which is
 * the one type this field cannot accept, and they hit a greyed-out option and
 * stop. Nor a per-connector reading like "Date watched" — the value written is
 * `new Date()` at sync time, so it says when the plugin last refreshed the row,
 * not when the user watched the film. Naming it for the latter would mislead
 * anyone who then re-syncs by age.
 *
 * `aliases` still carry the older per-connector wordings so the columns people
 * already have ("Vu le", "Watched on", "Date read") keep auto-matching.
 */
function syncDateField(aliases: readonly string[], noun: string): FieldSpec {
  return {
    key: "status",
    label: SYNC_DATE_LABEL,
    columnType: "date",
    required: true,
    description: `When this ${noun} was last refreshed. Rows left empty are synced next; you can also re-sync anything older than a given age.`,
    aliases: [
      "sync date",
      "last sync",
      "synced",
      "sync",
      "date",
      "added",
      ...aliases,
    ],
    createAs: SYNC_DATE_LABEL,
  };
}

const TITLE: FieldSpec = {
  key: "title",
  label: "Title",
  columnType: "title",
  required: false,
  aliases: ["title", "name", "titre", "nom"],
  createAs: "Title",
};

const GENRE: FieldSpec = {
  key: "genre",
  label: "Genre",
  columnType: "multi_select",
  required: false,
  aliases: ["genre", "genres", "category", "categories", "categorie", "tags"],
  createAs: "Genre",
};

const RELEASE_DATE: FieldSpec = {
  key: "releaseDate",
  label: "Release date",
  columnType: "date",
  required: false,
  aliases: ["release", "released", "release date", "sortie", "year", "annee"],
  createAs: "Release date",
};

const RATING: FieldSpec = {
  key: "rating",
  label: "Rating",
  columnType: "number",
  required: false,
  aliases: ["rating", "score", "note", "vote", "average"],
  createAs: "Rating",
};

const AUTHOR: FieldSpec = {
  key: "author",
  label: "Author",
  columnType: "rich_text",
  required: false,
  aliases: ["author", "auteur", "writer", "by", "ecrivain"],
  createAs: "Author",
};

export const DOMAIN_FIELDS: Record<SEARCH_DOMAIN, readonly FieldSpec[]> = {
  TMDB: [
    linkField("TMDB"),
    syncDateField(["watched", "seen", "vu", "regarde"], "film"),
    TITLE,
    RELEASE_DATE,
    GENRE,
    {
      key: "director",
      label: "Director",
      columnType: "rich_text",
      required: false,
      aliases: ["director", "realisateur", "directed by", "mise en scene"],
      createAs: "Director",
    },
    RATING,
  ],
  IGDB: [
    linkField("IGDB"),
    syncDateField(["played", "joue", "finished", "beaten"], "game"),
    TITLE,
    RELEASE_DATE,
    GENRE,
    {
      key: "companies",
      label: "Studio",
      columnType: "rich_text",
      required: false,
      aliases: [
        "studio",
        "studios",
        "company",
        "companies",
        "developer",
        "publisher",
        "editeur",
      ],
      createAs: "Studio",
    },
    RATING,
  ],
  GBook: [
    linkField("GBook"),
    syncDateField(["read", "lu", "finished", "termine"], "book"),
    TITLE,
    RELEASE_DATE,
    GENRE,
    AUTHOR,
  ],
  BilletReduc: [
    linkField("BilletReduc"),
    syncDateField(["seen", "vu", "watched", "attended"], "play"),
    TITLE,
    GENRE,
    {
      key: "venue",
      label: "Venue",
      columnType: "rich_text",
      required: false,
      aliases: ["venue", "salle", "theatre", "theater", "lieu", "place"],
      createAs: "Venue",
    },
    AUTHOR,
  ],
};

export function isSearchDomain(domain: DOMAIN): domain is SEARCH_DOMAIN {
  return domain in DOMAIN_FIELDS;
}

export function fieldsFor(domain: DOMAIN): readonly FieldSpec[] {
  return isSearchDomain(domain) ? DOMAIN_FIELDS[domain] : [];
}

/**
 * Human-readable reason a property cannot be mapped onto a field.
 *
 * The form used to render incompatible options `disabled` and grey with nothing
 * else — a dead end the user could neither act on nor explain. Every disabled
 * option now carries this string.
 */
export const PROPERTY_TYPE_LABELS: Partial<Record<NotionPropertyType, string>> =
  {
    title: "title",
    rich_text: "text",
    url: "link",
    date: "date",
    number: "number",
    select: "select",
    multi_select: "multi-select",
    status: "status",
    checkbox: "checkbox",
    people: "person",
    files: "files",
    email: "email",
    phone_number: "phone",
    formula: "formula",
    relation: "relation",
    rollup: "rollup",
    created_time: "created time",
    last_edited_time: "last edited time",
  };

export function typeLabel(type: NotionPropertyType): string {
  return PROPERTY_TYPE_LABELS[type] ?? String(type).replace(/_/g, " ");
}
