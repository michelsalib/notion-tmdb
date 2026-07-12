# CLAUDE.md

Guidance for Claude Code when working in this repo. See `README.md` for the
human-facing overview.

## Before declaring any task done

CI runs three checks on every push (see
`.github/workflows/all_notion-tmdb.yml`). Run all three locally before
claiming a change is complete — TypeScript can compile cleanly while Biome
still fails (and vice versa):

```sh
bun run check                      # Biome lint + format
bun run typecheck                  # both workspaces via tsgo --noEmit
```

If Biome flags something, `bun run fix` applies safe fixes and formatting. Anything left after that is a real lint error and must be
resolved in code, not by disabling the rule — Biome uses `recommended: true`
with only a small allow-list of overrides in `biome.json`.

Common gotchas the recommended ruleset enforces:

- `noAssignInExpressions` — no `while ((x = next()) !== null)`; assign first,
  then test.
- `noExplicitAny` is **off**, but most other `suspicious/*` rules are on.

## Layout

Monorepo using npm workspaces (installed by Bun):

- `backend/` — Elysia HTTP app + Cloud Run Job entrypoint. tsyringe DI,
  Notion + TMDB + IGDB + GBook + BilletReduc + GoCardless + Bitwarden clients,
  MongoDB Atlas.
- `frontend/` — React 19 + MUI, bundled with Bun's built-in bundler.
- `infra/` — Terraform (Cloud Run, Cloud Scheduler, Artifact Registry,
  Secret Manager, GCS backup bucket, MongoDB Atlas M0, WIF for CI, budget
  alerts).
- `support/` — one-off scripts (currently `migrateDb.ts`, the Cosmos→Atlas
  migration; kept for reference).

## Toolchain notes

- **Runtime**: Bun 1.3 in prod (Cloud Run) and locally (`bun run dev`).
  Don't introduce Node-only APIs or CommonJS syntax.
- **TypeScript**: compiled with **`tsgo`** (the native-preview compiler from
  `@typescript/native-preview`), not `tsc`. Use `tsgo --noEmit` for type
  checks; the flag syntax matches `tsc`.
- **Bun decorators quirk**: Bun's `experimentalDecorators` is broken for
  property + parameter decorators (why we're on tsyringe, not Inversify).
- ESM everywhere (`"type": "module"` at the root).

## Infra & deploys

- Prod is GCP project `micheldev-notion-tmdb` in `us-central1`.
- Deploys are automatic on push to `main` via
  `.github/workflows/deploy.yml` — WIF → GCP, Docker build/push to Artifact
  Registry, then `terraform apply`.
- Terraform state lives in `gs://micheldev-notion-tmdb-tf-state`.
- Secrets are in Secret Manager; the runtime SA has `secretAccessor`.
- The MongoDB Atlas M0 cluster is provisioned via the `mongodbatlas`
  Terraform provider. Credentials for the DB user are randomly generated
  and baked into `MONGO_URL` in Secret Manager (see `infra/atlas.tf`).
- **Domain mappings & ownership:** the `google_cloud_run_domain_mapping`
  resources (`local.subdomains` in `infra/main.tf`) can only be *created* by an
  identity that is a verified owner of `micheldev.com` in Google Search
  Console. The CI service account (`notion-tmdb-ci@…`) is **not** an owner by
  default, so a CI deploy that adds a **new** subdomain fails with
  `PermissionDenied` ("Caller is not authorized to administer the domain …").
  Existing mappings apply fine (they already exist). Fix: add the CI SA as an
  Owner of the domain in Search Console → Users and permissions. Interim
  unblock: `gcloud beta run domain-mappings create …` from a local login that
  *is* an owner (Terraform matches by `location/name`, so no drift). This is
  **not** a transient flake — it reproduces for every new CI-created subdomain.

## Don't

- Don't add `tsc` invocations — the project uses `tsgo`.
- Don't loosen Biome rules to make a change pass; fix the code.
- Don't commit without running the three CI commands above.
- Don't introduce Fastify/Inversify/Cosmos code — those were removed.
