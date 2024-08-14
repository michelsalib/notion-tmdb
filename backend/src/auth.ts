import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { Client } from "@notionhq/client";
import { config } from "./config.js";
import { createCosmoClient } from "./providers/cosmo.js";
import type { UserData } from "./types.js";

export function getUserId(request: HttpRequest): string {
    const regex = /userId=([\w-]*)/;
    let userId = regex.exec(request.headers.get('cookie') as string)?.[1] as string;

    if (!userId) {
        userId = regex.exec(request.headers.get('referer') as string)?.[1] as string;
    }

    if (!userId) {
        throw 'User not authenticated';
    }

    return userId;
}

async function getUser(userId: string): Promise<UserData> {
    const item = await createCosmoClient().item(userId, userId).read();

    return item.resource;
}

export async function getLoggedUser(request: HttpRequest): Promise<UserData> {
    const userId = getUserId(request);

    return getUser(userId);
}

app.get('logout', async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
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

app.get('login', async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const tokenResponse = await new Client()
        .oauth
        .token({
            client_id: config.NOTION_CLIENT_ID,
            client_secret: config.NOTION_CLIENT_SECRET,
            code: request.query.get('code') as string,
            grant_type: 'authorization_code',
            redirect_uri: request.url.split('?')[0],
        });

    const existingUser = await getUser(tokenResponse.workspace_id);

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

    const cosmo = createCosmoClient();
    cosmo.items.upsert(userData);

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
