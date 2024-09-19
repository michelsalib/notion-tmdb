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

interface DbConfig {
  id: string;
  url: string;
  status: string;
  title: string;
  director: string;
  year: string;
  genre: string;
  rating: string;
}

export interface UserData {
  id: string;
  dbConfig?: DbConfig;
  notionWorkspace: NotionData;
}

export interface UserConfig {
  notionDatabases: DatabaseObjectResponse[];
  dbConfig: DbConfig;
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
