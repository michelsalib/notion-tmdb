import { FastifyReply, FastifyRequest } from "fastify";
import { Container } from "inversify";
import {
  DB_PROVIDER,
  REPLY,
  REQUEST,
  DOMAIN as DOMAIN_KEY,
} from "./fx/keys.js";
import { route } from "./fx/router.js";
import { AnonymousNotionClient } from "./providers/Notion/AnonymousNotionClient.js";
import type { BitwardenUserData, DOMAIN, NotionUserData } from "./types.js";
import { DbProvider } from "./providers/DbProvider.js";

export class Auth {
  @route({ path: "/logout", method: "GET", authenticate: false })
  async logout(container: Container) {
    const { reply } = container.get<{ reply: FastifyReply }>(REPLY);

    reply.status(302);
    reply.header("location", "/");
    reply.clearCookie("userId");
  }

  @route({ path: "/login", method: "GET", authenticate: false })
  async login(container: Container) {
    const request = container.get<FastifyRequest>(REQUEST);
    const domain = container.get<DOMAIN>(DOMAIN_KEY);
    const { reply } = container.get<{ reply: FastifyReply }>(REPLY);

    if (request.hostname == "localhost") {
      const domain = `notion-${(request.query as any)["state"]!.toLowerCase()}.localhost`;
      const location = `${request.protocol}://${domain}:${request.port}${request.url}`;

      reply.status(302);
      reply.header("location", location);

      return;
    }

    const db = container.get<DbProvider>(DB_PROVIDER);

    if (domain == "BitwardenBackup") {
      const userData: BitwardenUserData = {
        id: (request.query as any)["client_id"] as string,
        bitwardenVault: {
          clientId: (request.query as any)["client_id"] as string,
          clientSecret: (request.query as any)["client_secret"] as string,
        },
        config: {},
      };

      await db.putUser(userData);

      reply.status(302);
      reply.header("location", "/");
      reply.setCookie("userId", userData.id, {
        maxAge: 31_536_000, // 1y
      });

      return;
    }

    const tokenResponse = await container
      .get(AnonymousNotionClient)
      .generateUserToken();
    const existingUser = await db.getUser(tokenResponse.workspace_id);

    const userData: NotionUserData<any> = {
      id: tokenResponse.workspace_id,
      notionWorkspace: {
        workspaceId: tokenResponse.workspace_id,
        workspaceName: tokenResponse.workspace_name as string,
        workspaceIcon: tokenResponse.workspace_icon as string,
        accessToken: tokenResponse.access_token,
      },
      config: existingUser?.config,
    };

    await db.putUser(userData);

    reply.status(302);
    reply.header("location", "/");
    reply.setCookie("userId", userData.id, {
      maxAge: 31_536_000, // 1y
    });
  }
}
