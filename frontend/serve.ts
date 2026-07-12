import { join } from "node:path";
import index from "./index.html";

const BACKEND = "http://localhost:7071";
const STATIC_DIR = join(import.meta.dir, "static");

Bun.serve({
  port: Number(process.env["PORT"] ?? 5173),
  hostname: "0.0.0.0",
  development: true,
  routes: {
    "/": index,
  },
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    // Proxy API + auth routes through to the backend.
    if (
      path.startsWith("/api/") ||
      path === "/login" ||
      path === "/logout" ||
      path === "/legal" ||
      path === "/backup"
    ) {
      const headers = new Headers(req.headers);
      headers.set("host", new URL(BACKEND).host);
      return fetch(`${BACKEND}${path}${url.search}`, {
        method: req.method,
        headers,
        body:
          req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
        // @ts-expect-error — Bun-specific option needed when body is a stream.
        duplex: "half",
        redirect: "manual",
      });
    }

    // Static assets from frontend/static/ (locales, images, etc.).
    const file = Bun.file(join(STATIC_DIR, path));
    if (await file.exists()) {
      return new Response(file);
    }

    // SPA fallback — let the React app handle unknown paths.
    return new Response(Bun.file(join(import.meta.dir, "index.html")));
  },
});

console.log(
  `Frontend dev server on :${process.env["PORT"] ?? 5173} (proxying API → ${BACKEND})`,
);
