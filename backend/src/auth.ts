import { FastifyReply, FastifyRequest } from 'fastify';
import { Container } from "inversify";
import { REPLY, REQUEST } from "./fx/keys.js";
import { route } from './fx/router.js';
import { CosmosClient } from "./providers/Cosmos/CosmosClient.js";
import { AnonymousNotionClient } from "./providers/Notion/NotionClient.js";
import type { UserData } from "./types.js";

export class Auth {
    @route({ path: '/logout', method: 'GET', authenticate: false })
    async logout(container: Container) {
        const { reply } = container.get<{ reply: FastifyReply }>(REPLY);

        reply.status(302);
        reply.header('location', '/');
        reply.clearCookie('userId');
    }

    @route({ path: '/login', method: 'GET', authenticate: false })
    async login(container: Container) {
        const request = container.get<FastifyRequest>(REQUEST);
        const { reply } = container.get<{ reply: FastifyReply }>(REPLY);

        if (request.hostname == 'localhost') {
            const domain = `notion-${(request.query as any)['state']!.toLowerCase()}.localhost`;
            const location = `${request.protocol}://${domain}:${request.port}${request.url}`;

            reply.status(302);
            reply.header('location', location);

            return;
        }

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

        reply.status(302);
        reply.header('location', '/');
        reply.setCookie('userId', userData.id, {
            maxAge: 31_536_000, // 1y
        });
    }
}
