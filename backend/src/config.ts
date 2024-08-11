import dotenv from "dotenv";

dotenv.config();

export const config: Record<'NOTION_CLIENT_ID' | 'NOTION_CLIENT_SECRET' | 'TMDB_API_KEY' | 'CosmosDb:Account' | 'CosmosDb:Key', string> = process.env as any;
