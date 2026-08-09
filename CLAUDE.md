# CLAUDE.md

Guidance for Claude Code when working in this repo. See `README.md` for the
human-facing overview.

## Before declaring any task done

CI runs these on every push (see `.github/workflows/all_notion-tmdb.yml`).
Run them all locally before claiming a change is complete — TypeScript can
compile cleanly while Biome still fails (and vice versa):

```sh
bun run check                      # Biome lint + format
bun run typecheck                  # both workspaces via tsgo --noEmit
bun test                           # unit tests (bun's built-in runner)
```

A second CI job runs `terraform fmt -check` and `terraform validate` against
`infra/`, so run those too if you touch Terraform.

If Biome flags something, `bun run fix` applies safe fixes and formatting. Anything left after that is a real lint error and must be
resolved in code, not by disabling the rule — Biome uses `recommended: true`
with only a small allow-list of overrides in `biome.json`.

Common gotchas the recommended ruleset enforces:

- `noAssignInExpressions` — no `while ((x = next()) !== null)`; assign first,
  then test.
- `noExplicitAny` is **off**, but most other `suspicious/*` rules are on.
- `noRestrictedImports` bans importing `axios-logger` anywhere under
  `backend/src/` except `fx/logger/`. See "Provider HTTP clients" below.

## Provider HTTP clients

Build every provider's axios instance with `createProviderClient()` from
`backend/src/providers/httpClient.ts`. It routes logging through
`Logger.bindAxios`, which pins `data`/`headers`/`params` to false.

Calling `axios.create()` and attaching `axios-logger`'s
`requestLogger`/`responseLogger` by hand inherits the upstream default of
`data: true`, which serializes whole request and response bodies. That is
how provider `client_secret`s, the bearer tokens they return, and full
bank-transaction payloads once reached Cloud Logging at INFO. The Biome
rule above exists to stop it recurring.

## Connectors (domains)

`backend/src/domains.ts` is the single source of truth for which connectors
exist. `DOMAIN` is derived from its keys, and the hostname/state/search
lookups plus the frontend's dropdowns are all computed from its fields.

To add a connector: add one entry there, then wire its config type in
`types.ts` (`DomainConfigMap`), its client in `fx/di.ts` (`DATA_PROVIDERS`,
`NOTION_OAUTH_KEYS`), and its accent + logo in `frontend/src/theme.ts`
(`CONNECTOR_STYLES`). Those are all `Record<DOMAIN, …>`, so a half-finished
connector is a compile error rather than a runtime surprise. A *searchable*
connector also needs an entry in `fields.ts` (`DOMAIN_FIELDS`, keyed by
`SEARCH_DOMAIN`).

## Fields and column mapping

`backend/src/fields.ts` is the single source of truth for what each connector
writes into Notion. Three things derive from it, which is why it is not just a
list inside the form:

- `DbConfigForm` renders one mapping row per field;
- `POST /api/database` builds a correctly-shaped database from `createAs`;
- `mapping.ts` scores a user's existing Notion properties against `label` +
  `aliases` to preselect a mapping.

Three rules that are load-bearing rather than stylistic:

- **The sync-marker field is `Sync date`, for every connector.** Not "Status":
  it is a Notion *date*, and a database's *status* property is the one type it
  cannot accept, so that name sent everyone to the one greyed-out option and
  they stopped. Not a per-connector reading like "Date watched" either — the
  value written is `new Date()` at sync time, so it records when the plugin last
  refreshed the row, not when the user watched the film. `aliases` still carry
  the older wordings so existing columns keep auto-matching; change the label
  freely, but never drop an alias.
- **`guessMapping` must stay conservative.** A wrong guess on a required field
  is silent and permanent — every later sync writes to the wrong column. The
  `unambiguousScore` floor deliberately only applies when exactly one property
  *and* one field share a type; `mapping.test.ts` pins the regression where a
  lone date column called "Release date" was claimed as the sync marker.
- **Two fields of the same `columnType` on one connector need disjoint
  `aliases`.** Type is a hard filter, so same-type siblings are the only fields
  that can ever be handed each other's column — Cast vs Director, Runtime vs
  Rating, Publisher vs Author, Critic rating vs Rating. The narrower one has to
  qualify every alias ("critic score", never a bare "score"), because greedy
  assignment gives the column to whichever field scores higher and the loser
  then takes whatever is left. `mapping.test.ts` pins each of those pairs.

## Sync

`listDatabaseEntries` selects the rows a run touches: linked, and either never
synced or synced before a cutoff.

- The default (no `?days=`) is **rows with an empty sync date only** — the cheap
  path that makes adding an entry fast. `GET /api/sync?days=N` widens it to
  "also anything synced more than N days ago", and `days=0` means every row.
- **The cutoff is computed server-side** (`utils/syncWindow.ts`), from an age
  rather than an instant sent by the browser, so a skewed client clock cannot
  pick a different window than the user chose. A value that is not a plain
  number or numeric string is ignored — `Number([])` is `0`, so a repeated
  `?days=` query param would otherwise read as the widest possible sweep.
- **The query is paginated.** It used to make one unpaginated call and silently
  stop at Notion's 100-row page. That was survivable when only new rows ever
  matched; with a re-sync cutoff a run can legitimately match every row.

Every connector drives its run through `runSync()` (`utils/syncRun.ts`) rather
than looping itself. Two rules live there:

- **A failing row is skipped, not fatal.** Each connector used to `await` its
  provider call straight inside the loop, so the first row that threw ended the
  generator. Since a row is only marked synced once it succeeds, a permanently
  bad one stayed in the default "never synced" selection and killed every
  subsequent run too — the connector was bricked until the user found the row by
  hand. A run where *nothing* succeeded still throws, so an expired token or a
  provider outage surfaces as an error instead of "0 synced, 25 skipped".
- **Skips name the row.** "Skipped: status code 404" gives a user with 25 films
  nothing to act on, hence the `label` argument.

Pull a provider id out of a stored link with `utils/providerId.ts`, never with a
regex over the raw string. `idAfterSegment`/`idFromQuery` parse the value as a
URL, because the greedy `(.*)$` they replaced folded a pasted link's query
string into the id: `/movie/550?language=en-US` went out with axios appending
its own `language` after the one already there, and TMDB answered 400.

## Colour

Connector accents live in `frontend/src/theme.ts`, as explicit hex per theme
mode. Don't go back to MUI hue names (`colors.lightBlue` etc.): three of them
resolved to near-identical blues, and MUI's `getContrastText` picks button
labels against a 3:1 threshold — the bar for UI components, not the 4.5:1 one
for text. Every value in `CONNECTOR_STYLES` clears 4.5:1 against its own
ground; check any new one before adding it.

## Layout

Monorepo using npm workspaces (installed by Bun):

- `backend/` — Elysia HTTP app + Cloud Run Job entrypoint. tsyringe DI,
  Notion + TMDB + IGDB + GBook + BilletReduc + Bitwarden clients,
  MongoDB Atlas.
- `frontend/` — React 19 + MUI, bundled with Bun's built-in bundler.
- `infra/` — Terraform (Cloud Run, Cloud Scheduler, Artifact Registry,
  Secret Manager, GCS backup bucket, MongoDB Atlas M0, WIF for CI, budget
  alerts).
- `support/` — one-off operational scripts.

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
- Don't hand-roll a provider axios client or a per-connector `switch` — use
  `createProviderClient` and the `DOMAINS` registry.
- Don't restate a connector's field list anywhere but `fields.ts`.
- Don't add a webfont to `frontend/index.html` — the app is pinned to the
  system stack in `theme.ts`, and the old Google Fonts link blocked first
  paint on a third-party request.
- Don't report embed progress through the `Snackbar`. A Notion embed is often
  no taller than the toast, so it covered the widget it was reporting on;
  the widget has an inline status row for this (see `ConnectorWidget`).
