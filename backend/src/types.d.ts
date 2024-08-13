import type { DatabaseObjectResponse } from "@notionhq/client/build/src/api-endpoints.js";

export interface NotionData {
    workspaceId: string;
    workspaceName: string;
    workspaceIcon: string;
    accessToken: string;
}

export interface DbConfig {
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
