import { CosmosClient } from '@azure/cosmos';
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { Client } from "@notionhq/client";
import { CreatePageParameters } from "@notionhq/client/build/src/api-endpoints.js";
import axios, { AxiosError, AxiosInstance } from 'axios';
import dotenv from "dotenv";
import { readFile } from 'node:fs/promises';

dotenv.config();
const config: Record<'NOTION_KEY' | 'NOTION_DB_ID' | 'TMDB_API_KEY' | 'CosmosDb:Account' | 'CosmosDb:Key', string> = process.env as any;

function createTmdbClient(): AxiosInstance {
    return axios.create({
        baseURL: 'https://api.themoviedb.org/3/',
        headers: {
            common: {
                Authorization: `Bearer ${config.TMDB_API_KEY}`,
            },
        },
    });
}

function createNotionClient(): Client {
    return new Client({
        auth: config.NOTION_KEY,
    });
}

function createCosmoClient(): CosmosClient {
    return new CosmosClient({
        endpoint: config['CosmosDb:Account'],
        key: config['CosmosDb:Key'],
    });
}

async function loadNotionEntryFromTmdb(tmdbId: string): Promise<Omit<CreatePageParameters, 'parent'>> {
    const tmdbClient = createTmdbClient();

    const { data } = await tmdbClient.get(`/movie/${tmdbId}`, {
        params: {
            append_to_response: 'credits',
            language: 'fr-FR',
        },
    });

    const director = data.credits.crew.find((i: any) => i.job == 'Director');

    return {
        cover: {
            external: {
                url: `https://image.tmdb.org/t/p/original/${data.poster_path}`,
            },
        },
        icon: {
            external: {
                url: `https://image.tmdb.org/t/p/original/${data.poster_path}`,
            },
        },
        properties: {
            Nom: {
                title: [{
                    text: {
                        content: data.title,
                    },
                }]
            },
            Annee: {
                number: Number(data.release_date.split('-')[0]),
            },
            ['Realisateur•rice']: {
                rich_text: [{
                    text: {
                        content: director.name,
                        link: {
                            url: `https://www.themoviedb.org/person/${director.id}`,
                        }
                    },
                }]
            },
            Genre: {
                multi_select: data.genres.map((g: any) => {
                    return {
                        name: g.name,
                    };
                }),
            },
            ['TMDB Sync']: {
                status: {
                    name: 'Done',
                }
            },
            ['TMDB Raiting']: {
                number: Number(data.vote_average),
            },
            ['TMDB Link']: {
                url: `https://www.themoviedb.org/movie/${tmdbId}`,
            },
        },
    };
}

app.get('search', async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
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
});

app.get('db', async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const client = createCosmoClient();

    const container = client.database('notion-tmdb-europe-north').container('notion-tmdb-europe-north');

    // container.items.upsert({
    //     time: new Date(),
    // });

    return {
        jsonBody: (await container.item('f7976ead-fac8-4a2f-a389-8302b6c498be', 'f7976ead-fac8-4a2f-a389-8302b6c498be').read()).resource,
    };
});

app.post('sync', async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const notionClient = createNotionClient();

    const db = await notionClient.databases.query({
        database_id: config.NOTION_DB_ID,
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
});

app.post('add', async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
        const notionClient = createNotionClient();

        // get from tmdb
        const entry = await loadNotionEntryFromTmdb(request.query.get('id') as string);

        // put into notion
        await notionClient.pages.create({
            ...entry,
            parent: {
                database_id: config.NOTION_DB_ID,
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
});

app.get('legal', async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    return {
        status: 302,
        headers: {
            location: '/legal.md',
        },
    };
});

app.get('static_hosting', {
    route: '{*filename}',
    handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
        const filename = request.params.filename || 'index.html';

        try {
            const file = await readFile('./frontend/' + filename);

            return {
                body: file,
                headers: {
                    'Cache-Control': 'public, max-age=3600',
                },
            };
        }

        catch {
            return {
                status: 404,
                body: 'Path not supported',
            };
        }
    }
});
