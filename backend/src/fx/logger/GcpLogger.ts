import type { AxiosInstance } from "axios";
import { errorLogger, requestLogger, responseLogger } from "axios-logger";
import { injectable } from "tsyringe";
import { emit, type LogFields, serializeError } from "./emit.js";
import type { Logger } from "./Logger.js";

@injectable()
export class GcpLogger implements Logger {
  log(message: string, meta?: LogFields): void {
    emit("INFO", message, meta);
  }
  warn(message: string, meta?: LogFields): void {
    emit("WARNING", message, meta);
  }
  error(message: string | Error, meta?: LogFields): void {
    if (message instanceof Error) {
      const err = serializeError(message);
      emit("ERROR", String(err["message"]), {
        stack_trace: err["stack_trace"],
        error_name: err["error_name"],
        ...meta,
      });
      return;
    }
    emit("ERROR", message, meta);
  }
  bindAxios(axios: AxiosInstance): void {
    axios.interceptors.request.use(
      (req) => requestLogger(req, { logger: (m) => emit("INFO", m) }),
      (err) => errorLogger(err, { logger: (m) => emit("ERROR", m) }),
    );
    axios.interceptors.response.use(
      (res) => responseLogger(res, { logger: (m) => emit("INFO", m) }),
      (err) => errorLogger(err, { logger: (m) => emit("ERROR", m) }),
    );
  }
}
