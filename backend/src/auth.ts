import { DependencyContainer, injectable } from "tsyringe";
import {
  DB_PROVIDER,
  DOMAIN as DOMAIN_KEY,
  REPLY,
  REQUEST,
} from "./fx/keys.js";
import { Router, type ScopedReply, type ScopedRequest } from "./fx/router.js";
import type { DbProvider } from "./providers/DbProvider.js";
import { AnonymousNotionClient } from "./providers/Notion/AnonymousNotionClient.js";
import type { BitwardenUserData, DOMAIN, NotionUserData } from "./types.js";

@injectable()
export class Auth {
  async logout(container: DependencyContainer) {
    const { reply } = container.resolve<{ reply: ScopedReply }>(REPLY);

    reply.status(302);
    reply.header("location", "/");
    reply.clearCookie("userId");
  }

  async login(container: DependencyContainer) {
    const request = container.resolve<ScopedRequest>(REQUEST);
    const domain = container.resolve<DOMAIN>(DOMAIN_KEY);
    const { reply } = container.resolve<{ reply: ScopedReply }>(REPLY);

    if (request.hostname == "localhost") {
      const domain = `notion-${(request.query as any)["state"]!.toLowerCase()}.localhost`;
      const location = `${request.protocol}://${domain}:${request.port}${request.url}`;

      reply.status(302);
      reply.header("location", location);

      return;
    }

    const db = container.resolve<DbProvider>(DB_PROVIDER);

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
      .resolve(AnonymousNotionClient)
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
      config: existingUser?.config || {},
    };

    await db.putUser(userData);

    reply.status(302);
    reply.header("location", "/");
    reply.setCookie("userId", userData.id, {
      maxAge: 31_536_000, // 1y
    });
  }
}

Router.register(Auth, "logout", {
  path: "/logout",
  method: "GET",
  authenticate: false,
});
Router.register(Auth, "login", {
  path: "/login",
  method: "GET",
  authenticate: false,
});
