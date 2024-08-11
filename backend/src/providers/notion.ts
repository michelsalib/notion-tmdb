import { Client } from "@notionhq/client";
import { CreatePageParameters } from "@notionhq/client/build/src/api-endpoints.js";
import { createTmdbClient } from "./tmdb.js";

export function createNotionClient(accessToken: string): Client {
    return new Client({
        auth: accessToken,
    });
}

export async function loadNotionEntryFromTmdb(tmdbId: string): Promise<Omit<CreatePageParameters, 'parent'>> {
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