import type azure from "@azure/functions";
import fastifyCookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import dotenv from "dotenv";
import fastify from "fastify";
import { dirname, join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import "reflect-metadata";
import "./src/api.js";
import "./src/auth.js";
import { loadEnvironmentConfig } from "./src/fx/di.js";
import { Router } from "./src/fx/router.js";
import "./src/static.js";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

const fastApp = fastify();
fastApp.register(fastifyStatic, {
  root: join(__dirname, "../../frontend/dist/"),
  maxAge: 86_400_000, // 1 day
});
fastApp.register(fastifyCookie, {});
Router.load(fastApp);

if (
  process.env["AZURE_FUNCTIONS_ENVIRONMENT"] ||
  process.env["WEBSITE_RUN_FROM_PACKAGE"]
) {
  const azure = await import("@azure/functions");

  loadEnvironmentConfig({
    ...process.env,
  });

  azure.app.setup({
    enableHttpStream: true,
  });

  azure.app.http("azureFunctionToFastify", {
    route: "{*path}",
    methods: [
      "CONNECT",
      "DELETE",
      "GET",
      "HEAD",
      "OPTIONS",
      "PATCH",
      "POST",
      "PUT",
      "TRACE",
    ],
    handler: async (request: azure.HttpRequest) => {
      // special handling of streamed responses
      if (request.method == "POST" && request.url.endsWith("/api/backup")) {
        const stream = await Router.execute("POST", "/api/backup", {
          hostname: new URL(request.url).hostname,
          cookies: (request.headers.get('cookie') || '').split(';').reduce((res, cur) => {
            const [key, value] = cur.split('=');

            res[key] = value.trim();

            return res;
          }, {} as Record<string, string>),
          headers: {
            referer: request.headers.get('referer'),
          },
        } as any);

        return {
          body: stream,
        };
      }

      // standard request/response goes through fastify inject
      const payload = await request.text();
      const fastResponse = await fastApp.inject({
        method: request.method as any,
        url: request.url,
        query: request.query.toString(),
        payload: payload,
        headers: {
          ...Object.fromEntries(request.headers),
          "content-length": Buffer.byteLength(payload), // recompute content lenght because of http decompression
        },
      });

      return {
        status: fastResponse.statusCode,
        body: fastResponse.rawPayload.length
          ? fastResponse.rawPayload
          : undefined,
        headers: fastResponse.headers,
      } as azure.HttpResponseInit;
    },
  });
} else {
  const settings = await import(join(__dirname, "../local.settings.json"), {
    assert: {
      type: "json",
    },
  });

  loadEnvironmentConfig({
    ...process.env,
    ...settings.default.Values,
  });

  fastApp.listen({
    port: 7071, // matchin azure func default port
  });
}
