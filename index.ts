import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { Client } from "@notionhq/client";
import axios from 'axios';
import dotenv from "dotenv";

dotenv.config();
const config: Record<'NOTION_KEY' | 'NOTION_DB_ID' | 'TMDB_API_KEY', string> = process.env as any;

app.http('sync', {
    methods: ['GET'],
    handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
        const tmdbClient = axios.create({
            baseURL: 'https://api.themoviedb.org/3/',
            headers: {
                common: {
                    Authorization: `Bearer ${config.TMDB_API_KEY}`,
                },
            },
        })

        const notionClient = new Client({
            auth: config.NOTION_KEY,
        });

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
            const tmdbId = /https:\/\/www\.themoviedb\.org\/movie\/(.*)$/i.exec(tmdbUrl)?.[1];

            const { data } = await tmdbClient.get(`/movie/${tmdbId}`, {
                params: {
                    append_to_response: 'credits',
                    language: 'fr-FR',
                },
            });

            const director = data.credits.crew.find((i: any) => i.job == 'Director');

            // populate
            await notionClient.pages.update({
                page_id: movie.id,
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
                },
            });

            context.log(`DONE ${name}`);
        }

        return { body: `Sucess ${moviesToLoad.length} item(s).` };
    }
});

