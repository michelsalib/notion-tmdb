import azure from "@azure/functions";
import { scopeContainer } from "./fx/di.js";
import { DATA_PROVIDER, USER, USER_ID } from "./fx/keys.js";
import { CosmosClient } from "./providers/Cosmos/CosmosClient.js";
import { NotionClient } from "./providers/Notion/NotionClient.js";
import { TmdbClient } from "./providers/Tmdb/TmdbClient.js";
import { DbConfig, UserConfig, UserData } from "./types.js";
import { DataProvider } from "./providers/DataProvider.js";

azure.app.get('user', {
    route: 'api/user',
    handler: async (request: azure.HttpRequest, context: azure.InvocationContext): Promise<azure.HttpResponseInit> => {
        const container = await scopeContainer(request, context, true);

        const user = await container.get<UserData>(USER);
        user.notionWorkspace.accessToken = '***'; // hide sensitive data

        return {
            jsonBody: {
                user
            },
        }
    },
});

azure.app.get('search', {
    route: 'api/search',
    handler: async (request: azure.HttpRequest, context: azure.InvocationContext): Promise<azure.HttpResponseInit> => {
        const container = await scopeContainer(request, context, false);

        const client = container.get<DataProvider>(DATA_PROVIDER);

        const results = await client.search(request.query.get('query') as string);

        return {
            jsonBody: {
                results,
            },
        }
    }
});

azure.app.post('sync', {
    route: 'api/sync',
    handler: async (request: azure.HttpRequest, context: azure.InvocationContext): Promise<azure.HttpResponseInit> => {
        const container = await scopeContainer(request, context, true);
        const user = container.get<UserData>(USER);

        if (!user.dbConfig) {
            return {
                status: 400,
                body: 'Notion db needs to be configured first',
            };
        }

        // const notionClient = createNotionClient(user.notionWorkspace.accessToken);
        const notionClient = container.get(NotionClient);
        const dataProvider = container.get<DataProvider>(DATA_PROVIDER);

        const entriesToLoad = await notionClient.listDatabaseEntries();

        for (const entry of entriesToLoad) {
            const name: string = (Object.values(entry.properties).find(p => p.id == user.dbConfig?.title) as any).title[0].text.content;
            context.log(`Loading ${name}`);
            const url: string = (Object.values(entry.properties).find(p => p.id == user.dbConfig?.url) as any).url;
            const id = dataProvider.extractId(url);

            // load from tmdb
            const newEntry = await dataProvider.loadNotionEntry(id, user.dbConfig);

            // populate in notion
            await notionClient.updatePage({
                ...newEntry,
                page_id: entry.id,
            });

            context.log(`DONE ${name}`);
        }

        return { body: `Sucess ${entriesToLoad.length} item(s).` };
    }
});

azure.app.post('add', {
    route: 'api/add',
    handler: async (request: azure.HttpRequest, context: azure.InvocationContext): Promise<azure.HttpResponseInit> => {
        const container = await scopeContainer(request, context, true);

        const user = container.get<UserData>(USER);

        if (!user.dbConfig) {
            return {
                status: 400,
                body: 'Notion db needs to be configured first',
            };
        }

        // const notionClient = createNotionClient(user.notionWorkspace.accessToken);
        const notionClient = container.get(NotionClient);
        const client = container.get<DataProvider>(DATA_PROVIDER);

        // get from tmdb
        const entry = await client.loadNotionEntry(request.query.get('id') as string, user.dbConfig);

        // put into notion
        await notionClient.createPage({
            ...entry,
            parent: {
                database_id: user.dbConfig.id,
            },
        });

        return {
            body: 'Sucess loading ' + (entry as any).properties[user.dbConfig.title].title[0].text.content,
        };
    }
});

azure.app.get('getConfig', {
    route: 'api/config',
    handler: async (request: azure.HttpRequest, context: azure.InvocationContext): Promise<azure.HttpResponseInit> => {
        const container = await scopeContainer(request, context, true);

        const user = container.get<UserData>(USER);

        const notionDatabases = await container.get(NotionClient).listDatabases();

        return {
            jsonBody: {
                notionDatabases,
                dbConfig: user.dbConfig,
            } as UserConfig,
        };
    }
});

azure.app.post('postConfig', {
    route: 'api/config',
    handler: async (request: azure.HttpRequest, context: azure.InvocationContext): Promise<azure.HttpResponseInit> => {
        const dbConfig: DbConfig = (await request.json() as any).dbConfig;
        const container = await scopeContainer(request, context, true);

        const cosmos = container.get(CosmosClient);
        const userId = container.get<string>(USER_ID);

        await cosmos.putUserConfig(userId, dbConfig);

        return {
            status: 200,
            body: 'Config saved',
        };
    }
});
