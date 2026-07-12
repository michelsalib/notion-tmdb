import { Client } from "@notionhq/client";
import type { OauthTokenResponse } from "@notionhq/client/build/src/api-endpoints.js";
import { inject, injectable } from "tsyringe";
import {
  NOTION_CLIENT_ID,
  NOTION_CLIENT_SECRET,
  REQUEST,
} from "../../fx/keys.js";
import type { ScopedRequest } from "../../fx/router.js";

@injectable()
export class AnonymousNotionClient {
  private readonly client: Client;

  constructor(
    @inject(REQUEST) private readonly request: ScopedRequest,
    @inject(NOTION_CLIENT_ID) private readonly clientId: string,
    @inject(NOTION_CLIENT_SECRET) private readonly clientSecret: string,
  ) {
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
