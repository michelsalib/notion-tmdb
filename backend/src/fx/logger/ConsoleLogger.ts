import type { Axios } from "axios";
import { errorLogger, requestLogger, responseLogger } from "axios-logger";
import { injectable } from "tsyringe";
import { AXIOS_LOG_CONFIG } from "./axiosLogConfig.js";
import type { LogFields } from "./emit.js";
import type { Logger } from "./Logger.js";

@injectable()
export class ConsoleLogger implements Logger {
  log(message: string, meta?: LogFields) {
    if (meta) console.log(message, meta);
    else console.log(message);
  }
  warn(message: string, meta?: LogFields) {
    if (meta) console.warn(message, meta);
    else console.warn(message);
  }
  error(message: string | Error, meta?: LogFields) {
    if (meta) console.error(message, meta);
    else console.error(message);
  }
  bindAxios(axios: Axios) {
    // Redacted in dev too: the same live credentials are in play locally, and
    // console output routinely gets pasted into issues and terminal shares.
    axios.interceptors.request.use(
      (req) => requestLogger(req, AXIOS_LOG_CONFIG),
      (err) => errorLogger(err, AXIOS_LOG_CONFIG),
    );
    axios.interceptors.response.use(
      (res) => responseLogger(res, AXIOS_LOG_CONFIG),
      (err) => errorLogger(err, AXIOS_LOG_CONFIG),
    );
  }
}
