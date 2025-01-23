import { AxiosInstance } from "axios";

export interface Logger {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  bindAxios(axios: AxiosInstance): void;
}
