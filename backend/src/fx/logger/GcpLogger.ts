import type { AxiosInstance } from "axios";
import { errorLogger, requestLogger, responseLogger } from "axios-logger";
import { injectable } from "tsyringe";
import type { Logger } from "./Logger.js";

// Cloud Logging auto-parses JSON on stdout. Severity must be one of:
// DEBUG, INFO, NOTICE, WARNING, ERROR, CRITICAL, ALERT, EMERGENCY.
// https://cloud.google.com/logging/docs/structured-logging
type Severity = "DEBUG" | "INFO" | "NOTICE" | "WARNING" | "ERROR";

function emit(severity: Severity, message: string): void {
  // Single JSON line per record; stderr for ERROR so the platform routes it
  // into the error reporter, stdout for the rest.
  const line = JSON.stringify({
    severity,
    message,
    timestamp: new Date().toISOString(),
  });
  if (severity === "ERROR") {
    console.error(line);
  } else {
    console.log(line);
  }
}

@injectable()
export class GcpLogger implements Logger {
  log(message: string): void {
    emit("INFO", message);
  }
  warn(message: string): void {
    emit("WARNING", message);
  }
  error(message: string): void {
    emit("ERROR", message);
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
