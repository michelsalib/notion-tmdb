import { FastifyReply, FastifyRequest } from "fastify";
import { Container } from "inversify";
import { Readable } from "node:stream";
import {
  DATA_PROVIDER,
  DB_PROVIDER,
  DOMAIN as DOMAIN_KEY,
  REPLY,
  REQUEST,
  USER,
  USER_ID,
} from "./fx/keys.js";
import { route } from "./fx/router.js";
import { DataProvider } from "./providers/DataProvider.js";
import { DbProvider } from "./providers/DbProvider.js";
import { NotionClient } from "./providers/Notion/NotionClient.js";
import { Backup } from "./services/Backup.js";
import type { DbConfig, DOMAIN, UserData } from "./types.js";

export class Api {
  @route({ path: "/api/user", method: "GET", authenticate: true })
  async getUser(container: Container) {
    const user = container.get<UserData<any>>(USER);
    user.notionWorkspace.accessToken = "***"; // hide sensitive data

    return { user };
  }

  @route({ path: "/api/search", method: "GET", authenticate: false })
  async search(container: Container) {
    const client = container.get<DataProvider>(DATA_PROVIDER);
    const request = container.get<FastifyRequest>(REQUEST);

    const results = await client.search((request.query as any)["query"]);

    return { results };
  }

  @route({ path: "/api/sync", method: "POST", authenticate: true })
  async sync(container: Container) {
    const user = container.get<UserData<any>>(USER);
    const domain = container.get<DOMAIN>(DOMAIN_KEY);
    const { reply } = container.get<{ reply: FastifyReply }>(REPLY);
    reply.header("content-type", "multipart/text");

    if (domain == "backup") {
      const backup = container.get<Backup>(DATA_PROVIDER);

      return Readable.from(backup.sync());
    }

    if (!user.dbConfig) {
      return {
        status: 400,
        body: "Notion db needs to be configured first",
      };
    }

    const notionClient = container.get(NotionClient);
    const dataProvider = container.get<DataProvider>(DATA_PROVIDER);

    return Readable.from(dataProvider.sync(notionClient, user.dbConfig));
  }

  @route({ path: "/api/add", method: "POST", authenticate: true })
  async add(container: Container) {
    const user = container.get<UserData<"GBook" | "TMDB">>(USER);
    const request = container.get<FastifyRequest>(REQUEST);

    if (!user.dbConfig) {
      const { reply } = container.get<{ reply: FastifyReply }>(REPLY);

      reply.status(400);

      return "Notion db needs to be configured first";
    }

    const notionClient = container.get(NotionClient);
    const client = container.get<DataProvider>(DATA_PROVIDER);

    // get from tmdb
    const { notionItem, title } = await client.loadNotionEntry(
      (request.query as any)["id"],
      user.dbConfig,
    );

    // put into notion
    await notionClient.createPage({
      ...notionItem,
      parent: {
        database_id: user.dbConfig.id,
      },
    });

    return `Sucess loading ${title}`;
  }

  @route({ path: "/api/config", method: "GET", authenticate: true })
  async getConfig(container: Container) {
    const user = container.get<UserData<any>>(USER);
    const domain = container.get<DOMAIN>(DOMAIN_KEY);

    if (domain == "backup") {
      const backup = container.get<Backup>(DATA_PROVIDER);

      return {
        backupDate: await backup.getBackupDate(),
        dbConfig: user.dbConfig,
      };
    }

    const notionDatabases = await container.get(NotionClient).listDatabases();

    return {
      notionDatabases,
      dbConfig: user.dbConfig,
    };
  }

  @route({ path: "/api/config", method: "POST", authenticate: true })
  async postConfig(container: Container) {
    const request = container.get<FastifyRequest>(REQUEST);
    const dbConfig: DbConfig = (request.body as any).dbConfig;
    const cosmos = container.get<DbProvider>(DB_PROVIDER);
    const userId = container.get<string>(USER_ID);

    await cosmos.putUserConfig(userId, dbConfig);

    return "Config saved";
  }

  @route({ path: "/api/backup", method: "GET", authenticate: true })
  async getBackup(container: Container) {
    const backup = container.get<Backup>(DATA_PROVIDER);

    return {
      link: await backup.getLink(),
    };
  }
}
