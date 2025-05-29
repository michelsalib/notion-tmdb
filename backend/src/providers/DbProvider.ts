import type { Config, UserData } from "../types.js";

export interface DbProvider {
  getUser(userId: string): Promise<UserData<any> | null>;
  listConfiguredUsers(): AsyncIterable<UserData<any>>;
  putUser(userData: UserData<any>): Promise<void>;
  putUserConfig(userId: string, dbConfig: Config): Promise<void>;
}
