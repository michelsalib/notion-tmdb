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
    const failed: string[] = [];

    for await (const user of users) {
      // Isolate each user: an unreachable or misconfigured account used to
      // throw straight out of this loop, so every user still queued behind it
      // in cursor order was silently skipped for the week.
      try {
        const userContainer = await userIdContainer(user.id, this.domain);
        const backup =
          userContainer.resolve<BackupDataProvider<any>>(DATA_PROVIDER);

        for await (const message of backup.sync()) {
          this.logger.log(message);
        }
      } catch (error) {
        failed.push(user.id);
        this.logger.error(error as Error, { user_id: user.id });
      }
    }

    // Still exit non-zero so a genuine breakage surfaces as a failed execution
    // — but only after every other user has had their turn.
    if (failed.length > 0) {
      throw new Error(
        `Backup failed for ${failed.length} of the configured users: ${failed.join(", ")}`,
      );
    }
  }
}
