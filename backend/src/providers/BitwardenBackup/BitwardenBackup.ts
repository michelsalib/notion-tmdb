import archiver from "archiver";
import axios, { AxiosInstance } from "axios";
import { inject, injectable } from "tsyringe";
import { LOGGER, STORAGE_PROVIDER, USER } from "../../fx/keys.js";
import type { Logger } from "../../fx/logger/Logger.js";
import type { BitwardenUserData, Suggestion } from "../../types.js";
import type { BackupDataProvider } from "../BackupDataProvider.js";
import type { BackupRef, StorageProvider } from "../Storage/StorageProvider.js";

/** Archives kept per user; older ones are deleted after a successful run. */
const KEEP_BACKUPS = 10;

@injectable()
export class BitwardenBackup implements BackupDataProvider<"BitwardenBackup"> {
  constructor(
    @inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @inject(USER) private readonly user: BitwardenUserData,
    @inject(LOGGER) private readonly logger: Logger,
  ) {}

  private async createClient(): Promise<AxiosInstance> {
    const client = axios.create({
      baseURL: "https://vault.bitwarden.com",
      headers: {
        "Bitwarden-Client-Name": "cli",
        "Bitwarden-Client-Version": "2024.12.0",
      },
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
    // A stored record can lack an API key entirely — `auth.ts` used to persist
    // one on any `/login` hit without query params. Skip those instead of
    // round-tripping to Bitwarden, which answers `invalid_client` and (before
    // JobOrchestrator isolated users) aborted the whole weekly run.
    const credentials = this.user.bitwardenVault;
    if (!credentials?.clientId || !credentials.clientSecret) {
      this.logger.warn("Skipping user with no Bitwarden API key", {
        user_id: this.user.id,
      });

      return "Skipped: no Bitwarden API key.";
    }

    const client = await this.createClient();

    yield "Syncing vault...";

    const vault = await client.get("/api/sync");

    yield "Storing backup...";

    const archive = archiver("zip");

    // Upload first, finalize second: with no consumer attached, `finalize()`
    // resolves only once the whole zip is sitting in archiver's buffer.
    const upload = this.storage.putBackup(archive, new Date());

    archive.append(JSON.stringify(vault.data), {
      name: "vault_data.json",
    });

    await archive.finalize();
    await upload;

    await this.storage.pruneBackups(KEEP_BACKUPS);

    return "Backup done.";
  }

  async getBackupDate(): Promise<Date | undefined> {
    const meta = await this.storage.getBackupMeta();

    return meta.lastModified;
  }

  listBackups(): Promise<BackupRef[]> {
    return this.storage.listBackups();
  }

  async getLink(key?: string): Promise<string> {
    return this.storage.getBackupLink(key);
  }
}
