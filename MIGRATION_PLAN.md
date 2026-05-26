# Migration: Azure Functions → GCP Cloud Run + Bun + Elysia

> **For Claude resuming this task in a fresh session:** Read this whole file first. The user is moving the repo into WSL and restarting VSCode. All decisions below are locked unless explicitly marked as open. Pick up at the first unchecked task in the phase list.

---

## Context

The repo is a personal Notion ↔ third-party (TMDB / IGDB / GBook / GoCardless / Bitwarden) integration deployed on Azure Functions (Consumption Y1) + Cosmos Serverless + Storage Account. One Function App hosts 6 hostname-routed sub-apps (`notion-tmdb`, `notion-gbook`, `notion-backup`, `notion-gocardless`, `bitwarden-backup`, `notion-igdb` — all under `micheldev.com`). A weekly timer triggers the Bitwarden backup.

**Why migrate:** Bicep ceremony is heavy for a hobby app ([azure/template.bicep](azure/template.bicep) is 240 lines), Azure Functions forces a custom HTTP/Fastify adapter at [backend/index.ts:28-134](backend/index.ts#L28-L134), Cosmos is overkill (code already supports Mongo locally), and `az` CLI + cert thumbprint dance for 6 custom domains is friction every deploy.

**Goal:** Same 6 subdomains, near-zero cost, container-based deploy on GCP Cloud Run, Bun runtime + Elysia framework, working local dev via Docker Compose in WSL with VSCode debugger, no Azure-specific code paths left.

---

## Locked decisions

| Axis | Choice | Notes |
|---|---|---|
| Cloud | **GCP Cloud Run** | Chose over Scaleway after weighing free-tier wording (GCP has explicit "Always Free" doc commitment, Scaleway does not). |
| Region | **`us-central1`** | User chose truly-free over EU residency. Cloud Run Always Free is US-only. Atlas M0 also offered here. |
| IaC | **Terraform** | Replaces Bicep. State in GCS bucket. |
| Runtime | **Bun 1.x** | Pinned via `oven/bun:1` image. Drop `dotenv` (Bun auto-loads `.env`), drop `ts-node` (Bun runs TS natively). Keep `tsgo --noEmit` for CI type checks only. |
| HTTP framework | **Elysia** (Bun-native) | Replaces Fastify. Drops `@fastify/cookie`, `@fastify/static`. ~2-3 days of careful refactor across Router + every route handler. |
| Frontend bundler | **Bun.build** | Drops Vite + `@vitejs/plugin-react`. Use `bun build --target=browser` for prod, `bun --hot` for dev. HMR slightly less polished than Vite for MUI; accept trade-off. |
| Local dev | **Hybrid: app on host, services in Docker** | docker-compose runs only `mongo` + `fsouza/fake-gcs-server`. App runs directly on WSL via `bun --watch --inspect backend/index.ts`. VSCode attaches via `oven.bun-vscode` extension. |
| DB | **MongoDB Atlas M0 (GCP us-central1)** | Free 512MB. Verify M0 availability in us-central1 before locking the cluster. Fallback: AWS `us-east-1` (well-supported by M0). |
| Blob | **GCS bucket** | `@google-cloud/storage` SDK. Same SDK in dev pointed at `fsouza/fake-gcs-server` via `apiEndpoint` override — no separate "local" code path. |
| Cron | **Cloud Scheduler → Cloud Run Job** | OIDC invoke. Free tier covers 1 job. |
| Logs | **stdout JSON → Cloud Logging** | New `GcpLogger` engine emitting `{severity, message, ...}`. Cloud Logging auto-parses. |
| Domains | **Cloud Run Domain Mappings × 6** | One-time Search Console verification of `micheldev.com` apex; subdomains inherit. Cert provisioning takes 15-60 min — plan cutover window. |
| Secrets | **Secret Manager → env at instance start** | 13 secrets (10 OAuth pairs + GOCARDLESS + IGDB + TMDB). Non-secret config inline. |

---

## Open questions (annotate before / during execution)

> [!QUESTION] **Atlas M0 region:** verify GCP `us-central1` is offered as a free option in MongoDB Atlas signup. If not, pick AWS `us-east-1`. Cross-cloud Atlas → Cloud Run adds ~10-30ms per query; acceptable.

> [!QUESTION] **Cloud Run min-instances:** `0` (free, ~1-3s cold start) vs `1` (~$5-7/mo always-warm). Default: 0.

> [!QUESTION] **Raw `*.run.app` URL routing:** what should `computeDomain` do when the request comes in via the bare Cloud Run URL (no custom domain mapped yet)? Options: (a) refuse, (b) default to TMDB, (c) read DOMAIN from env. Needed for Phase 5 cutover validation via `Host` header override.

> [!QUESTION] **NotionBackup memory ceiling:** start at `memory=2Gi` for the Cloud Run Job. If OOM, bump to 4Gi. Don't rely on the streaming TODO — fix the ceiling now.

---

## Target architecture

```
                  notion-tmdb.micheldev.com … bitwarden-backup.micheldev.com (×6)
                                          │
                                  (Domain Mapping × 6)
                                          │
                              ┌───────────▼───────────┐
                              │  Cloud Run Service    │  CMD: bun backend/index.ts
                              │  us-central1          │  max-instances=3
                              │  Elysia (was Fastify) │  timeout=30m (for /api/sync SSE)
                              └───────┬───────────────┘
                                      │
              ┌───────────────────────┼──────────────────────┐
              │                       │                      │
       ┌──────▼──────┐      ┌─────────▼─────────┐  ┌─────────▼─────────┐
       │ Atlas M0    │      │ GCS bucket        │  │ Cloud Logging     │
       │             │      │ notion-tmdb-      │  │ (auto from stdout)│
       │ singleton   │      │ backup, versioned │  │                   │
       │ MongoClient │      │                   │  │                   │
       └─────────────┘      └─────────▲─────────┘  └───────────────────┘
                                      │
                              ┌───────┴──────────┐
                              │ Cloud Run Job    │  CMD: bun backend/job.ts
                              │ memory=2Gi       │  timeout=30m
                              │ same image       │
                              └───────▲──────────┘
                                      │ (OIDC invoke)
                              ┌───────┴──────────┐
                              │ Cloud Scheduler  │  "0 0 * * 0"
                              │ (Sun midnight)   │
                              └──────────────────┘

LOCAL DEV (WSL):
  bun --watch --inspect backend/index.ts          (host, debuggable via VSCode)
                    │
                    ├──► localhost:27017          (Docker: mongo:7)
                    └──► localhost:4443           (Docker: fsouza/fake-gcs-server)
```

---

## Phase 1 — Tooling + local dev skeleton

Goal: in WSL, `docker compose up` starts mongo + fake-gcs-server; `bun --watch --inspect backend/index.ts` starts the app on host; VSCode attaches to the inspector and hits breakpoints.

### Tooling changes

- [ ] **[backend/package.json](backend/package.json)** — remove deps: `@azure/cosmos`, `@azure/functions`, `@azure/storage-blob`, `@fastify/cookie`, `@fastify/static`, `fastify`, `dotenv`. Add: `elysia`, `@elysiajs/cookie`, `@elysiajs/static`, `@google-cloud/storage`.
- [ ] **[frontend/package.json](frontend/package.json)** — remove `vite`, `@vitejs/plugin-react`. Add nothing (Bun.build is built-in). Scripts: `"build": "bun build src/main.tsx --outdir dist --target browser --splitting --sourcemap"`, `"start": "bun --hot serve.ts"` (need a tiny `frontend/serve.ts`).
- [ ] **Root [package.json](package.json)** — remove `ts-node` devDep. Update `engines` (drop Node, add Bun if desired). Drop the `code:deploy` and `infra:deploy` scripts that reference `az`.
- [ ] **[backend/tsconfig.json](backend/tsconfig.json)** — verify `experimentalDecorators: true` AND `emitDecoratorMetadata: true`. Both required for Inversify under Bun's transpiler. If missing, decorator metadata is silently stripped and DI breaks.

### Files to create

- [ ] **`docker-compose.yml`** (root) — two services:
  - `mongo` — `mongo:7`, volume `mongo-data:/data/db`, ports `27017:27017`
  - `gcs` — `fsouza/fake-gcs-server`, args `-scheme http -public-host localhost:4443`, volume `gcs-data:/storage`, ports `4443:4443`
- [ ] **`backend/.env.example`** — documents required env vars (see env section below).
- [ ] **`backend/.env`** (gitignored) — local-dev values.
- [ ] **`.vscode/launch.json`** — Bun "attach" config for the inspector (port 6499 by default). Use `oven.bun-vscode` extension.
- [ ] **`.vscode/extensions.json`** — recommend `oven.bun-vscode`, `biomejs.biome`.
- [ ] **`.gitignore`** additions: `backend/.env`, `.env.local`, `infra/.terraform/`, `infra/terraform.tfstate*`, `dist/`, `backend/dist/`, `frontend/dist/`.

### Required local env

```sh
# engine selection
DB_ENGINE=MONGO
STORAGE_ENGINE=GCS
LOGGER_ENGINE=CONSOLE

# connection
MONGO_URL=mongodb://localhost:27017
STORAGE_BUCKET=notion-backup
STORAGE_ENDPOINT=http://localhost:4443    # dev only; GcsStorageClient passes as apiEndpoint
GCP_PROJECT_ID=local-dev
PORT=7071

# secrets (13 total — see backend/.env.example for full list)
NOTION_TMDB_CLIENT_ID=…
NOTION_TMDB_CLIENT_SECRET=…
# … plus 9 more OAuth values + TMDB_API_KEY + IGDB_CLIENT_ID/SECRET + GOCARDLESS_ID/SECRET
```

### VSCode launch.json shape

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "bun",
      "request": "attach",
      "name": "Attach to Bun",
      "url": "ws://localhost:6499/"
    },
    {
      "type": "bun",
      "request": "launch",
      "name": "Launch backend",
      "program": "${workspaceFolder}/backend/index.ts",
      "cwd": "${workspaceFolder}",
      "watch": true
    }
  ]
}
```

### Acceptance criteria for Phase 1

- [ ] `docker compose up mongo gcs` → both healthy
- [ ] `bun --watch --inspect backend/index.ts` boots cleanly under Bun
- [ ] `curl http://localhost:7071/` returns 200 (even if SPA isn't rebuilt yet, Elysia static handler should serve something)
- [ ] VSCode "Attach to Bun" config hits a breakpoint set in [backend/src/api.ts](backend/src/api.ts)
- [ ] Adding `127.0.0.1 notion-tmdb.localhost` to `/etc/hosts` and curling `http://notion-tmdb.localhost:7071/api/...` routes through `computeDomain` → `DOMAIN=TMDB`

---

## Phase 2 — Strip Azure adapter + DI fixes

- [ ] **[backend/index.ts](backend/index.ts)** — delete the entire `if (AZURE_FUNCTIONS_ENVIRONMENT) { ... } else { ... }` block (lines 28-153). Replace with a clean Elysia bootstrap that:
  - Loads env via `process.env` (Bun auto-loaded `.env` already)
  - Calls `loadEnvironmentConfig(process.env)`
  - Registers Elysia routes via the refactored Router
  - Listens on `process.env.PORT ?? 7071`
  - Uses Elysia's `trustProxy`-equivalent so `request.url`'s hostname reflects `X-Forwarded-Host` behind Cloud Run
- [ ] **`backend/job.ts`** (new, ~20 LOC) — loads DI, gets `JobOrchestrator` for `BitwardenBackup`, calls `start()`, exits 0. Cloud Run Job entrypoint.
- [ ] **[backend/src/fx/keys.ts](backend/src/fx/keys.ts)** — add `MONGO_URL`, `STORAGE_BUCKET`, `STORAGE_ENDPOINT` (optional), `GCP_PROJECT_ID`. Drop Cosmos-specific keys later (after data migration).
- [ ] **[backend/src/fx/di.ts](backend/src/fx/di.ts)** — bind those new env values in `loadEnvironmentConfig`. Drop the Cosmos bindings.
- [ ] **[backend/src/providers/MongoDb/MongoDbClient.ts](backend/src/providers/MongoDb/MongoDbClient.ts)** — critical fix: line 33 currently calls `MongoClient.connect("mongodb://127.0.0.1:27017/")` *per method invocation*. Hoist `MongoClient` to a **singleton bound in DI**, inject `MONGO_URL` via `@inject(MONGO_URL)`. Without this fix, Atlas M0's 500-connection limit will be hit immediately.
- [ ] **Harden `computeDomain`** ([backend/src/fx/di.ts:296](backend/src/fx/di.ts#L296)) — current regex `/(\w+)-(\w+)/` is loose. Replace with explicit hostname → DOMAIN map so `*.run.app` URLs (used pre-DNS-cutover) don't accidentally route to a real distro. See Open Question above.

---

## Phase 3 — Fastify → Elysia refactor

The Router decorator pattern at [backend/src/fx/router.ts](backend/src/fx/router.ts) is the only place tightly coupled to Fastify types. Route handlers consume the Inversify Container, not Fastify directly — so the handlers themselves don't change shape, but the Router does.

- [ ] **Rewrite [backend/src/fx/router.ts](backend/src/fx/router.ts)** — replace `FastifyInstance` with Elysia's `app`. The `@route({ path, method, authenticate })` decorator signature stays the same.
- [ ] **`scopeContainer` adapter** ([backend/src/fx/di.ts:236](backend/src/fx/di.ts#L236)) — currently takes `FastifyRequest`/`FastifyReply`. Refactor to take Elysia's request context. The bindings for `REQUEST`/`REPLY` get the Elysia equivalents; `getUserId` reads `cookie.userId.value`; `computeDomain` reads `new URL(request.url).hostname` (or via header).
- [ ] **SSE for `/api/sync`** — Elysia supports streaming responses natively. Drop the special-case bypass from the old Azure adapter; just return a `ReadableStream` from the handler. No `fastApp.inject()` workaround needed.
- [ ] **Static file serving** — `@elysiajs/static` for the SPA. Mount at `/` with `frontend/dist` root.
- [ ] **Cookies** — `@elysiajs/cookie` plugin replaces `@fastify/cookie`.
- [ ] **Walk every `@route` handler** in [backend/src/](backend/src/) and confirm the `REQUEST`/`REPLY` interface usage still works after the binding type change. Most handlers only touch the container, not the raw request — should be a small surface.

---

## Phase 4 — GCS provider + GCP logger

- [ ] **`backend/src/providers/Storage/GcsStorageClient.ts`** (~60 LOC) — mirror [StorageProvider.ts](backend/src/providers/Storage/StorageProvider.ts) interface (`putBackup(stream)`, `getBackupLink()`, `getBackupMeta()`):
  - `putBackup` → `bucket.file(\`${userId}.zip\`).createWriteStream()` piped from input
  - `getBackupLink` → `file.getSignedUrl({ version: 'v4', action: 'read', expires: addHours(now, 1) })`
  - `getBackupMeta` → `file.getMetadata()` → `{ lastModified: new Date(metadata.updated) }`
  - Storage class `COLDLINE` (mirrors current `BlockBlobTier.Cold`)
- [ ] Constructor reads `STORAGE_BUCKET`, `GCP_PROJECT_ID`, optional `STORAGE_ENDPOINT` (passed as `apiEndpoint` for fake-gcs-server in dev).
- [ ] DI binding: `@fluentProvide(STORAGE_PROVIDER).when(r => container.get(STORAGE_ENGINE) == "GCS")`.
- [ ] **`backend/src/fx/logger/GcpLogger.ts`** — emit `{severity, message, timestamp, ...labels}` JSON to stdout. Cloud Logging auto-parses ([severity mapping](https://cloud.google.com/logging/docs/structured-logging)). DI bind under `LOGGER_ENGINE == "GCP"`. Local dev keeps `LOGGER_ENGINE=CONSOLE`.

---

## Phase 5 — Frontend: Vite → Bun.build

- [ ] **[frontend/package.json](frontend/package.json)** — drop `vite`, `@vitejs/plugin-react`.
- [ ] **Delete `frontend/vite.config.ts`** (if present).
- [ ] **`frontend/serve.ts`** (new, ~30 LOC) — small Bun.serve dev server that serves `frontend/src/index.html` and hot-bundles `src/main.tsx`. Or proxy to backend during dev and have backend serve.
- [ ] **Build script**: `bun build src/main.tsx --outdir dist --target browser --splitting --sourcemap --define process.env.NODE_ENV='"production"'`.
- [ ] **Check MUI compat** — `@emotion/react` and `@mui/material` work under Bun.build but may need `--external` flags or `compilerOptions.jsxImportSource` aligned. Spot-check.
- [ ] **i18n assets** — current `i18next-http-backend` loads JSON/YAML from `/locales/`. Verify the bundled output preserves the public/static path structure.

---

## Phase 6 — Production Dockerfile

- [ ] **`Dockerfile`** (root) — multi-stage:
  1. `oven/bun:1` builder: `bun install --frozen-lockfile`, `bun run --filter=frontend build`
  2. `oven/bun:1-slim` runner: copy `backend/`, `frontend/dist/`, `node_modules/` (prod only). CMD overridden per Cloud Run resource (Service: `["bun", "backend/index.ts"]`, Job: `["bun", "backend/job.ts"]`).
- [ ] Target image size <300 MB.
- [ ] Add `.dockerignore` (`node_modules`, `*.tsbuildinfo`, `.git`, `.env`, `dist`).

---

## Phase 7 — GCP infrastructure (Terraform)

- [ ] **One-time bootstrap via `gcloud` CLI** (not Terraform):
  - Create GCP project, enable billing
  - Enable APIs: `run`, `cloudscheduler`, `secretmanager`, `artifactregistry`, `cloudbuild`, `storage`
  - Create GCS bucket for Terraform state (versioned)
  - Verify `micheldev.com` apex in Search Console (one-time, subdomains inherit)
  - Connect GitHub repo to Workload Identity Federation for keyless CI auth
- [ ] **`infra/main.tf`** — resources:
  - `google_artifact_registry_repository` — Docker images
  - `google_storage_bucket` — `notion-backup`, versioning on, lifecycle = retain 60 days (mirrors [azure/template.bicep:222-232](azure/template.bicep#L222-L232))
  - `google_service_account` — runtime identity
  - `google_project_iam_member` × N — `storage.objectAdmin` on bucket, `secretmanager.secretAccessor`, `run.invoker` for Scheduler
  - `google_secret_manager_secret` × 13 — one per OAuth/API secret
  - `google_cloud_run_v2_service` — HTTP, `max_instance_count=3`, `timeout=1800s` (for SSE `/api/sync`), env vars + secret refs, `command=["bun"]`, `args=["backend/index.ts"]`
  - `google_cloud_run_v2_job` — backup, `memory=2Gi`, `timeout=1800s`, same image, `command=["bun"]`, `args=["backend/job.ts"]`
  - `google_cloud_scheduler_job` — `0 0 * * 0`, HTTP target on Job's `:run` endpoint with OIDC token
  - `google_cloud_run_domain_mapping` × 6 — one per subdomain (only after Search Console verification)
- [ ] Cloud Run feature flags: `execution_environment = "EXECUTION_ENVIRONMENT_GEN2"`, `cpu_idle = true`.

---

## Phase 8 — Data migration (Cosmos → Atlas)

- [ ] **`support/migrateDb.ts`** — adapt [backend/support/copyDb.ts](backend/support/copyDb.ts) pattern. For each of 6 domains:
  - Read all docs via `@azure/cosmos` `container.items.query("SELECT * FROM c").fetchAll()`
  - Strip Cosmos system fields: `_etag`, `_rid`, `_self`, `_attachments`, `_ts`
  - Write via `db.collection(\`notion-\${domain.toLowerCase()}\`).updateOne({ id }, { $set: doc }, { upsert: true })`
  - Special-case: `bitwarden-backup` collection name per [CosmosClient.ts:35-37](backend/src/providers/Cosmos/CosmosClient.ts#L35-L37)
- [ ] Create index on `id` per collection: `createIndex({ id: 1 }, { unique: true })`. Without it, every `getUser` is a collection scan.
- [ ] Dry-run against throwaway Atlas cluster first; diff counts per collection.
- [ ] During cutover: take Azure Function App offline for the migration window (no users to disrupt).

---

## Phase 9 — Cutover

- [ ] GitHub Actions: build + push first image to Artifact Registry
- [ ] `terraform apply` — provisions everything except DNS
- [ ] Validate via raw `*.run.app` URL with `Host` header override (`curl -H "Host: notion-tmdb.micheldev.com" https://<service>-uc.a.run.app/`)
- [ ] Run `migrateDb.ts` (Cosmos → Atlas) with Azure app paused
- [ ] Add domain mappings — wait 15-60 min for cert provisioning
- [ ] Flip DNS one subdomain at a time, watching Cloud Logging for errors
- [ ] After 48h clean: archive Azure resource group (don't delete — keep as rollback for 2 weeks)
- [ ] After 2 weeks clean: `az group delete`

---

## Phase 10 — Cleanup (separate PR after cutover)

- [ ] Delete [azure/](azure/)
- [ ] Delete [backend/host.json](backend/host.json)
- [ ] Delete [.github/workflows/main_notion-tmdb-fr.yml](.github/workflows/main_notion-tmdb-fr.yml)
- [ ] Delete [backend/src/providers/Cosmos/](backend/src/providers/Cosmos/)
- [ ] Delete [backend/src/providers/Storage/AzureStorageClient.ts](backend/src/providers/Storage/AzureStorageClient.ts)
- [ ] Delete [backend/src/fx/logger/AzureContextLogger.ts](backend/src/fx/logger/AzureContextLogger.ts)
- [ ] Delete [support/build.ts](support/build.ts) — Dockerfile is the build now
- [ ] Drop the local-only `local.settings.json` branch (replaced by Docker Compose `.env`)
- [ ] Update [README.md](README.md) and [CLAUDE.md](CLAUDE.md) with Bun + Elysia + GCP commands

---

## Risks / watch-list

| Risk | Mitigation |
|---|---|
| Bun + `reflect-metadata` decorator metadata silently dropped | Phase 1: verify tsconfig flags, smoke-test DI boot |
| Atlas TLS handshake quirks under Bun | Phase 2: smoke-test connection before Phase 7 |
| `archiver` streams under Bun (Node-streams compat edge cases) | Phase 2: run a full NotionBackup zip e2e |
| Elysia route-handler shape mismatch breaks DI bindings | Phase 3: refactor carefully, test each route after migration |
| `/api/sync` SSE exceeds 5-min Cloud Run default Service timeout | Phase 7: set Service `timeout=1800s` |
| Cert provisioning for domain mappings can take 60+ min | Phase 9: schedule cutover window, validate via Host header first |
| Unexpected traffic burns through free tier silently | Set billing alerts at $1/$5/$10; `max_instance_count=3` per service |
| Atlas M0 paused after 60d inactivity (free-tier rule) | Hobby app: weekly cron keeps it warm |
| MUI's heavy component tree re-mounts on Bun.build HMR | Accept rougher dev loop trade-off; fall back to Vite under Bun if intolerable |
| NotionBackup OOM at 2-10min runtime with in-memory asset buffers | Cloud Run Job `memory=2Gi`; don't rely on streaming TODO |

---

## Critical files

**To modify:**
- [backend/index.ts](backend/index.ts) — drop Azure branch, switch to Elysia
- [backend/src/fx/router.ts](backend/src/fx/router.ts) — Fastify → Elysia
- [backend/src/fx/di.ts](backend/src/fx/di.ts) — new keys, Elysia request shape, harden `computeDomain`
- [backend/src/fx/keys.ts](backend/src/fx/keys.ts) — new keys
- [backend/src/providers/MongoDb/MongoDbClient.ts](backend/src/providers/MongoDb/MongoDbClient.ts) — singleton + URL injection
- [backend/package.json](backend/package.json) — drop Azure/Fastify/dotenv/ts-node; add Elysia/GCS
- [frontend/package.json](frontend/package.json) — drop Vite; use `bun build`
- [package.json](package.json) — drop ts-node, drop az scripts
- [backend/tsconfig.json](backend/tsconfig.json) — verify decorator flags
- [.github/workflows/all_notion-tmdb.yml](.github/workflows/all_notion-tmdb.yml) — swap to `oven/setup-bun`
- [CLAUDE.md](CLAUDE.md) — Bun commands, Elysia, new layout

**To create:**
- `docker-compose.yml`, `Dockerfile`, `.dockerignore` (root)
- `backend/.env.example`
- `backend/job.ts`
- `backend/src/providers/Storage/GcsStorageClient.ts`
- `backend/src/fx/logger/GcpLogger.ts`
- `frontend/serve.ts` (dev server)
- `.vscode/launch.json`, `.vscode/extensions.json`
- `infra/main.tf`, `infra/terraform.tfvars.example`
- `support/migrateDb.ts`
- `.github/workflows/deploy.yml` (replaces the Azure deploy workflow)

**To delete (Phase 10):**
- [azure/](azure/)
- [backend/host.json](backend/host.json)
- [.github/workflows/main_notion-tmdb-fr.yml](.github/workflows/main_notion-tmdb-fr.yml)
- [backend/src/providers/Cosmos/](backend/src/providers/Cosmos/)
- [backend/src/providers/Storage/AzureStorageClient.ts](backend/src/providers/Storage/AzureStorageClient.ts)
- [backend/src/fx/logger/AzureContextLogger.ts](backend/src/fx/logger/AzureContextLogger.ts)
- [support/build.ts](support/build.ts)
- All `@azure/*`, `@fastify/*`, `fastify`, `dotenv`, `ts-node`, `vite`, `@vitejs/plugin-react` deps

---

## Verification plan

### After Phase 1 (tooling + local skeleton)
- `docker compose up mongo gcs` → both healthy
- `bun --watch --inspect backend/index.ts` boots without errors
- VSCode "Attach to Bun" hits a breakpoint
- Subdomain routing via `/etc/hosts` reaches expected `DOMAIN`

### After Phase 2-3 (Azure adapter gone, Elysia in)
- App boots with `bun backend/index.ts` outside Docker
- `bun backend/job.ts` runs `JobOrchestrator.start()` and exits 0 (empty DB → no-op)
- `bunx tsgo --noEmit` passes for backend + frontend
- `bun run check` (Biome) passes
- One full request lifecycle end-to-end through Elysia: cookie set, DI scope, route handler, response

### After Phase 4-5 (GCS + Bun.build frontend)
- Backup flow writes a real zip to fake-gcs-server, retrievable via signed URL
- Frontend bundle builds, loads in browser, MUI renders, i18n loads locales
- HMR works (or is documented as known-limitation)

### After Phase 7 (infra deployed, no DNS yet)
- `curl -H "Host: notion-tmdb.micheldev.com" https://<service>-uc.a.run.app/` returns the SPA
- `gcloud run jobs execute …` → completes, writes backup zip to GCS
- Cloud Logging shows structured JSON entries

### After Phase 9 (cutover)
- All 6 subdomains return 200 with the right SPA
- OAuth callback works on at least one Notion-based distro and on Bitwarden
- One end-to-end Notion sync via `/api/sync` (SSE stays open, progress events stream)
- After Sunday: Cloud Scheduler invocation visible in logs, backup zip in GCS

---

## Resume notes

When picking this up from cold:

1. Confirm you're in WSL (not Windows-side) and the repo is mounted in WSL filesystem (not `/mnt/c/`), for sane file watching.
2. Check the locked-decisions table at the top — if anything reads as wrong now, surface it before executing.
3. Start at the first unchecked task in Phase 1. Do not batch-execute multiple phases without showing progress and letting the user redirect.
4. Use TodoWrite to mirror the phase checklist as you go.
5. When in doubt about an Open Question, ask before assuming.
