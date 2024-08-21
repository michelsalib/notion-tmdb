import axios, { AxiosInstance } from 'axios';
import { inject } from 'inversify';
import { provide } from 'inversify-binding-decorators';
import { TMDB_API_KEY } from '../../fx/keys.js';
import { DbConfig, MovieItem } from '../../types.js';

@provide(TmdbClient)
export class TmdbClient {
    private readonly client: AxiosInstance;

    constructor(
        @inject(TMDB_API_KEY) tmdbApiKey: string,
    ) {
        this.client = axios.create({
            baseURL: 'https://api.themoviedb.org/3/',
            headers: {
                common: {
                    Authorization: `Bearer ${tmdbApiKey}`,
                },
            },
        });
    }

    async search(query: string): Promise<any> {
        const { data } = await this.client.get('/search/movie', {
            params: {
                query: query,
                include_adult: false,
                language: 'fr-FR',
                page: 1,
            },
        });

        return data;
    }

    async loadNotionEntryFromTmdb(tmdbId: string, dbConfig: DbConfig): Promise<MovieItem> {
        const { data } = await this.client.get(`/movie/${tmdbId}`, {
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
}