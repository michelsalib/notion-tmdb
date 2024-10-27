import { FastifyReply, FastifyRequest } from "fastify";
import { Container } from "inversify";
import {
  DATA_PROVIDER,
  DOMAIN as DOMAIN_KEY,
  REPLY,
  REQUEST,
  USER,
  USER_ID,
} from "./fx/keys.js";
import { route } from "./fx/router.js";
import { CosmosClient } from "./providers/Cosmos/CosmosClient.js";
import { DataProvider } from "./providers/DataProvider.js";
import { NotionClient } from "./providers/Notion/NotionClient.js";
import { Backup } from "./services/Backup.js";
import { DbConfig, DOMAIN, UserData } from "./types.js";
import { Readable } from "node:stream";

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
    const user = container.get<UserData<"GBook" | "TMDB">>(USER);

    if (!user.dbConfig) {
      return {
        status: 400,
        body: "Notion db needs to be configured first",
      };
    }

    // const notionClient = createNotionClient(user.notionWorkspace.accessToken);
    const notionClient = container.get(NotionClient);
    const dataProvider = container.get<DataProvider>(DATA_PROVIDER);

    const entriesToLoad = await notionClient.listDatabaseEntries(user.dbConfig);

    for (const entry of entriesToLoad) {
      const url: string = (
        Object.values(entry.properties).find(
          (p) => p.id == user.dbConfig?.url,
        ) as any
      ).url;
      const id = dataProvider.extractId(url);

      // load from tmdb
      const newEntry = await dataProvider.loadNotionEntry(id, user.dbConfig);

      // populate in notion
      await notionClient.updatePage({
        ...newEntry,
        page_id: entry.id,
      });
    }

    return `Sucess ${entriesToLoad.length} item(s).`;
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

    // const notionClient = createNotionClient(user.notionWorkspace.accessToken);
    const notionClient = container.get(NotionClient);
    const client = container.get<DataProvider>(DATA_PROVIDER);

    // get from tmdb
    const entry = await client.loadNotionEntry(
      (request.query as any)["id"],
      user.dbConfig,
    );

    // put into notion
    await notionClient.createPage({
      ...entry,
      parent: {
        database_id: user.dbConfig.id,
      },
    });

    return (
      "Sucess loading " +
      (entry as any).properties[user.dbConfig.title].title[0].text.content
    );
  }

  @route({ path: "/api/config", method: "GET", authenticate: true })
  async getConfig(container: Container) {
    const user = container.get<UserData<any>>(USER);
    const domain = container.get<DOMAIN>(DOMAIN_KEY);

    if (domain == "backup") {
      const backup = container.get(Backup);

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
    const cosmos = container.get(CosmosClient);
    const userId = container.get<string>(USER_ID);

    await cosmos.putUserConfig(userId, dbConfig);

    return "Config saved";
  }

  @route({ path: "/api/backup", method: "POST", authenticate: true })
  async generateBackup(container: Container) {
    const backup = container.get<Backup>(Backup);

    return Readable.from(backup.backup());
  }

  @route({ path: "/api/backup", method: "GET", authenticate: true })
  async getBackup(container: Container) {
    const backup = container.get<Backup>(Backup);

    return {
      link: await backup.getLink(),
    };
  }
}
