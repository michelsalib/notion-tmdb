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

- **Runtime**: Bun 1.3, deployed as a Cloud Run v2 Service (HTTP) plus a
  Cloud Run Job for the weekly Bitwarden backup.
- **Backend**: TypeScript, Elysia, tsyringe (DI), Notion / TMDB / IGDB /
  GBook / GoCardless / Bitwarden clients, MongoDB Atlas.
- **Frontend**: React 19 + MUI, bundled with Bun's built-in bundler.
- **Tooling**: Biome (lint + format), TypeScript via
  [`tsgo`](https://github.com/microsoft/typescript-go) (native preview
  compiler), npm workspaces.
- **Infra**: Terraform under `infra/` (Cloud Run, Cloud Scheduler, Artifact
  Registry, Secret Manager, GCS backup bucket, MongoDB Atlas M0, WIF for CI,
  budget alerts).
- **CI/CD**: GitHub Actions → Workload Identity Federation → Cloud Run
  (`.github/workflows/deploy.yml`).

## Workspaces

```
backend/   Elysia app (API, auth, background job entrypoint)
frontend/  React SPA served by the backend
infra/     Terraform (GCP + MongoDB Atlas)
support/   One-off scripts (e.g. Cosmos → Atlas data migration)
```

## Development

Prerequisites: [Bun](https://bun.sh) 1.3+, npm 10+ (for `bun install`
compatibility with the workspaces layout).

```sh
bun install                       # install all workspaces
bun run dev                       # backend + hot reload (PORT=7071)
cd frontend && bun start          # frontend dev server (:5173)
```

Open **http://localhost:7071** — the backend serves the built SPA in prod
and, when there's no `frontend/dist`, transparently proxies all non-API
requests to the frontend dev server on `:5173` so a single URL covers dev
too.

## Build & deploy

Deploys happen automatically on push to `main` via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml): it builds the
Docker image, pushes to Artifact Registry, and runs `terraform apply` to
roll the new revision to Cloud Run.

Manual local apply (only if CI is blocked):

```sh
cd infra/
terraform init -backend-config="bucket=micheldev-notion-tmdb-tf-state"
terraform apply
```

First-time infra bootstrap for a fresh GCP project is documented in
[`infra/bootstrap.sh`](infra/bootstrap.sh).
