import axios, { AxiosInstance } from "axios";
import { inject } from "inversify";
import { fluentProvide } from "inversify-binding-decorators";
import {
  DATA_PROVIDER,
  DOMAIN as DOMAIN_KEY,
  LOGGER,
  STORAGE_PROVIDER,
  USER,
} from "../../fx/keys.js";
import { BitwardenUserData, DOMAIN, Suggestion } from "../../types.js";
import { BackupDataProvider } from "../BackupDataProvider.js";
import { StorageProvider } from "../Storage/StorageProvider.js";
import archiver from "archiver";
import { Logger } from "../../fx/logger/Logger.js";

@(fluentProvide(DATA_PROVIDER)
  .when(
    (r) =>
      r.parentContext.container.get<DOMAIN>(DOMAIN_KEY) == "BitwardenBackup",
  )
  .done())
export class BitwardenBackup implements BackupDataProvider<"BitwardenBackup"> {
  constructor(
    @inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @inject(USER) private readonly user: BitwardenUserData,
    @inject(LOGGER) private readonly logger: Logger,
  ) {}

  private async createClient(): Promise<AxiosInstance> {
    const client = axios.create({
      baseURL: "https://vault.bitwarden.com",
    });

    this.logger.bindAxios(client);

    const token = await client.post(
      "/identity/connect/token",
      new URLSearchParams({
        grant_type: "client_credentials",
        scope: "api",
        client_id: this.user.bitwardenVault.clientId,
        client_secret: this.user.bitwardenVault.clientSecret,
        deviceType: "22",
        deviceIdentifier: "notion-biwarden.micheldev.com",
        deviceName: "notion-biwarden.micheldev.com",
      }),
    );

    client.defaults.headers["Authorization"] =
      `Bearer ${token.data.access_token}`;

    return client;
  }

  search(): Promise<Suggestion[]> {
    throw new Error("Method not implemented.");
  }

  loadNotionEntry(): Promise<any> {
    throw new Error("Method not implemented.");
  }

  async *sync(): AsyncGenerator<string> {
    const client = await this.createClient();

    yield "Syncing vault...";

    const vault = await client.get("/api/sync");

    yield "Storing backup...";

    const archive = archiver("zip");
    archive.append(JSON.stringify(vault.data), {
      name: "vault_data.json",
    });
    archive.finalize();

    await this.storage.putBackup(archive);

    return "Backup done.";
  }

  async getBackupDate(): Promise<Date | undefined> {
    const meta = await this.storage.getBackupMeta();

    return meta.lastModified;
  }

  async getLink(): Promise<string> {
    return this.storage.getBackupLink();
  }
}
