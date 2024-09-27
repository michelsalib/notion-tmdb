import { DbConfig, NotionItem, Suggestion } from "../types.js";

export interface DataProvider<T extends DbConfig = DbConfig> {
  extractId(url: string): string;
  search(query: string): Promise<Suggestion[]>;
  loadNotionEntry(id: string, dbConfig: T): Promise<NotionItem>;
}
