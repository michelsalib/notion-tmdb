import { FastifyReply } from "fastify";
import { Container } from "inversify";
import { REPLY, STORAGE_PROVIDER } from "./fx/keys.js";
import { route } from "./fx/router.js";
import { FilesystemStorage } from "./providers/Storage/FilesystemClient.js";
import { parse } from "path";

export class Static {
  @route({ path: "/legal", method: "GET", authenticate: false })
  async legal(container: Container) {
    const { reply } = container.get<{ reply: FastifyReply }>(REPLY);

    reply.sendFile("legal.md");
  }

  @route({ path: "/backup", method: "GET", authenticate: false })
  async backup(container: Container) {
    const { reply } = container.get<{ reply: FastifyReply }>(REPLY);
    const filesystem = container.get<FilesystemStorage>(STORAGE_PROVIDER);
    const { base, dir } = parse(filesystem.getBackupFilename());

    await reply.sendFile(base, dir);
  }
}
