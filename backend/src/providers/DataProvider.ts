import type {
  DOMAIN,
  DomainToDbConfig,
  NotionItem,
  Suggestion,
} from "../types.js";

export interface DataProvider<T extends DOMAIN = any> {
  extractId(url: string): string;
  search(query: string): Promise<Suggestion[]>;
  loadNotionEntry(
    id: string,
    dbConfig: DomainToDbConfig<T>,
  ): Promise<NotionItem>;
}
