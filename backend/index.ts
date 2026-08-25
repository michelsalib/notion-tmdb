import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { staticPlugin } from "@elysiajs/static";
import { Elysia } from "elysia";
import "reflect-metadata";
import "./src/api.js";
import "./src/auth.js";
import "./src/static.js";
import { isConnectorHost } from "./src/domains.js";
import { computeDomain, loadEnvironmentConfig } from "./src/fx/di.js";
import { resolveEnv } from "./src/fx/env.js";
import { patchConsole } from "./src/fx/logger/patchConsole.js";
import {
  enterTraceContext,
  parseCloudTraceContext,
} from "./src/fx/logger/traceContext.js";
import { Router } from "./src/fx/router.js";
import { pageMeta, stampHead } from "./src/pageMeta.js";

loadEnvironmentConfig(resolveEnv(process.env));

// GCP-mode: route stray console.* calls through the structured emitter so
// every log ends up as a single JSON line Cloud Logging can parse.
if (process.env["LOGGER_ENGINE"] === "GCP") {
  patchConsole();
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIST = join(__dirname, "../frontend/dist");

const app = new Elysia();

// Extract Cloud Run's per-request X-Cloud-Trace-Context header and stash it
// in AsyncLocalStorage so every downstream log carries the same trace ID —
// Cloud Logging then groups all lines for one request together in the UI.
app.onRequest(({ request }) => {
  const ctx = parseCloudTraceContext(
    request.headers.get("x-cloud-trace-context"),
    process.env["GCP_PROJECT_ID"],
  );
  if (ctx) enterTraceContext(ctx);
});

Router.load(app);

// Prod (NODE_ENV=production, set in Dockerfile): serve the built SPA out
// of `frontend/dist`. Dev: proxy everything not already handled to the
// frontend dev server (`bun start` in `frontend/`, port 5173) so a single
// URL (this backend's) works end-to-end with hot reload.
if (process.env["NODE_ENV"] === "production") {
  const INDEX = Bun.file(join(FRONTEND_DIST, "index.html"));

  // Serve the SPA shell ourselves so its head can be stamped for the host that
  // asked for it — see pageMeta.ts for why one shared document is a problem.
  // `indexHTML: false` hands the plugin the assets and nothing else; it would
  // otherwise answer both `/` and every unknown path with the file unchanged.
  const shell = async (request: Request, query: Record<string, unknown>) => {
    const url = new URL(request.url);
    const host = request.headers.get("host") ?? url.host;
    const hostname = host.split(":")[0] ?? "";
    const protocol = (
      request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "")
    )
      .split(",")[0]!
      .trim();

    // Indexable only as a connector's own bare landing page. A query string
    // means an embed (`?userId=`, `?multi`) or an OAuth hand-back, and an
    // unmapped host is the public `*.run.app` URL — both are the same document
    // as the landing page, so letting them be indexed recreates by the back
    // door the duplication the canonical is here to settle.
    const landing = url.pathname === "/" && url.search === "";
    const meta = await pageMeta(
      computeDomain({ hostname, query }),
      `${protocol}://${host}/`,
      !landing || !isConnectorHost(hostname),
    );

    return new Response(stampHead(await INDEX.text(), meta), {
      headers: {
        "content-type": "text/html; charset=utf-8",
        // The shell names hashed bundles, so a cached copy outlives the deploy
        // that renamed them. Revalidate it; the assets keep their long maxAge.
        "cache-control": "public, max-age=0, must-revalidate",
      },
    });
  };

  app.get("/", ({ request, query }) => shell(request, query));

  app.use(
    await staticPlugin({
      assets: FRONTEND_DIST,
      prefix: "/",
      indexHTML: false,
      // …and not the shell under its own name either, or `/index.html` stays
      // reachable as an un-stamped, titleless copy of `/`. It falls through to
      // the wildcard below, which stamps it noindex like any other path.
      ignorePatterns: [/index\.html$/],
      maxAge: 86_400,
    }),
  );

  // SPA fallback, after the assets so a real file always wins.
  app.get("*", ({ request, query }) => shell(request, query));
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
