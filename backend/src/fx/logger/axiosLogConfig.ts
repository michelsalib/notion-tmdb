import type { GlobalLogConfig } from "axios-logger/lib/common/types.js";

/**
 * Shared `axios-logger` settings for every `bindAxios` implementation.
 *
 * Bodies must stay out of the logs. `axios-logger` defaults `data` to true,
 * which serialized whole request and response payloads into Cloud Logging at
 * INFO — that put Bitwarden `client_secret` values, the OAuth `access_token`s
 * they return, and entire `/api/sync` vault dumps in front of anyone holding
 * `logging.viewer` on the project.
 *
 * `headers` and `params` already default to false, but they carry bearer tokens
 * and API keys too, so pin all three rather than inheriting them: a future
 * upstream default change, or any `setGlobalConfig` call, would otherwise
 * silently switch credential logging back on.
 *
 * Method, URL and status still come through, which is what makes the logs
 * useful for tracing a provider call.
 */
export const AXIOS_LOG_CONFIG: GlobalLogConfig = {
  data: false,
  headers: false,
  params: false,
};
