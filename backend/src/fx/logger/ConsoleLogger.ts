import { AxiosInstance } from "axios";
import { errorLogger, requestLogger, responseLogger } from "axios-logger";
import { fluentProvide } from "inversify-binding-decorators";
import { AZURE_CONTEXT, LOGGER, LOGGER_ENGINE } from "../keys.js";
import { Logger } from "./Logger.js";

@(fluentProvide(LOGGER)
  .when(
    (r) =>
      r.parentContext.container.get(LOGGER_ENGINE) == "CONSOLE" ||
      !r.parentContext.container.isBound(AZURE_CONTEXT),
  )
  .done())
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
