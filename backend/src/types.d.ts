import type {
  CreatePageParameters,
  DatabaseObjectResponse,
} from "@notionhq/client/build/src/api-endpoints.js";

export interface NotionData {
  workspaceId: string;
  workspaceName: string;
  workspaceIcon: string;
  accessToken: string;
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

export interface ClassificationRule {
  category: string;
  matchers: string[];
}

export interface GoCardlessDbConfig extends DbConfigBase {
  goCardlessId: string;
  goCardlessKey: string;
  goCardlessAccounts: string[];
  title: string;
  valueDate: string;
  bookingDate: string;
  amount: string;
  account: string;
  classification: string;
  classificationRules: ClassificationRule[];
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface BackupDbConfig extends DbConfigBase {}

export type DbConfig =
  | TmdbDbConfig
  | GBookDbConfig
  | BackupDbConfig
  | GoCardlessDbConfig;

export type DomainToDbConfig<T extends DOMAIN> = T extends "GBook"
  ? GBookDbConfig
  : T extends "TMDB"
    ? TmdbDbConfig
    : T extends "GoCardless"
      ? GoCardlessDbConfig
      : BackupDbConfig;

export interface UserData<T extends DOMAIN> {
  id: string;
  dbConfig?: DomainToDbConfig<T>;
  notionWorkspace: NotionData;
}

export type NotionDatabase = DatabaseObjectResponse;

export interface UserConfig<T extends DOMAIN> {
  notionDatabases: NotionDatabases[];
  dbConfig?: DomainToDbConfig<T>;
  backupDate?: Date;
}

export interface Suggestion {
  id: string;
  title: string;
  releaseDate: string;
  posterPath: string;
  subtitle: string;
}

export type NotionItem = Omit<CreatePageParameters, "parent">;

export type DOMAIN = "GBook" | "TMDB" | "backup" | "GoCardless";
