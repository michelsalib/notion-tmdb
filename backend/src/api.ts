import { DependencyContainer, injectable } from "tsyringe";
import { type DOMAIN, isBackupDomain, SEARCHABLE_DOMAINS } from "./domains.js";
import { unScopedContainer } from "./fx/di.js";
import {
  DATA_PROVIDER,
  DB_PROVIDER,
  DOMAIN as DOMAIN_KEY,
  REPLY,
  REQUEST,
  USER,
  USER_ID,
} from "./fx/keys.js";
import { Router, type ScopedReply, type ScopedRequest } from "./fx/router.js";
import type { BackupDataProvider } from "./providers/BackupDataProvider.js";
import type { DataProvider } from "./providers/DataProvider.js";
import type { DbProvider } from "./providers/DbProvider.js";
import { NotionClient } from "./providers/Notion/NotionClient.js";
import type { Config, UserData } from "./types.js";
import { asWebByteStream } from "./utils/generator.js";

// The two backup connectors resolve to different classes (NotionBackup and
// BitwardenBackup), so DATA_PROVIDER must be read as the interface they share.
type AnyBackup = BackupDataProvider<"backup" | "BitwardenBackup">;

@injectable()
export class Api {
  async getUser(container: DependencyContainer) {
    const user: any = container.resolve(USER);

    if (user?.notionWorkspace?.accessToken) {
      user.notionWorkspace.accessToken = "***"; // hide sensitive data
    }
    if (user?.bitwardenVault?.clientSecret) {
      user.bitwardenVault.clientSecret = "***"; // hide sensitive data
    }

    return { user };
  }

  async search(container: DependencyContainer) {
    const client = container.resolve<DataProvider>(DATA_PROVIDER);
    const request = container.resolve<ScopedRequest>(REQUEST);

    const results = await client.search((request.query as any)["query"]);

    return { results };
  }

  // Which search connectors the current workspace has actually linked. Drives
  // the multi-connector embed dropdown so it only offers connectors that have a
  // configured record in their (per-domain) collection. The Notion workspace id
  // is stable across the per-connector OAuth apps, so one userId spans them all.
  async connectors(container: DependencyContainer) {
    const userId = container.resolve<string | undefined>(USER_ID);

    if (!userId) {
      return { connectors: [] };
    }

    const connectors: DOMAIN[] = [];

    for (const domain of SEARCHABLE_DOMAINS) {
      const scoped = await unScopedContainer(domain);
      const user = await scoped
        .resolve<DbProvider>(DB_PROVIDER)
        .getUser(userId);

      if (user?.config) {
        connectors.push(domain);
      }
    }

    return { connectors };
  }

  async sync(container: DependencyContainer) {
    const user = container.resolve<UserData<any>>(USER);
    const domain = container.resolve<DOMAIN>(DOMAIN_KEY);
    const { reply } = container.resolve<{ reply: ScopedReply }>(REPLY);
    reply.header("content-type", "text/event-stream");
    reply.header("cache-control", "no-cache, no-transform");
    reply.header("connection", "keep-alive");
    reply.header("x-accel-buffering", "no");

    if (isBackupDomain(domain)) {
      const backup = container.resolve<AnyBackup>(DATA_PROVIDER);

      return asWebByteStream(backup.sync());
    }

    if (!user.config) {
      return {
        status: 400,
        body: "Notion db needs to be configured first",
      };
    }

    const notionClient = container.resolve(NotionClient);
    const dataProvider = container.resolve<DataProvider>(DATA_PROVIDER);

    return asWebByteStream(dataProvider.sync(notionClient, user.config));
  }

  async add(container: DependencyContainer) {
    const user = container.resolve<UserData<"GBook" | "TMDB">>(USER);
    const request = container.resolve<ScopedRequest>(REQUEST);

    if (!user.config) {
      const { reply } = container.resolve<{ reply: ScopedReply }>(REPLY);

      reply.status(400);

      return "Notion db needs to be configured first";
    }

    const notionClient = container.resolve(NotionClient);
    const client = container.resolve<DataProvider>(DATA_PROVIDER);

    // get from tmdb
    const { notionItem, title } = await client.loadNotionEntry(
      (request.query as any)["id"],
      user.config,
    );

    // put into notion
    const url = await notionClient.createPage({
      ...notionItem,
      parent: {
        database_id: user.config.id,
      },
    });

    return { message: `Sucess loading ${title}`, url };
  }

  async getConfig(container: DependencyContainer) {
    const user = container.resolve<UserData<any>>(USER);
    const domain = container.resolve<DOMAIN>(DOMAIN_KEY);

    if (isBackupDomain(domain)) {
      const backup = container.resolve<AnyBackup>(DATA_PROVIDER);

      return {
        backupDate: await backup.getBackupDate(),
        config: user.config,
      };
    }

    const notionDatabases = await container
      .resolve(NotionClient)
      .listDatabases();

    return {
      notionDatabases,
      config: user.config,
    };
  }

  async postConfig(container: DependencyContainer) {
    const request = container.resolve<ScopedRequest>(REQUEST);
    const config: Config = (request.body as any).config;
    const db = container.resolve<DbProvider>(DB_PROVIDER);
    const userId = container.resolve<string>(USER_ID);

    await db.putUserConfig(userId, config);

    return "Config saved";
  }

  async getBackup(container: DependencyContainer) {
    const backup = container.resolve<AnyBackup>(DATA_PROVIDER);

    return {
      link: await backup.getLink(),
    };
  }
}

Router.register(Api, "getUser", {
  path: "/api/user",
  method: "GET",
  authenticate: true,
});
Router.register(Api, "search", {
  path: "/api/search",
  method: "GET",
  authenticate: false,
});
Router.register(Api, "connectors", {
  path: "/api/connectors",
  method: "GET",
  authenticate: false,
});
Router.register(Api, "sync", {
  path: "/api/sync",
  method: "GET",
  authenticate: true,
});
Router.register(Api, "add", {
  path: "/api/add",
  method: "POST",
  authenticate: true,
});
Router.register(Api, "getConfig", {
  path: "/api/config",
  method: "GET",
  authenticate: true,
});
Router.register(Api, "postConfig", {
  path: "/api/config",
  method: "POST",
  authenticate: true,
});
Router.register(Api, "getBackup", {
  path: "/api/backup",
  method: "GET",
  authenticate: true,
});
