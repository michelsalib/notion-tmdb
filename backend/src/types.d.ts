import type {
  DatabaseObjectResponse,
  CreatePageParameters,
} from "@notionhq/client/build/src/api-endpoints.js";

export interface NotionData {
  workspaceId: string;
  workspaceName: string;
  workspaceIcon: string;
  accessToken: string;
}

export interface DbConfig {
  // Database identifier
  id: string;
  // DB Entry identifer in the Data provider (book ulr, movie url, ...)
  url: string;
  // Sync status
  status: string;
  // other common fields
  title: string;
  releaseDate: string;
  genre: string;
}

export interface TmdbDbConfig extends DbConfig {
  director: string;
  rating: string;
}

export interface GBookDbConfig extends DbConfig {
  author: string;
}

export interface UserData {
  id: string;
  dbConfig?: DbConfig;
  notionWorkspace: NotionData;
}

export type NotionDatabase = DatabaseObjectResponse;

export interface UserConfig<T extends DbConfig> {
  notionDatabases: NotionDatabases[];
  dbConfig: T;
}

export interface Suggestion {
  id: string;
  title: string;
  releaseDate: string;
  posterPath: string;
  subtitle: string;
}

export type NotionItem = Omit<CreatePageParameters, "parent">;

export type DOMAIN = "GBook" | "TMDB";
