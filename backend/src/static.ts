import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DependencyContainer, injectable } from "tsyringe";
import { STORAGE_PROVIDER } from "./fx/keys.js";
import { Router } from "./fx/router.js";
import { FilesystemStorage } from "./providers/Storage/FilesystemClient.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIST = join(__dirname, "../../frontend/dist");

@injectable()
export class Static {
  async legal() {
    return Bun.file(join(FRONTEND_DIST, "legal.md"));
  }

  // /backup only makes sense for FilesystemStorage (local dev). With any
  // cloud storage backend, getBackupLink() returns a real signed URL and
  // nothing routes through here.
  async backup(container: DependencyContainer) {
    const storage = container.resolve(STORAGE_PROVIDER);
    if (!(storage instanceof FilesystemStorage)) {
      return new Response("Not found", { status: 404 });
    }
    return Bun.file(storage.getBackupFilename());
  }
}

Router.register(Static, "legal", {
  path: "/legal",
  method: "GET",
  authenticate: false,
});
Router.register(Static, "backup", {
  path: "/backup",
  method: "GET",
  authenticate: false,
});
