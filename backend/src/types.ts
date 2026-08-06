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
  rating: string;
}

export interface GBookDbConfig extends DbConfigBase {
  title: string;
  releaseDate: string;
  genre: string;
  author: string;
}

export interface IgdbConfig extends DbConfigBase {
  title: string;
  releaseDate: string;
  genre: string;
  companies: string;
  rating: string;
}

export interface BilletReducDbConfig extends DbConfigBase {
  title: string;
  genre: string;
  venue: string;
  author: string;
}

export interface ClassificationRule {
  category: string;
  matchers: string[];
}

export interface GoCardlessDbConfig extends DbConfigBase {
  goCardlessAccounts: GoCardlessAccount[];
  title: string;
  valueDate: string;
  bookingDate: string;
  amount: string;
  account: string;
  classification: string;
  classificationRules: ClassificationRule[];
}

export interface GoCardlessAccount {
  requisitionId: string;
  accountIds: string[];
  name: string;
  logo: string;
}

// The backup connectors need no fields beyond the base ones.
export type BackupDbConfig = DbConfigBase;

export type Config =
  | TmdbDbConfig
  | GBookDbConfig
  | BackupDbConfig
  | GoCardlessDbConfig
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
  GoCardless: GoCardlessDbConfig;
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
}

export interface Bank {
  id: string;
  name: string;
  logo: string;
}

export type NotionItem = Omit<CreatePageParameters, "parent">;

// DOMAIN is derived from the DOMAINS registry in domains.ts and re-exported
// at the top of this file, so it cannot drift from the connector table.
