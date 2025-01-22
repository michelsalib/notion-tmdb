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
import { GoCardlessClient } from "./providers/GoCardless/GoCardlessClient.js";
import { NotionClient } from "./providers/Notion/NotionClient.js";
import { NotionBackup } from "./providers/NotionBackup/NotionBackup.js";
import type { Config, DOMAIN, UserData } from "./types.js";
import { generatorSerializer } from "./utils/generator.js";

export class Api {
  @route({ path: "/api/user", method: "GET", authenticate: true })
  async getUser(container: Container) {
    const user: any = container.get(USER);

    if (user?.notionWorkspace?.accessToken) {
      user.notionWorkspace.accessToken = "***"; // hide sensitive data
    }
    if (user?.bitwardenVault?.clientSecret) {
      user.bitwardenVault.clientSecret = "***"; // hide sensitive data
    }

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

    if (domain == "backup" || domain == "BitwardenBackup") {
      const backup = container.get<NotionBackup>(DATA_PROVIDER);

      return Readable.from(generatorSerializer(backup.sync()));
    }

    if (!user.config) {
      return {
        status: 400,
        body: "Notion db needs to be configured first",
      };
    }

    const notionClient = container.get(NotionClient);
    const dataProvider = container.get<DataProvider>(DATA_PROVIDER);

    return Readable.from(
      generatorSerializer(dataProvider.sync(notionClient, user.config)),
    );
  }

  @route({ path: "/api/add", method: "POST", authenticate: true })
  async add(container: Container) {
    const user = container.get<UserData<"GBook" | "TMDB">>(USER);
    const request = container.get<FastifyRequest>(REQUEST);

    if (!user.config) {
      const { reply } = container.get<{ reply: FastifyReply }>(REPLY);

      reply.status(400);

      return "Notion db needs to be configured first";
    }

    const notionClient = container.get(NotionClient);
    const client = container.get<DataProvider>(DATA_PROVIDER);

    // get from tmdb
    const { notionItem, title } = await client.loadNotionEntry(
      (request.query as any)["id"],
      user.config,
    );

    // put into notion
    await notionClient.createPage({
      ...notionItem,
      parent: {
        database_id: user.config.id,
      },
    });

    return `Sucess loading ${title}`;
  }

  @route({ path: "/api/config", method: "GET", authenticate: true })
  async getConfig(container: Container) {
    const user = container.get<UserData<any>>(USER);
    const domain = container.get<DOMAIN>(DOMAIN_KEY);

    if (domain == "backup" || domain == "BitwardenBackup") {
      const backup = container.get<NotionBackup>(DATA_PROVIDER);

      return {
        backupDate: await backup.getBackupDate(),
        config: user.config,
      };
    }

    const notionDatabases = await container.get(NotionClient).listDatabases();

    return {
      notionDatabases,
      config: user.config,
    };
  }

  @route({ path: "/api/config", method: "POST", authenticate: true })
  async postConfig(container: Container) {
    const request = container.get<FastifyRequest>(REQUEST);
    const config: Config = (request.body as any).config;
    const cosmos = container.get<DbProvider>(DB_PROVIDER);
    const userId = container.get<string>(USER_ID);

    await cosmos.putUserConfig(userId, config);

    return "Config saved";
  }

  @route({ path: "/api/backup", method: "GET", authenticate: true })
  async getBackup(container: Container) {
    const backup = container.get<NotionBackup>(DATA_PROVIDER);

    return {
      link: await backup.getLink(),
    };
  }

  @route({ path: "/api/banks", method: "GET", authenticate: true })
  async listBanks(container: Container) {
    const goCardless = container.get<GoCardlessClient>(DATA_PROVIDER);

    return {
      banks: await goCardless.listBanks(),
    };
  }

  @route({ path: "/api/accounts", method: "POST", authenticate: true })
  async addAccount(container: Container) {
    const goCardless = container.get<GoCardlessClient>(DATA_PROVIDER);
    const request = container.get<FastifyRequest>(REQUEST);

    return {
      link: await goCardless.addAccount(
        (request.query as any)["id"],
        request.headers["referer"]!,
      ),
    };
  }

  @route({ path: "/api/accounts", method: "GET", authenticate: true })
  async storeAccount(container: Container) {
    const request = container.get<FastifyRequest>(REQUEST);
    const { reply } = container.get<{ reply: FastifyReply }>(REPLY);
    const userId = container.get<string>(USER_ID);
    const { config } = container.get<UserData<"GoCardless">>(USER);
    const cosmos = container.get<DbProvider>(DB_PROVIDER);
    const goCardless = container.get<GoCardlessClient>(DATA_PROVIDER);

    if (!config) {
      const { reply } = container.get<{ reply: FastifyReply }>(REPLY);

      reply.status(400);

      return "Notion db needs to be configured first";
    }

    const account = await goCardless.retrieveAccount(
      (request.query as any)["ref"],
    );
    config.goCardlessAccounts.push(account);

    await cosmos.putUserConfig(userId, config);

    reply.status(302);
    reply.header("location", "/");
  }
}
