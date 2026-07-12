import { inject, injectable } from "tsyringe";
import type { BackupDataProvider } from "../../providers/BackupDataProvider.js";
import type { DbProvider } from "../../providers/DbProvider.js";
import type { DOMAIN } from "../../types.js";
import { userIdContainer } from "../di.js";
import {
  DATA_PROVIDER,
  DB_PROVIDER,
  DOMAIN as DOMAIN_KEY,
  LOGGER,
} from "../keys.js";
import type { Logger } from "../logger/Logger.js";

@injectable()
export class JobOrchestrator {
  constructor(
    @inject(DB_PROVIDER) private readonly db: DbProvider,
    @inject(DOMAIN_KEY) private readonly domain: DOMAIN,
    @inject(LOGGER) private readonly logger: Logger,
  ) {}

  async start(): Promise<void> {
    const users = this.db.listConfiguredUsers();

    for await (const user of users) {
      const userContainer = await userIdContainer(user.id, this.domain);
      const backup =
        userContainer.resolve<BackupDataProvider<any>>(DATA_PROVIDER);

      for await (const message of backup.sync()) {
        this.logger.log(message);
      }
    }
  }
}
