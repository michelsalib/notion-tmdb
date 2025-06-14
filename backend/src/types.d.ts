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

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface BackupDbConfig extends DbConfigBase {}

export type Config = TmdbConfig | GBookConfig | BackupConfig | GoCardlessConfig;

export type DomainToConfig<T extends DOMAIN> = T extends "GBook"
  ? GBookDbConfig
  : T extends "TMDB"
    ? TmdbDbConfig
    : T extends "GoCardless"
      ? GoCardlessDbConfig
      : T extends "IGDB"
        ? IgdbConfig
        : T extends "Backup"
          ? BackupDbConfig
          : { [key: string]: never };

export interface UserData<T extends DOMAIN> {
  id: string;
  config: DomainToConfig<T>;
}

export interface NotionUserData<T extends DOMAIN> extends UserData<T> {
  notionWorkspace: NotionData;
}

export interface BitwardenUserData extends UserData<"BitwardenBackup"> {
  bitwardenVault: BitwardenData;
}

export type NotionDatabase = DatabaseObjectResponse;

export interface UserConfig<T extends DOMAIN> {
  notionDatabases?: NotionDatabases[];
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

export type DOMAIN =
  | "GBook"
  | "TMDB"
  | "backup"
  | "GoCardless"
  | "BitwardenBackup"
  | "IGDB";
