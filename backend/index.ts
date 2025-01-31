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
import { loadEnvironmentConfig, unScopedContainer } from "./src/fx/di.js";
import { Router } from "./src/fx/router.js";
import "./src/static.js";
import { JobOrchestrator } from "./src/fx/scheduler/JobOrchestrator.js";

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
    DB_ENGINE: "COSMOS",
    STORAGE_ENGINE: "AZURE",
    LOGGER_ENGINE: "AZURE_CONTEXT",
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
    handler: async (
      request: azure.HttpRequest,
      context: azure.InvocationContext,
    ) => {
      // special handling of streamed responses
      if (request.method == "POST" && request.url.endsWith("/api/sync")) {
        const stream = await Router.execute(
          "POST",
          "/api/sync",
          {
            hostname: new URL(request.url).hostname,
            cookies: (request.headers.get("cookie") || "").split(";").reduce(
              (res, cur) => {
                const [key, value] = cur.split("=");

                res[key] = value.trim();

                return res;
              },
              {} as Record<string, string>,
            ),
            headers: {
              referer: request.headers.get("referer"),
              ["user-agent"]: request.headers.get("user-agent"),
            },
          } as any,
          context,
        );

        return {
          body: stream,
          headers: {
            "content-type": "multipart/text",
          },
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

  azure.app.timer("scheduledBackup", {
    // schedule: "0 0 0 * * sun", // every sunday at midnight
    schedule: "0 * * * * *", // every minutes
    handler: async (_, context: azure.InvocationContext) => {
      const container = await unScopedContainer("BitwardenBackup", context);

      const jobOrchestrator = container.get<JobOrchestrator>(JobOrchestrator);

      await jobOrchestrator.start();
    },
    // runOnStartup: true,
  });
} else {
  const settings = await import(join(__dirname, "../local.settings.json"), {
    with: {
      type: "json",
    },
  });

  loadEnvironmentConfig({
    ...process.env,
    ...settings.default.Values,
    DB_ENGINE: "MONGO",
    STORAGE_ENGINE: "FILESYSTEM",
    LOGGER_ENGINE: "CONSOLE",
  });

  fastApp.listen({
    port: 7071, // matchin azure func default port
  });
}
