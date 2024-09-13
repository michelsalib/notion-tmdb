import azure from "@azure/functions";
import dotenv from "dotenv";
import { Container } from "inversify";
import { buildProviderModule } from "inversify-binding-decorators";
import { CosmosClient } from "../providers/Cosmos/CosmosClient.js";
import type { DOMAIN } from "../types.js";
import { CONTEXT, COSMOS_DB_ACCOUNT, COSMOS_DB_DATABASE, COSMOS_DB_KEY, DATA_PROVIDER, DOMAIN as DOMAIN_KEY, NOTION_CLIENT_ID, NOTION_CLIENT_SECRET, NOTION_GBOOK_CLIENT_ID, NOTION_GBOOK_CLIENT_SECRET, NOTION_TMDB_CLIENT_ID, NOTION_TMDB_CLIENT_SECRET, REQUEST, TMDB_API_KEY, USER, USER_ID } from "./keys.js";

// load services
import '../providers/Cosmos/CosmosClient.js';
import { GBookClient } from "../providers/GBook/GBookClient.js";
import '../providers/Notion/NotionClient.js';
import { TmdbClient } from "../providers/Tmdb/TmdbClient.js";

dotenv.config();

export const rootContainer = new Container();
// load based on decorators
rootContainer.load(buildProviderModule());
// load confog
rootContainer.bind(NOTION_TMDB_CLIENT_ID).toConstantValue(process.env['NOTION_TMDB_CLIENT_ID']);
rootContainer.bind(NOTION_TMDB_CLIENT_SECRET).toConstantValue(process.env['NOTION_TMDB_CLIENT_SECRET']);
rootContainer.bind(NOTION_GBOOK_CLIENT_ID).toConstantValue(process.env['NOTION_GBOOK_CLIENT_ID']);
rootContainer.bind(NOTION_GBOOK_CLIENT_SECRET).toConstantValue(process.env['NOTION_GBOOK_CLIENT_SECRET']);
rootContainer.bind(TMDB_API_KEY).toConstantValue(process.env['TMDB_API_KEY']);
rootContainer.bind(COSMOS_DB_ACCOUNT).toConstantValue(process.env['CosmosDb:Account']);
rootContainer.bind(COSMOS_DB_KEY).toConstantValue(process.env['CosmosDb:Key']);
rootContainer.bind(COSMOS_DB_DATABASE).toConstantValue(process.env['CosmosDb:Database']);

export async function scopeContainer(request: azure.HttpRequest, context: azure.InvocationContext, authenticate: boolean): Promise<Container> {
    const container = rootContainer.createChild();
    const userId = getUserId(request);
    const domain = computeDomain(request);

    container.bind(REQUEST).toConstantValue(request);
    container.bind(CONTEXT).toConstantValue(context);
    container.bind(USER_ID).toConstantValue(userId);
    container.bind(DOMAIN_KEY).toConstantValue(domain);

    container.bind(DATA_PROVIDER).toService(domain == "GBook" ? GBookClient : TmdbClient);
    container.bind(NOTION_CLIENT_ID).toService(domain == "GBook" ? NOTION_GBOOK_CLIENT_ID : NOTION_TMDB_CLIENT_ID);
    container.bind(NOTION_CLIENT_SECRET).toService(domain == "GBook" ? NOTION_GBOOK_CLIENT_SECRET : NOTION_TMDB_CLIENT_SECRET);

    if (authenticate) {
        if (!userId) {
            throw 'User must be authenticated';
        }

        const userInfo = await container.get(CosmosClient).getLoggedUser();

        if (!userInfo) {
            throw 'Unknown user';
        }

        container.bind(USER).toConstantValue(userInfo);
    }

    return container;
}

export function getUserId(request: azure.HttpRequest): string {
    const regex = /userId=([\w-]*)/;
    let userId = regex.exec(request.headers.get('cookie') as string)?.[1] as string;

    if (!userId) {
        userId = regex.exec(request.headers.get('referer') as string)?.[1] as string;
    }

    return userId;
}

function computeDomain(request: azure.HttpRequest): DOMAIN {
    const unlinted = /notion-(\w+)/.exec(request.url)?.[1];

    if (unlinted == 'gbook') {
        return 'GBook';
    }

    return 'TMDB';
}
