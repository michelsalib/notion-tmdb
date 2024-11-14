import type {
  DOMAIN,
  DomainToDbConfig,
  NotionItem,
  Suggestion,
} from "../types.js";
import { NotionClient } from "./Notion/NotionClient.js";

export interface DataProvider<T extends DOMAIN = any> {
  search(query: string): Promise<Suggestion[]>;
  loadNotionEntry(
    id: string,
    dbConfig: DomainToDbConfig<T>,
  ): Promise<{ notionItem: NotionItem; title: string }>;
  sync(
    notionClient: NotionClient,
    dbConfig: DomainToDbConfig<T>,
  ): AsyncGenerator<string>;
}
