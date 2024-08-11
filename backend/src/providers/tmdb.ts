import axios, { AxiosInstance } from 'axios';
import { config } from '../config.js';

export function createTmdbClient(): AxiosInstance {
    return axios.create({
        baseURL: 'https://api.themoviedb.org/3/',
        headers: {
            common: {
                Authorization: `Bearer ${config.TMDB_API_KEY}`,
            },
        },
    });
}