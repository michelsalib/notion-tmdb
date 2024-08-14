import { Client } from "@notionhq/client";
import { CreatePageParameters } from "@notionhq/client/build/src/api-endpoints.js";
import { DbConfig } from "../types.js";
import { createTmdbClient } from "./tmdb.js";

type MovieItem = Omit<CreatePageParameters, 'parent'>;

export function createNotionClient(accessToken: string): Client {
    return new Client({
        auth: accessToken,
    });
}

export async function loadNotionEntryFromTmdb(tmdbId: string, dbConfig: DbConfig): Promise<MovieItem> {
    const tmdbClient = createTmdbClient();

    const { data } = await tmdbClient.get(`/movie/${tmdbId}`, {
        params: {
            append_to_response: 'credits',
            language: 'fr-FR',
        },
    });

    const movieItem: MovieItem = {
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
            [dbConfig.url]: {
                url: `https://www.themoviedb.org/movie/${tmdbId}`,
            },
            [dbConfig.status]: {
                status: {
                    name: 'Done',
                }
            },
        },
    };

    if (dbConfig.title) {
        movieItem.properties[dbConfig.title] = {
            title: [{
                text: {
                    content: data.title,
                },
            }]
        };
    }

    if (dbConfig.year) {
        movieItem.properties[dbConfig.year] = {
            number: Number(data.release_date.split('-')[0]),
        };
    }

    if (dbConfig.director) {
        const director = data.credits.crew.find((i: any) => i.job == 'Director');

        movieItem.properties[dbConfig.director] = {
            rich_text: [{
                text: {
                    content: director.name,
                    link: {
                        url: `https://www.themoviedb.org/person/${director.id}`,
                    }
                },
            }]
        };
    }

    if (dbConfig.genre) {
        movieItem.properties[dbConfig.genre] = {
            multi_select: data.genres.map((g: any) => {
                return {
                    name: g.name,
                };
            }),
        };
    }

    if (dbConfig.rating) {
        movieItem.properties[dbConfig.rating] = {
            number: Number(data.vote_average),
        };
    }

    return movieItem;
}