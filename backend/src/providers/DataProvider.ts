import type {
  DOMAIN,
  DomainToConfig,
  NotionItem,
  Suggestion,
} from "../types.js";
import { NotionClient } from "./Notion/NotionClient.js";

export interface DataProvider<T extends DOMAIN = any> {
  search(query: string): Promise<Suggestion[]>;
  loadNotionEntry(
    id: string,
    dbConfig: DomainToConfig<T>,
  ): Promise<{ notionItem: NotionItem; title: string }>;
  sync(
    notionClient: NotionClient,
    dbConfig: DomainToConfig<T>,
  ): AsyncGenerator<string>;
}
