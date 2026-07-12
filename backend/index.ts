import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { staticPlugin } from "@elysiajs/static";
import { Elysia } from "elysia";
import "reflect-metadata";
import "./src/api.js";
import "./src/auth.js";
import "./src/static.js";
import { loadEnvironmentConfig } from "./src/fx/di.js";
import { Router } from "./src/fx/router.js";

loadEnvironmentConfig(process.env);

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIST = join(__dirname, "../frontend/dist");

const app = new Elysia();

Router.load(app);

// Prod (NODE_ENV=production, set in Dockerfile): serve the built SPA out
// of `frontend/dist`. Dev: proxy everything not already handled to the
// frontend dev server (`bun start` in `frontend/`, port 5173) so a single
// URL (this backend's) works end-to-end with hot reload.
if (process.env["NODE_ENV"] === "production") {
  app.use(
    await staticPlugin({
      assets: FRONTEND_DIST,
      prefix: "/",
      indexHTML: true,
      maxAge: 86_400,
    }),
  );
} else {
  const FRONTEND_DEV = "http://localhost:5173";
  app.all("*", ({ request }) => {
    const url = new URL(request.url);
    const headers = new Headers(request.headers);
    headers.set("host", new URL(FRONTEND_DEV).host);
    return fetch(`${FRONTEND_DEV}${url.pathname}${url.search}`, {
      method: request.method,
      headers,
      body:
        request.method === "GET" || request.method === "HEAD"
          ? undefined
          : request.body,
      duplex: "half",
      redirect: "manual",
    });
  });
}

app.listen({
  port: Number(process.env["PORT"] ?? 7071),
  hostname: "0.0.0.0",
});

console.log(`Listening on :${process.env["PORT"] ?? 7071}`);
