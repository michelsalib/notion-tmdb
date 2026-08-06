import type { Axios } from "axios";
import type { LogFields } from "./emit.js";

export interface Logger {
  log(message: string, meta?: LogFields): void;
  warn(message: string, meta?: LogFields): void;
  // Accepts an Error so the stack trace is serialized into `stack_trace`
  // (which GCP Error Reporting picks up).
  error(message: string | Error, meta?: LogFields): void;
  // Typed as `Axios` rather than `AxiosInstance` so it also accepts clients
  // built with `new Axios(...)` (NotionBackup's asset downloader).
  bindAxios(axios: Axios): void;
}
