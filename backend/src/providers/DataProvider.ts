import { DbConfig, NotionItem, Suggestion } from "../types.js";

export interface DataProvider {
    extractId(url: string): string;
    search(query: string): Promise<Suggestion[]>;
    loadNotionEntry(id: string, dbConfig: DbConfig): Promise<NotionItem>;
}