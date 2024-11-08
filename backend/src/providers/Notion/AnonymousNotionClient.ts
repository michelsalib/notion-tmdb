import { Client } from "@notionhq/client";
import { provide } from "inversify-binding-decorators";
import {
  NOTION_CLIENT_ID,
  NOTION_CLIENT_SECRET,
  REQUEST,
} from "../../fx/keys.js";
import { inject } from "inversify";
import fastify from "fastify";
import { OauthTokenResponse } from "@notionhq/client/build/src/api-endpoints.js";

@provide(AnonymousNotionClient)
export class AnonymousNotionClient {
  private readonly client: Client;

  @inject(NOTION_CLIENT_ID)
  private readonly clientId!: string;
  @inject(NOTION_CLIENT_SECRET)
  private readonly clientSecret!: string;

  constructor(@inject(REQUEST) private readonly request: fastify.FastifyRequest) {
    this.client = new Client();
  }

  async generateUserToken(): Promise<OauthTokenResponse> {
    return this.client.oauth.token({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code: (this.request.query as any)["code"] as string,
      grant_type: "authorization_code",
      redirect_uri: this.getRedirectUrl(),
    });
  }

  private getRedirectUrl() {
    const domain = this.request.host.replace(
      /notion-\w+\.localhost/,
      "localhost",
    );
    // this is because fastify protocol is wrong when using inject
    const protocol = domain.includes("localhost") ? "http" : "https";

    return `${protocol}://${domain}/login`;
  }
}
