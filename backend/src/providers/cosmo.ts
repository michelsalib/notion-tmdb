import { Container, CosmosClient } from '@azure/cosmos';
import { config } from '../config.js';

export function createCosmoClient(): Container {
    return new CosmosClient({
        endpoint: config['CosmosDb:Account'],
        key: config['CosmosDb:Key'],
    }).database('notion-tmdb-europe-north').container('notion-tmdb-europe-north');
}
