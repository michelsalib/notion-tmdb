import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { AxiosError } from "axios";
import { getLoggedUser } from "./auth.js";
import { createNotionClient, loadNotionEntryFromTmdb } from "./providers/notion.js";
import { createTmdbClient } from "./providers/tmdb.js";
import { DatabaseObjectResponse } from "@notionhq/client/build/src/api-endpoints.js";

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

        const notionClient = createNotionClient(user.notionWorkspace.accessToken);

        const db = await notionClient.databases.query({
            database_id: user.dbConfig.id,
            filter: {
                and: [
                    {
                        property: 'TMDB Link',
                        url: {
                            is_not_empty: true,
                        },
                    },
                    {
                        property: 'TMDB Sync',
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
            const tmdbUrl: string = movie.properties['TMDB Link'].url;
            const tmdbId = /https:\/\/www\.themoviedb\.org\/movie\/(.*)$/i.exec(tmdbUrl)?.[1] as string;

            // load from tmdb
            const entry = await loadNotionEntryFromTmdb(tmdbId);

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

            const notionClient = createNotionClient(user.notionWorkspace.accessToken);

            // get from tmdb
            const entry = await loadNotionEntryFromTmdb(request.query.get('id') as string);

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

app.get('config', {
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

        const dbConfig = dbSearch.results as DatabaseObjectResponse[];

        return {
            jsonBody: {
                data: dbConfig,
            },
        };
    }
});
