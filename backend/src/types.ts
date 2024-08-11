interface NotionData {
    workspaceId: string;
    workspaceName: string;
    workspaceIcon: string;
    accessToken: string;
}

export interface UserData {
    id: string;
    dbConfig: {
        id: string;
    };
    notionWorkspace: NotionData;
}