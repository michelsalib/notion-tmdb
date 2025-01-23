import type { InvocationContext } from "@azure/functions";
import { AxiosInstance } from "axios";
import { errorLogger, requestLogger, responseLogger } from "axios-logger";
import { inject } from "inversify";
import { fluentProvide } from "inversify-binding-decorators";
import { AZURE_CONTEXT, LOGGER, LOGGER_ENGINE } from "../keys.js";
import { Logger } from "./Logger.js";

@(fluentProvide(LOGGER)
  .when(
    (r) =>
      r.parentContext.container.get(LOGGER_ENGINE) == "AZURE_CONTEXT" &&
      r.parentContext.container.isBound(AZURE_CONTEXT),
  )
  .done())
export class AzureContextLogger implements Logger {
  constructor(
    @inject(AZURE_CONTEXT) private readonly context: InvocationContext,
  ) {}

  log(message: string) {
    this.context.log(message);
  }

  warn(message: string) {
    this.context.warn(message);
  }

  error(message: string) {
    this.context.error(message);
  }

  bindAxios(axios: AxiosInstance) {
    axios.interceptors.request.use(
      (request) => {
        return requestLogger(request, {
          logger: (message) => this.context.log(message),
        });
      },
      (error) => {
        return errorLogger(error, {
          logger: (message) => this.context.error(message),
        });
      },
    );
    axios.interceptors.response.use(
      (response) => {
        return responseLogger(response, {
          logger: (message) => this.context.log(message),
        });
      },
      (error) => {
        return errorLogger(error, {
          logger: (message) => this.context.error(message),
        });
      },
    );
  }
}
