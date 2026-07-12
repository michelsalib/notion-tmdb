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

const app = new Elysia();

app.use(
  await staticPlugin({
    assets: join(__dirname, "../frontend/dist"),
    prefix: "/",
    indexHTML: true,
    maxAge: 86_400,
  }),
);

Router.load(app);

app.listen({
  port: Number(process.env["PORT"] ?? 7071),
  hostname: "0.0.0.0",
});

console.log(`Listening on :${process.env["PORT"] ?? 7071}`);
