import type { AxiosInstance } from "axios";
import type { LogFields } from "./emit.js";

export interface Logger {
  log(message: string, meta?: LogFields): void;
  warn(message: string, meta?: LogFields): void;
  // Accepts an Error so the stack trace is serialized into `stack_trace`
  // (which GCP Error Reporting picks up).
  error(message: string | Error, meta?: LogFields): void;
  bindAxios(axios: AxiosInstance): void;
}
