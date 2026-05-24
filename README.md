# Notion connector

This is a suite of Notion plugins that I built for myself, and anyone else
wanting to use them.

- **Notion TMDB**: syncs a Notion DB with TMDB to help build movie watchlists.
- **Notion GBook**: syncs a Notion DB with Google Books to help build book
  readlists.
- **Notion IGDB**: syncs a Notion DB with IGDB to help build game backlogs.
- **Notion GoCardless**: imports bank transactions into a Notion DB via
  GoCardless.
- **Notion Backup**: periodic backups of a Notion workspace.
- **Bitwarden Backup**: periodic backups of a Bitwarden vault.

My dev roadmap is on
[Notion](https://michelsalib.notion.site/ca1917bcf6174025a8533ed51450a073?v=101bb1cb1e0980c8870b000c95acaf85).

Hosted and free to use on https://notion-tmdb.micheldev.com.

## Tech stack

- **Runtime**: Node.js 24, deployed as an Azure Functions app.
- **Backend**: TypeScript, Fastify, Inversify (DI), Notion / TMDB / IGDB /
  GBook / GoCardless / Bitwarden clients, MongoDB and Cosmos DB.
- **Frontend**: React 19 + MUI 9, built with Vite 8.
- **Tooling**: Biome (lint + format), TypeScript via
  [`tsgo`](https://github.com/microsoft/typescript-go) (native preview
  compiler), npm workspaces.
- **Infra**: Bicep templates under `azure/`.

## Workspaces

```
backend/   Azure Functions app (API, auth, background jobs)
frontend/  React SPA served by the function app
azure/     Bicep infrastructure templates
```

## Development

Prerequisites: Node.js 24, npm 10+, and the
[Azure Functions Core Tools](https://learn.microsoft.com/azure/azure-functions/functions-run-local)
for running the backend locally.

```sh
npm install              # install all workspaces

npm run check            # biome lint + format check
npm run fix              # biome --write (apply safe fixes + format)

npm --workspace backend run watch    # tsgo --watch
npm --workspace backend run start    # func start

npm --workspace frontend run start   # vite dev server
```

The Vite dev server proxies `/api/*`, `/login`, `/logout` to the local
function host on `127.0.0.1:7071`.

## Build & deploy

```sh
npm run build            # build all workspaces + assemble dist/
npm run code:deploy      # zip dist/ and push to Azure
npm run infra:deploy     # apply azure/template.bicep
```
