import type { AxiosInstance } from "axios";
import { errorLogger, requestLogger, responseLogger } from "axios-logger";
import { injectable } from "tsyringe";
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
  bindAxios(axios: AxiosInstance) {
    axios.interceptors.request.use(requestLogger, errorLogger);
    axios.interceptors.response.use(responseLogger, errorLogger);
  }
}
