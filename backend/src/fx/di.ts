import { MongoClient } from "mongodb";
import {
  container,
  DependencyContainer,
  instanceCachingFactory,
} from "tsyringe";
import {
  type DOMAIN,
  HOSTNAME_DOMAIN,
  SEARCH_DOMAINS,
  STATE_DOMAIN,
} from "../domains.js";
import { BilletReducClient } from "../providers/BilletReduc/BilletReducClient.js";
import { BitwardenBackup } from "../providers/BitwardenBackup/BitwardenBackup.js";
import type { DbProvider } from "../providers/DbProvider.js";
import { GBookClient } from "../providers/GBook/GBookClient.js";
import { IgdbClient } from "../providers/Igdb/IgdbClient.js";
import { MongoDbClient } from "../providers/MongoDb/MongoDbClient.js";
import { NotionBackup } from "../providers/NotionBackup/NotionBackup.js";
import { FilesystemStorage } from "../providers/Storage/FilesystemClient.js";
import { GcsStorageClient } from "../providers/Storage/GcsStorageClient.js";
import { TmdbClient } from "../providers/Tmdb/TmdbClient.js";
import {
  DATA_PROVIDER,
  DB_ENGINE,
  DB_PROVIDER,
  DOMAIN as DOMAIN_KEY,
  GBOOK_API_KEY,
  GCP_PROJECT_ID,
  IGDB_CLIENT_ID,
  IGDB_CLIENT_SECRET,
  LOGGER,
  LOGGER_ENGINE,
  MONGO_URL,
  NOTION_BACKUP_CLIENT_ID,
  NOTION_BACKUP_CLIENT_SECRET,
  NOTION_BILLETREDUC_CLIENT_ID,
  NOTION_BILLETREDUC_CLIENT_SECRET,
  NOTION_CLIENT_ID,
  NOTION_CLIENT_SECRET,
  NOTION_GBOOK_CLIENT_ID,
  NOTION_GBOOK_CLIENT_SECRET,
  NOTION_IGDB_CLIENT_ID,
  NOTION_IGDB_CLIENT_SECRET,
  NOTION_TMDB_CLIENT_ID,
  NOTION_TMDB_CLIENT_SECRET,
  REPLY,
  REQUEST,
  STORAGE_BUCKET,
  STORAGE_ENDPOINT,
  STORAGE_ENGINE,
  STORAGE_PROVIDER,
  TMDB_API_KEY,
  USER,
  USER_ID,
} from "./keys.js";
import { ConsoleLogger } from "./logger/ConsoleLogger.js";
import { GcpLogger } from "./logger/GcpLogger.js";
import type { ScopedReply, ScopedRequest } from "./router.js";

export const rootContainer: DependencyContainer = container;

export function loadEnvironmentConfig(env: {
  [key: string]: string | undefined;
}): void {
  // useFactory (not useValue) because tsyringe's isValueProvider does
  // `useValue != undefined`, so a value of undefined is silently treated as
  // "no provider" and crashes when resolved. Env values can be undefined
  // (unset secret), so funnel all of them through useFactory.
  const bind = (token: symbol, value: string | undefined): void => {
    rootContainer.register(token as any, { useFactory: () => value });
  };

  // notion oauth per distro
  bind(NOTION_TMDB_CLIENT_ID, env["NOTION_TMDB_CLIENT_ID"]);
  bind(NOTION_TMDB_CLIENT_SECRET, env["NOTION_TMDB_CLIENT_SECRET"]);
  bind(NOTION_IGDB_CLIENT_ID, env["NOTION_IGDB_CLIENT_ID"]);
  bind(NOTION_IGDB_CLIENT_SECRET, env["NOTION_IGDB_CLIENT_SECRET"]);
  bind(NOTION_BACKUP_CLIENT_ID, env["NOTION_BACKUP_CLIENT_ID"]);
  bind(NOTION_BACKUP_CLIENT_SECRET, env["NOTION_BACKUP_CLIENT_SECRET"]);
  bind(NOTION_GBOOK_CLIENT_ID, env["NOTION_GBOOK_CLIENT_ID"]);
  bind(NOTION_GBOOK_CLIENT_SECRET, env["NOTION_GBOOK_CLIENT_SECRET"]);
  bind(NOTION_BILLETREDUC_CLIENT_ID, env["NOTION_BILLETREDUC_CLIENT_ID"]);
  bind(
    NOTION_BILLETREDUC_CLIENT_SECRET,
    env["NOTION_BILLETREDUC_CLIENT_SECRET"],
  );

  // third-party API keys
  bind(TMDB_API_KEY, env["TMDB_API_KEY"]);
  bind(IGDB_CLIENT_ID, env["IGDB_CLIENT_ID"]);
  bind(IGDB_CLIENT_SECRET, env["IGDB_CLIENT_SECRET"]);
  bind(GBOOK_API_KEY, env["GBOOK_API_KEY"]);

  // GCS config
  bind(STORAGE_BUCKET, env["STORAGE_BUCKET"]);
  bind(GCP_PROJECT_ID, env["GCP_PROJECT_ID"]);
  bind(STORAGE_ENDPOINT, env["STORAGE_ENDPOINT"]);

  // Mongo connection (singleton — Atlas M0 caps at 500 conns; per-method
  // MongoClient.connect() would burn through them fast).
  bind(MONGO_URL, env["MONGO_URL"]);
  rootContainer.register(MongoClient, {
    useFactory: instanceCachingFactory(
      (c) => new MongoClient(c.resolve<string>(MONGO_URL)),
    ),
  });

  // engine selector values (still resolvable in case any code reads them directly)
  bind(DB_ENGINE, env["DB_ENGINE"]);
  bind(STORAGE_ENGINE, env["STORAGE_ENGINE"]);
  bind(LOGGER_ENGINE, env["LOGGER_ENGINE"]);

  // env-driven implementation dispatch
  switch (env["DB_ENGINE"]) {
    case "MONGO":
      rootContainer.register(DB_PROVIDER, { useClass: MongoDbClient });
      break;
    default:
      throw new Error(`Unknown DB_ENGINE: ${env["DB_ENGINE"]}`);
  }

  switch (env["STORAGE_ENGINE"]) {
    case "FILESYSTEM":
      rootContainer.register(STORAGE_PROVIDER, { useClass: FilesystemStorage });
      break;
    case "GCS":
      rootContainer.register(STORAGE_PROVIDER, { useClass: GcsStorageClient });
      break;
    default:
      throw new Error(`Unknown STORAGE_ENGINE: ${env["STORAGE_ENGINE"]}`);
  }

  switch (env["LOGGER_ENGINE"]) {
    case "CONSOLE":
      rootContainer.register(LOGGER, { useClass: ConsoleLogger });
      break;
    case "GCP":
      rootContainer.register(LOGGER, { useClass: GcpLogger });
      break;
    default:
      throw new Error(`Unknown LOGGER_ENGINE: ${env["LOGGER_ENGINE"]}`);
  }

  // DOMAIN-driven NOTION_CLIENT_ID/SECRET dispatch (resolved per-request from
  // the child container). One table instead of two switches that were
  // byte-identical apart from the _ID/_SECRET suffix.
  const bindPerDomain = (target: symbol, slot: 0 | 1, label: string): void => {
    rootContainer.register(target, {
      useFactory: (c) => {
        const domain = c.resolve<DOMAIN>(DOMAIN_KEY);
        const keys = NOTION_OAUTH_KEYS[domain];

        if (!keys) {
          throw new Error(`No ${label} for domain ${domain}`);
        }

        return c.resolve(keys[slot]);
      },
    });
  };

  bindPerDomain(NOTION_CLIENT_ID, 0, "NOTION_CLIENT_ID");
  bindPerDomain(NOTION_CLIENT_SECRET, 1, "NOTION_CLIENT_SECRET");

  // DOMAIN-driven DATA_PROVIDER dispatch
  rootContainer.register(DATA_PROVIDER, {
    useFactory: (c) => {
      const domain = c.resolve<DOMAIN>(DOMAIN_KEY);

      return c.resolve(DATA_PROVIDERS[domain]);
    },
  });
}

// Notion OAuth app credentials per connector, as [clientId, clientSecret].
// BitwardenBackup authenticates against Bitwarden directly, so it has no
// Notion OAuth app — resolving one for it is a programming error.
const NOTION_OAUTH_KEYS: Record<DOMAIN, readonly [symbol, symbol] | undefined> =
  {
    TMDB: [NOTION_TMDB_CLIENT_ID, NOTION_TMDB_CLIENT_SECRET],
    IGDB: [NOTION_IGDB_CLIENT_ID, NOTION_IGDB_CLIENT_SECRET],
    GBook: [NOTION_GBOOK_CLIENT_ID, NOTION_GBOOK_CLIENT_SECRET],
    BilletReduc: [
      NOTION_BILLETREDUC_CLIENT_ID,
      NOTION_BILLETREDUC_CLIENT_SECRET,
    ],
    backup: [NOTION_BACKUP_CLIENT_ID, NOTION_BACKUP_CLIENT_SECRET],
    BitwardenBackup: undefined,
  };

// Which client implements each connector. Typed as Record<DOMAIN, …> so adding
// a connector to the registry without wiring a provider fails to compile.
const DATA_PROVIDERS: Record<DOMAIN, new (...args: any[]) => unknown> = {
  TMDB: TmdbClient,
  GBook: GBookClient,
  IGDB: IgdbClient,
  BilletReduc: BilletReducClient,
  BitwardenBackup: BitwardenBackup,
  backup: NotionBackup,
};

export async function unScopedContainer(
  domain: DOMAIN,
): Promise<DependencyContainer> {
  const child = rootContainer.createChildContainer();
  child.register(DOMAIN_KEY, { useValue: domain });
  return child;
}

export async function userIdContainer(
  userId: string,
  domain: DOMAIN,
): Promise<DependencyContainer> {
  const child = rootContainer.createChildContainer();
  child.register(USER_ID, { useValue: userId });
  child.register(DOMAIN_KEY, { useValue: domain });
  await loadUser(child);
  return child;
}

export async function scopeContainer(
  request: ScopedRequest,
  reply: ScopedReply,
  authenticate: boolean,
): Promise<DependencyContainer> {
  const child = rootContainer.createChildContainer();
  const userId = getUserId(request);
  const domain = computeDomain(request);

  child.register(REPLY, { useValue: { reply } });
  child.register(REQUEST, { useValue: request });
  // useFactory (not useValue) because tsyringe's isValueProvider does
  // `useValue != undefined`, so a value of undefined is silently treated as
  // "no provider" and crashes with "TypeInfo not known for undefined".
  child.register(USER_ID, { useFactory: () => userId });
  child.register(DOMAIN_KEY, { useValue: domain });

  if (authenticate) {
    if (!userId) {
      throw new Error("User must be authenticated");
    }
    await loadUser(child);
  }

  return child;
}

async function loadUser(c: DependencyContainer): Promise<void> {
  const userId = c.resolve<string>(USER_ID);
  const userInfo = await c.resolve<DbProvider>(DB_PROVIDER).getUser(userId);

  if (!userInfo) {
    throw new Error("Unknown user");
  }

  c.register(USER, { useValue: userInfo });
}

// Returns undefined for an anonymous request: unauthenticated routes (search,
// connectors) are reached without a userId, and `scopeContainer` already
// branches on that. The old signature claimed `string` via a cast, which is
// why USER_ID has to be resolved as `string | undefined` at every call site.
function getUserId(request: ScopedRequest): string | undefined {
  const cookieUserId = request.cookies["userId"];

  if (cookieUserId) {
    return cookieUserId;
  }

  return /userId=([\w-]*)/.exec(request.headers["referer"] ?? "")?.[1];
}

export function computeDomain(request: ScopedRequest): DOMAIN {
  // Explicit per-request connector override (the multi-connector embed widget).
  const explicit = (request.query as any)?.["domain"]?.toLowerCase();
  if (explicit && SEARCH_DOMAINS[explicit]) {
    return SEARCH_DOMAINS[explicit];
  }

  const state = (request.query as any)?.["state"]?.toLowerCase();
  if (state && STATE_DOMAIN[state]) {
    return STATE_DOMAIN[state];
  }

  const subdomain = request.hostname.split(".")[0];
  if (HOSTNAME_DOMAIN[subdomain]) {
    return HOSTNAME_DOMAIN[subdomain];
  }

  // Fallback for raw Cloud Run URL / bare localhost: read DOMAIN env, else TMDB.
  return (process.env["DOMAIN"] as DOMAIN | undefined) ?? "TMDB";
}
