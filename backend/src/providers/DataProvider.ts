import type {
  DOMAIN,
  DomainToConfig,
  NotionItem,
  Suggestion,
  SyncEvent,
  SyncOptions,
} from "../types.js";
import { NotionClient } from "./Notion/NotionClient.js";

export interface DataProvider<T extends DOMAIN = any> {
  search(query: string): Promise<Suggestion[]>;
  loadNotionEntry(
    id: string,
    dbConfig: DomainToConfig<T>,
  ): Promise<{ notionItem: NotionItem; title: string }>;
  // `string` stays valid so the backup connectors, which have no item count to
  // report, don't have to wrap every line in an object to say nothing extra.
  sync(
    notionClient: NotionClient,
    dbConfig: DomainToConfig<T>,
    options?: SyncOptions,
  ): AsyncGenerator<string | SyncEvent>;
}
