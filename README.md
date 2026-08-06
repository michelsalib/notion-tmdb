# Notion connectors

A little suite of Notion plugins I built for myself — and I'm happy to share
them with anyone who finds them useful. Each one turns a plain Notion database
into a self-updating tracker: type in a title, and the connector fills in the
rest.

- **Notion TMDB** — build movie watchlists, synced from TMDB.
- **Notion GBook** — build reading lists, synced from Google Books.
- **Notion IGDB** — build game backlogs, synced from IGDB.
- **Notion BilletReduc** — build a theatre watchlist, synced from
  billetreduc.com.
- **Notion GoCardless** — import your bank transactions via GoCardless.
- **Notion Backup** — periodic backups of a Notion workspace.
- **Bitwarden Backup** — periodic backups of a Bitwarden vault.

**Try it now** — it's hosted and free at
**[notion-tmdb.micheldev.com](https://notion-tmdb.micheldev.com)**, no install
required.

Curious what's coming next? The roadmap lives on
[Notion](https://michelsalib.notion.site/ca1917bcf6174025a8533ed51450a073?v=101bb1cb1e0980c8870b000c95acaf85).

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
support/   One-off operational scripts
```

## Development

Want to hack on it? You'll need [Bun](https://bun.sh) 1.3+ and npm 10+ (for
`bun install` compatibility with the workspaces layout). Then:

```sh
bun install                       # install all workspaces
bun run dev                       # backend + hot reload (PORT=7071)
cd frontend && bun start          # frontend dev server (:5173)
```

Before pushing, run what CI runs:

```sh
bun run check                     # Biome lint + format
bun run typecheck                 # both workspaces via tsgo
bun test                          # unit tests
```

Open **http://localhost:7071** and you're running — the backend serves the
built SPA in prod and, when there's no `frontend/dist`, transparently proxies
all non-API requests to the frontend dev server on `:5173`, so a single URL
covers dev too.

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

## Contributing

Issues, ideas, and pull requests are all welcome — whether it's a bug you hit,
a connector you'd love to see, or a rough edge worth smoothing. Feel free to
open an issue to say hello or start a discussion.
