import axios, { type AxiosInstance, type CreateAxiosDefaults } from "axios";
import type { Logger } from "../fx/logger/Logger.js";

/**
 * The only sanctioned way for a provider to build an axios instance.
 *
 * Logging goes through `Logger.bindAxios`, which pins `AXIOS_LOG_CONFIG`
 * (`data`/`headers`/`params` all false). Calling `axios.create` directly and
 * attaching `axios-logger`'s `requestLogger`/`responseLogger` by hand inherits
 * the upstream default of `data: true`, which serializes whole request and
 * response bodies — that is how provider `client_secret`s, the bearer tokens
 * they return, and full bank-transaction payloads ended up in Cloud Logging.
 *
 * `noExternalImports` in biome.json forbids importing `axios-logger` outside
 * `fx/logger/` so that mistake cannot come back.
 */
export function createProviderClient(
  logger: Logger,
  config: CreateAxiosDefaults,
): AxiosInstance {
  const client = axios.create(config);

  logger.bindAxios(client);

  return client;
}
