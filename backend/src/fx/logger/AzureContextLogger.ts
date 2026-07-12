import type { InvocationContext } from "@azure/functions";
import type { AxiosInstance } from "axios";
import { errorLogger, requestLogger, responseLogger } from "axios-logger";
import { inject, injectable } from "tsyringe";
import { AZURE_CONTEXT } from "../keys.js";
import type { Logger } from "./Logger.js";

@injectable()
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
