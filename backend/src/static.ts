import { FastifyReply } from "fastify";
import { Container } from "inversify";
import { REPLY } from "./fx/keys.js";
import { route } from "./fx/router.js";

export class Static {
  @route({ path: "/legal", method: "GET", authenticate: false })
  async legal(container: Container) {
    const { reply } = container.get<{ reply: FastifyReply }>(REPLY);

    reply.sendFile("legal.md");
  }
}
