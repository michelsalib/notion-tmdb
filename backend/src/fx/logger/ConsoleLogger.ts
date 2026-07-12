import type { AxiosInstance } from "axios";
import { errorLogger, requestLogger, responseLogger } from "axios-logger";
import { injectable } from "tsyringe";
import type { Logger } from "./Logger.js";

@injectable()
export class ConsoleLogger implements Logger {
  log(message: string) {
    console.log(message);
  }
  warn(message: string) {
    console.warn(message);
  }
  error(message: string) {
    console.error(message);
  }
  bindAxios(axios: AxiosInstance) {
    axios.interceptors.request.use(requestLogger, errorLogger);
    axios.interceptors.response.use(responseLogger, errorLogger);
  }
}
