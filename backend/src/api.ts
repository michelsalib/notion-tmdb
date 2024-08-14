import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DatabaseObjectResponse } from "@notionhq/client/build/src/api-endpoints.js";
import { AxiosError } from "axios";
import { getLoggedUser, getUserId } from "./auth.js";
import { createCosmoClient } from "./providers/cosmo.js";
import { createNotionClient, loadNotionEntryFromTmdb } from "./providers/notion.js";
import { createTmdbClient } from "./providers/tmdb.js";
import { DbConfig, UserConfig } from "./types.js";

app.get('user', {
    route: 'api/user',
    handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
        const user = await getLoggedUser(request);
        user.notionWorkspace.accessToken = '***';

        return {
            jsonBody: {
                user
            },
        }
    },
});

app.get('search', {
    route: 'api/search',
    handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
        const tmdbClient = createTmdbClient();

        const { data } = await tmdbClient.get('/search/movie', {
            params: {
                query: request.query.get('query'),
                include_adult: false,
                language: 'fr-FR',
                page: 1,
            },
        });

        return {
            jsonBody: data,
        }
    }
});

app.post('sync', {
    route: 'api/sync',
    handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
        const user = await getLoggedUser(request);

        if (!user.dbConfig) {
            return {
                status: 400,
                body: 'Notion db needs to be configured first',
            };
        }

        const notionClient = createNotionClient(user.notionWorkspace.accessToken);

        const db = await notionClient.databases.query({
            database_id: user.dbConfig.id,
            filter: {
                and: [
                    {
                        property: user.dbConfig.url,
                        url: {
                            is_not_empty: true,
                        },
                    },
                    {
                        property: user.dbConfig.status,
                        status: {
                            equals: 'Not started',
                        }
                    }
                ]
            }
        });

        const moviesToLoad = db.results as any[];

        for (const movie of moviesToLoad) {
            const name: string = movie.properties.Nom.title[0].plain_text;
            context.log(`Loading ${name}`);
            const tmdbUrl: string = movie.properties[user.dbConfig.url].url;
            const tmdbId = /https:\/\/www\.themoviedb\.org\/movie\/(.*)$/i.exec(tmdbUrl)?.[1] as string;

            // load from tmdb
            const entry = await loadNotionEntryFromTmdb(tmdbId, user.dbConfig);

            // populate in notion
            await notionClient.pages.update({
                ...entry,
                page_id: movie.id,
            });

            context.log(`DONE ${name}`);
        }

        return { body: `Sucess ${moviesToLoad.length} item(s).` };
    }
});

app.post('add', {
    route: 'api/add',
    handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
        try {
            const user = await getLoggedUser(request);

            if (!user.dbConfig) {
                return {
                    status: 400,
                    body: 'Notion db needs to be configured first',
                };
            }

            const notionClient = createNotionClient(user.notionWorkspace.accessToken);

            // get from tmdb
            const entry = await loadNotionEntryFromTmdb(request.query.get('id') as string, user.dbConfig);

            // put into notion
            await notionClient.pages.create({
                ...entry,
                parent: {
                    database_id: user.dbConfig.id,
                },
            });

            return {
                body: 'Sucess loading ' + (entry as any).properties.Nom.title[0].text.content,
            };
        }
        catch (err) {
            let message = String(err);

            if (err instanceof AxiosError) {
                message = JSON.stringify(err.response?.data);
            }

            return {
                status: 503,
                body: 'Failed: ' + message,
            };
        }
    }
});

app.get('getConfig', {
    route: 'api/config',
    handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
        const user = await getLoggedUser(request);

        const dbSearch = await createNotionClient(user.notionWorkspace.accessToken)
            .search({
                filter: {
                    property: 'object',
                    value: 'database'
                },
            });

        const notionDatabases = dbSearch.results as DatabaseObjectResponse[];

        return {
            jsonBody: {
                notionDatabases,
                dbConfig: user.dbConfig,
            } as UserConfig,
        };
    }
});

app.post('postConfig', {
    route: 'api/config',
    handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
        const dbConfig: DbConfig = (await request.json() as any).dbConfig;
        const userId = getUserId(request);
        await createCosmoClient().item(userId, userId).patch([
            {
                op: 'add',
                path: '/dbConfig',
                value: dbConfig,
            },
        ]);

        return {
            status: 200,
            body: 'Config saved',
        };
    }
});
