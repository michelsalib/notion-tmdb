import type { DbConfig, UserData } from "../types.js";

export interface DbProvider {
  getUser(userId: string): Promise<UserData<any>>;
  getLoggedUser(): Promise<UserData<any>>;
  putUser(userData: UserData<any>): Promise<void>;
  putUserConfig(userId: string, dbConfig: DbConfig): Promise<void>;
}
