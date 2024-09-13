import azure from "@azure/functions";
import { scopeContainer } from "./fx/di.js";
import { CosmosClient } from "./providers/Cosmos/CosmosClient.js";
import { AnonymousNotionClient } from "./providers/Notion/NotionClient.js";
import type { UserData } from "./types.js";

azure.app.get('logout', async (): Promise<azure.HttpResponseInit> => {
    return {
        status: 302,
        headers: {
            location: '/',
        },
        cookies: [
            {
                name: 'userId',
                value: '',
            },
        ],
    };
});

azure.app.get('login', async (request: azure.HttpRequest, context: azure.InvocationContext): Promise<azure.HttpResponseInit> => {
    if (/http:\/\/localhost:/.test(request.url)) {
        const domain = `notion-${request.query.get('state')?.toLowerCase()}.localhost`;
        const location = request.url.replace('localhost', domain);

        return {
            status: 302,
            headers: {
                location,
            },
        };
    }
    
    const container = await scopeContainer(request, context, false);
    const cosmos = container.get(CosmosClient);

    const tokenResponse = await container.get(AnonymousNotionClient).generateUserToken();
    const existingUser = await cosmos.getUser(tokenResponse.workspace_id);

    const userData: UserData = {
        id: tokenResponse.workspace_id,
        notionWorkspace: {
            workspaceId: tokenResponse.workspace_id,
            workspaceName: tokenResponse.workspace_name as string,
            workspaceIcon: tokenResponse.workspace_icon as string,
            accessToken: tokenResponse.access_token,
        },
        dbConfig: existingUser?.dbConfig,
    };

    await cosmos.putUser(userData);

    return {
        status: 302,
        headers: {
            location: request.url.split('/login')[0],
        },
        cookies: [
            {
                name: 'userId',
                value: userData.id,
                maxAge: 31_536_000, // 1 year
            },
        ],
    };
});
