import { DependencyContainer, injectable } from "tsyringe";
import { type DOMAIN, isBackupDomain, SEARCHABLE_DOMAINS } from "./domains.js";
import {
  DOMAIN_FIELDS,
  type FieldSpec,
  isSearchDomain,
  type SEARCH_DOMAIN,
} from "./fields.js";
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
import type { Config, FieldPreview, UserData } from "./types.js";
import { asWebByteStream } from "./utils/generator.js";
import { staleBefore } from "./utils/syncWindow.js";
import { matchesUrl } from "./utils/urlMatch.js";

// The two backup connectors resolve to different classes (NotionBackup and
// BitwardenBackup), so DATA_PROVIDER must be read as the interface they share.
type AnyBackup = BackupDataProvider<"backup" | "BitwardenBackup">;

/** What `POST /api/database` names the database it creates, per connector. */
const DATABASE_TITLES: Record<SEARCH_DOMAIN, string> = {
  TMDB: "Films",
  IGDB: "Games",
  GBook: "Books",
  BilletReduc: "Plays",
};

/** The Notion schema for one field's column type. */
function propertySchema(field: FieldSpec): any {
  return { [field.columnType]: {} };
}

/**
 * One Notion property value, as a line of preview text.
 *
 * The preview reuses `loadNotionEntry` rather than asking each connector for a
 * second, display-shaped view of the same item — one description of what a
 * connector writes is the point of `fields.ts`. What comes back is a Notion
 * write payload, so this turns each property back into something readable.
 */
function displayValue(property: any): string {
  if (!property) {
    return "";
  }

  if (typeof property.url === "string") {
    return property.url;
  }

  if (typeof property.number === "number") {
    return String(Math.round(property.number * 10) / 10);
  }

  // Date only: the time is always midnight or the moment of the call, and
  // neither tells the reader anything.
  if (property.date?.start) {
    return String(property.date.start).slice(0, 10);
  }

  if (Array.isArray(property.title) || Array.isArray(property.rich_text)) {
    return (property.title ?? property.rich_text)
      .map((chunk: any) => chunk?.text?.content ?? "")
      .join("");
  }

  if (Array.isArray(property.multi_select)) {
    return property.multi_select.map((option: any) => option.name).join(", ");
  }

  if (property.select?.name) {
    return property.select.name;
  }

  if (typeof property.checkbox === "boolean") {
    return property.checkbox ? "Yes" : "No";
  }

  return "";
}

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

  /**
   * Which of the given ids the workspace already has rows for.
   *
   * Deliberately not folded into `/api/search`. That route is unauthenticated
   * and is what the landing page demo calls, so it must not depend on a
   * workspace; and this adds a Notion round trip that the search itself should
   * never wait on. The widget fires it after results are on screen and merges
   * the badges in, so a slow or failing Notion leaves the list working.
   */
  async existing(container: DependencyContainer) {
    const user = container.resolve<UserData<any>>(USER);
    const domain = container.resolve<DOMAIN>(DOMAIN_KEY);
    const request = container.resolve<ScopedRequest>(REQUEST);

    const ids = String((request.query as any)["ids"] ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    if (isBackupDomain(domain) || !user.config || ids.length === 0) {
      return { existing: {} };
    }

    const client = container.resolve<DataProvider>(DATA_PROVIDER);
    const wanted = ids.map((id) => ({ id, match: client.urlFor(id) }));

    const rows = await container.resolve(NotionClient).findRowsByUrl(
      user.config,
      wanted.map((item) => item.match),
    );

    const existing: Record<string, { url: string }> = {};

    for (const { id, match } of wanted) {
      const hit = rows.find((row) => matchesUrl(match, row.storedUrl));

      if (hit) {
        existing[id] = { url: hit.pageUrl };
      }
    }

    return { existing };
  }

  /**
   * What one item would look like once written to Notion.
   *
   * Unauthenticated, because its only caller is the landing page, where the
   * whole point is to answer "what does it actually fill in?" before anyone
   * connects a workspace.
   */
  async preview(container: DependencyContainer) {
    const domain = container.resolve<DOMAIN>(DOMAIN_KEY);
    const request = container.resolve<ScopedRequest>(REQUEST);
    const { reply } = container.resolve<{ reply: ScopedReply }>(REPLY);

    const id = (request.query as any)["id"];

    if (!isSearchDomain(domain) || !id) {
      reply.status(400);

      return "id is required, and this connector must be searchable";
    }

    const fields = DOMAIN_FIELDS[domain];
    const client = container.resolve<DataProvider>(DATA_PROVIDER);

    // Address the entry by field key rather than by Notion property id. Every
    // connector writes `properties[dbConfig[key]]`, so handing it a mapping of
    // each key to itself yields the same payload keyed by something knowable
    // without a user — and keeps `fields.ts` the only description of what a
    // connector writes.
    const identityConfig = {
      id: "",
      ...Object.fromEntries(fields.map((field) => [field.key, field.key])),
    } as Config;

    const { notionItem, title } = await client.loadNotionEntry(
      id,
      identityConfig,
    );

    const preview: FieldPreview[] = fields
      // The sync marker is `new Date()` at write time. It does land in Notion,
      // but "Sync date: today" tells a first-time visitor nothing about what
      // the connector fetched.
      .filter((field) => field.key !== "status")
      .map((field) => ({
        key: field.key,
        label: field.label,
        value: displayValue((notionItem.properties as any)[field.key]),
      }))
      .filter((line) => line.value);

    return {
      title,
      preview,
      cover: (notionItem.cover as any)?.external?.url ?? "",
    };
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
    const request = container.resolve<ScopedRequest>(REQUEST);
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

    return asWebByteStream(
      dataProvider.sync(notionClient, user.config, {
        staleBefore: staleBefore((request.query as any)["days"]),
      }),
    );
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
      const backups = await backup.listBackups();

      return {
        // Kept alongside `backups` because the widget shows "last backup"
        // before it shows the history, and an older stored client reads it.
        backupDate: backups[0]?.date,
        backups,
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

  /** Pages a new database could be created inside. */
  async getPages(container: DependencyContainer) {
    return { pages: await container.resolve(NotionClient).listPages() };
  }

  /**
   * Create a ready-made database and map it in one step.
   *
   * The alternative for a new user is to build a database in Notion by hand,
   * guess which column types the connector needs, and then map seven dropdowns.
   * Creating it here means the shape is right by construction and the mapping
   * is read straight off the response rather than guessed.
   */
  async createDatabase(container: DependencyContainer) {
    const request = container.resolve<ScopedRequest>(REQUEST);
    const domain = container.resolve<DOMAIN>(DOMAIN_KEY);
    const { reply } = container.resolve<{ reply: ScopedReply }>(REPLY);

    if (!isSearchDomain(domain)) {
      reply.status(400);

      return "This connector does not use a database";
    }

    const parentPageId = (request.body as any)?.parentPageId as
      | string
      | undefined;

    if (!parentPageId) {
      reply.status(400);

      return "parentPageId is required";
    }

    const fields = DOMAIN_FIELDS[domain];
    const notionClient = container.resolve(NotionClient);
    const database = await notionClient.createDatabase(
      parentPageId,
      DATABASE_TITLES[domain],
      Object.fromEntries(
        fields.map((field) => [field.createAs, propertySchema(field)]),
      ),
    );

    // Read the mapping back off the created schema rather than assuming it:
    // Notion is the one that assigns property ids.
    const config = {
      id: database.id,
      ...Object.fromEntries(
        fields.map((field) => [
          field.key,
          database.properties[field.createAs]?.id ?? "",
        ]),
      ),
    } as Config;

    const db = container.resolve<DbProvider>(DB_PROVIDER);
    await db.putUserConfig(container.resolve<string>(USER_ID), config);

    return { config, database };
  }

  async getBackup(container: DependencyContainer) {
    const backup = container.resolve<AnyBackup>(DATA_PROVIDER);
    const { query } = container.resolve<ScopedRequest>(REQUEST);
    // Only a string: `?key=` twice over gives an array, and the storage layer
    // matches the key against this user's own listing rather than trusting it.
    const key = typeof query["key"] === "string" ? query["key"] : undefined;

    return {
      link: await backup.getLink(key),
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
Router.register(Api, "existing", {
  path: "/api/existing",
  method: "GET",
  authenticate: true,
});
Router.register(Api, "preview", {
  path: "/api/preview",
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
Router.register(Api, "getPages", {
  path: "/api/pages",
  method: "GET",
  authenticate: true,
});
Router.register(Api, "createDatabase", {
  path: "/api/database",
  method: "POST",
  authenticate: true,
});
