import type {
  CreatePageParameters,
  DatabaseObjectResponse,
} from "@notionhq/client/build/src/api-endpoints.js";
import type { DOMAIN } from "./domains.js";

export type { DOMAIN };

export interface NotionData {
  workspaceId: string;
  workspaceName: string;
  workspaceIcon: string;
  accessToken: string;
}

export interface BitwardenData {
  clientId: string;
  clientSecret: string;
}

interface DbConfigBase {
  // Database identifier
  id: string;
  // DB Entry identifer in the Data provider (book ulr, movie url, ...)
  url: string;
  // Sync status
  status: string;
}

export interface TmdbDbConfig extends DbConfigBase {
  title: string;
  releaseDate: string;
  genre: string;
  director: string;
  cast: string;
  rating: string;
  runtime: string;
}

export interface GBookDbConfig extends DbConfigBase {
  title: string;
  releaseDate: string;
  genre: string;
  author: string;
  publisher: string;
  pageCount: string;
}

export interface IgdbConfig extends DbConfigBase {
  title: string;
  releaseDate: string;
  genre: string;
  companies: string;
  rating: string;
  criticRating: string;
  platforms: string;
}

export interface BilletReducDbConfig extends DbConfigBase {
  title: string;
  genre: string;
  venue: string;
  author: string;
  cast: string;
  rating: string;
}

// The backup connectors need no fields beyond the base ones.
export type BackupDbConfig = DbConfigBase;

export type Config =
  | TmdbDbConfig
  | GBookDbConfig
  | BackupDbConfig
  | IgdbConfig
  | BilletReducDbConfig;

// Keyed off the DOMAIN union rather than a conditional chain: an index
// signature makes every member's config type a compile error to omit, whereas
// the old chain tested `T extends "Backup"` against a union whose member is
// lowercase `"backup"` and had no arm at all for "BitwardenBackup". Both fell
// through to a `{ [key: string]: never }` catch-all, so `DomainToConfig` for
// either backup connector silently resolved to a type with no usable fields.
interface DomainConfigMap extends Record<DOMAIN, Config> {
  GBook: GBookDbConfig;
  TMDB: TmdbDbConfig;
  IGDB: IgdbConfig;
  BilletReduc: BilletReducDbConfig;
  backup: BackupDbConfig;
  BitwardenBackup: BackupDbConfig;
}

export type DomainToConfig<T extends DOMAIN> = DomainConfigMap[T];

export interface UserData<T extends DOMAIN> {
  id: string;
  // Optional: a user exists from the moment they complete OAuth, but has no
  // config until they pick a Notion database. Every consumer already guarded
  // with `if (!user.config)`; the type just used to claim otherwise.
  config?: DomainToConfig<T>;
}

export interface NotionUserData<T extends DOMAIN> extends UserData<T> {
  notionWorkspace: NotionData;
}

export interface BitwardenUserData extends UserData<"BitwardenBackup"> {
  bitwardenVault: BitwardenData;
}

export type NotionDatabase = DatabaseObjectResponse;

export interface UserConfig<T extends DOMAIN> {
  notionDatabases?: NotionDatabase[];
  config?: DomainToConfig<T>;
  backupDate?: Date;
}

export interface Suggestion {
  id: string;
  title: string;
  releaseDate: string;
  posterPath: string;
  subtitle: string;
  /**
   * The row this item already has in the user's database, if any.
   *
   * Never set by `search()`, which is unauthenticated and knows nothing about a
   * workspace — it is filled in afterwards by `GET /api/existing` and merged in
   * by the widget. Adding a title twice was the commonest mistake the search
   * panel allowed, because nothing on a result said it was already there.
   */
  existing?: { url: string };
}

/**
 * How a connector recognises one of its own rows by the URL it stored.
 *
 * Two shapes because the connectors divide cleanly. TMDB and IGDB build the
 * stored URL from the id, so they can ask for an exact match. GBook stores
 * Google's `canonicalVolumeLink` and BilletRéduc stores whatever the page's
 * JSON-LD declares as canonical; neither is derivable from the id, so they
 * match on a token instead — a Google volume id and a BilletRéduc path both
 * carry enough entropy that a substring hit is the row and not a coincidence.
 *
 * Exactness matters more than reach here: a miss shows no badge, which is the
 * status quo, while a false hit tells someone a film is already in their
 * database when it is not, and they do not add it.
 */
export interface UrlMatch {
  equals?: string;
  contains?: string;
}

/** One line of the landing page's "lands in Notion as" preview. */
export interface FieldPreview {
  key: string;
  label: string;
  value: string;
}

/**
 * One line of sync progress.
 *
 * `sync()` used to yield bare strings, which the widget could only render as a
 * toast that each new line overwrote — "Loaded 12" with no denominator, no
 * history, and no way to tell a slow run from a stalled one. Carrying the
 * counts alongside the message lets the widget draw real progress inline.
 *
 * The backup connectors have nothing to count, so a plain string is still a
 * valid thing to yield and simply arrives with no counts attached.
 */
export interface SyncEvent {
  message: string;
  /** How many items this run will touch. Sent with the opening event. */
  total?: number;
  /** How many have been handled so far. */
  current?: number;
  /** Set on the closing event, whatever the outcome. */
  done?: boolean;
}

/** A page the connector may create a database inside. */
export interface NotionPage {
  id: string;
  title: string;
}

export interface SyncOptions {
  /**
   * Also refresh rows whose sync date is before this instant (ISO 8601).
   *
   * Omitted, sync only picks up rows that have never been synced — which is
   * every row a user adds, but never a row whose provider data has since
   * changed. A cutoff turns the same run into "refresh anything older than
   * this", which is the only way to pick up a rating or a release date that
   * moved after the row was first filled in.
   */
  staleBefore?: string;
}

export type NotionItem = Omit<CreatePageParameters, "parent">;

// DOMAIN is derived from the DOMAINS registry in domains.ts and re-exported
// at the top of this file, so it cannot drift from the connector table.
