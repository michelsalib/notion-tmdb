import type {
  DOMAIN,
  DomainToConfig,
  NotionItem,
  Suggestion,
  SyncEvent,
  SyncOptions,
  UrlMatch,
} from "../types.js";
import { NotionClient } from "./Notion/NotionClient.js";

export interface DataProvider<T extends DOMAIN = any> {
  search(query: string): Promise<Suggestion[]>;
  /**
   * How to recognise the row this connector would write for `id`, matched
   * against the URL column named by the user's mapping.
   *
   * Declared per connector rather than derived centrally because only the
   * connector knows what it puts in that column — see `UrlMatch`.
   */
  urlFor(id: string): UrlMatch;
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
