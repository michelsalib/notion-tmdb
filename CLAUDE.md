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

## Backup

The two backup connectors (`backup`, `BitwardenBackup`) write a zip per run to
`StorageProvider`, keyed `<userId>/<ISO stamp>.zip`. Four rules are load-bearing:

- **Start the upload before filling the archive.** `putBackup(archive, date)`
  takes the `Archiver` as a stream and pipes it to storage; `finalize()` is
  awaited *after*. Awaiting `finalize()` with nothing consuming the stream
  buffers the entire zip in archiver's memory, which is the only reason the
  Cloud Run Job asks for 2Gi.
- **`NotionBackup.sync()` is one pass, not two.** Notion serves assets as
  pre-signed S3 URLs that expire about an hour after they are issued, so
  collecting every item first and downloading afterwards meant that on any
  workspace taking an hour to walk, every URL was dead before the second pass
  reached it. Download an item's files as the item arrives.
- **One archive per run, and prune afterwards.** `pruneBackups(KEEP)` runs only
  once the new zip is stored, so a failed run never costs the user the backup it
  was replacing. Backups used to overwrite a single `<userId>.zip`, leaving the
  bucket's object versions as the only history and no way to reach it. The GCS
  client still lists that legacy flat key so a user who has not run a backup
  since keeps seeing their last one.
- **A `?key=` from the browser is matched against the user's own listing**, never
  concatenated onto their prefix — otherwise `../<other user>.zip` gets handed a
  signed URL for someone else's workspace.

Archive layout is `data.json` + `manifest.json` + `assets/<kind>_<id><ext>` +
`markdown/`, described by `utils/backupArchive.ts`. Reading an archive means
honouring `data_data.json` too — that is what `data.json` was called before the
manifest existed, and archives in the bucket still use it. `manifest.version`
says which layout an archive uses.

`utils/backupMarkdown.ts` renders the readable copy: one file per page, in
folders mirroring the page tree (`Title <id>.md` beside `Title <id>/`), which is
Notion's own export convention. It is rendered *after* the walk, not during it,
because a page's links to its sub-pages need their filenames, and those are only
settled once every page has one. `data.json` remains the source of truth — the
Markdown is lossy on purpose, and blank-line runs in it get collapsed.

Two things there are easy to break: blank lines around a `<details>` body (a
toggle) are what stop a renderer treating it as raw HTML, and a property list
has to be a *list* — consecutive plain lines are one paragraph in Markdown, so
the values ran into a single sentence.

`listContent` recurses into nested blocks but stops at `child_page` and
`child_database`, which are their own `search` results; descending into them
archives every nested page once per ancestor. It reports an unreadable subtree
through `onSkip` and carries on, and `NotionBackup` fails the run only when
*nothing* succeeded — same rule as `runSync`, so an expired token is still an
error rather than an empty zip.

## Restore

`utils/notionRestore.ts` is the walk that rebuilds a workspace from an archive,
driven by `NotionBackup.restore()` behind `GET /api/restore` — the widget's
Restore button, on one of the user's stored archives. Everything about *what* a
restore does belongs in the walk and nothing belongs in the caller; the
`RestoreTarget` seam is what keeps it testable without writing to a workspace.

There used to be a second caller, `support/restoreNotionBackup.ts`, for a zip on
disk with a `--dry-run`. It was deleted once the widget covered the job — it is in
git history if a loose archive ever needs reading again, and the walk it drove is
unchanged.

- **A restore creates one new page and builds inside it.** It never writes over
  the originals, so a run can be read and thrown away. That page is also the
  report: `restoreIntroBlocks` explains what it is *before* the walk starts (so
  it survives a run that dies half way) and `restoreSummaryBlocks` appends what
  happened afterwards. A report printed to a terminal is no use to someone who
  clicked a button in Notion — every skip and dropped column has to end up on
  that page.
- **Nobody is asked where it goes.** `createRoot` is a separate `RestoreTarget`
  method precisely so the walk does not decide: the app sends
  `parent: { type: "workspace", workspace: true }` and the page lands in the
  user's Private section, ready to be dragged. There *was* a page picker, and in
  a real workspace it is a scroll of forty unrelated titles — a filing decision
  about a copy the user has not read yet, standing between them and the button.
  Notion allows a workspace parent for public connections and personal access
  tokens, but not for an internal integration, and the SDK still pins
  `Notion-Version: 2022-06-28` — so `createRestoreRoot` treats a **400** (and only
  a 400) as "this parent is not allowed" and falls back to the topmost page the
  integration can see. A 401 or a 429 is rethrown: the second attempt would fail
  too, with a worse message.
- **One bad item is skipped, not fatal**, and a run where *nothing* was created
  throws — the same rule as `runSync` and `NotionBackup.sync()`. The summary is
  appended before that throw, so the page still explains itself.
- `strip()` runs over whole nested payloads, so `url` must stay out of its field
  list: it is a bookmark's target, an embed's source, an external image and a url
  column's value, and only *looks* like server-owned metadata because pages have
  one too. A page's own title goes back as `{ title: { title: [...] } }` — the
  bare `{ title: [...] }` shorthand is neither documented nor in the SDK's types.
- **Reading an archive means two entries, not the whole zip.** `utils/zipReader.ts`
  finds `data.json` and `manifest.json` through the central directory and pulls
  just those with ranged reads (`StorageProvider.openBackup`). A restore has no
  use for `assets/`, which is nearly all of the file, and backups are stored
  COLDLINE where every retrieved byte is billed. It reads the *central*
  directory, never local headers: archiver streams entries, so their local
  headers state a size of zero.
- `listPages` (the *database* parent picker, `GET /api/pages`) has to stay
  **paginated**. Notion cannot filter database rows out of a search, so they are
  dropped client-side — and search returns the most recently edited things first,
  which in a workspace these connectors run on means the rows they keep
  rewriting. One unpaginated call filtered all 100 results away and told users
  with plenty of shared pages to go and share one. For the same reason
  `useSharedPages` reports a *failed* request separately: swallowing it as "no
  pages" is what made that look like the user's fault.
- Restore is Notion-only (`domain === "backup"`). A Bitwarden archive stays
  encrypted with the user's master password and has no workspace to return to,
  which is why `restore()` lives on `NotionBackup` rather than on
  `BackupDataProvider`.

## Head tags and indexing

All six connectors are one Cloud Run service serving one built `index.html`, so
without help every host returns the same bytes. `backend/src/pageMeta.ts` stamps
the head per request and `backend/index.ts` serves the shell itself for that
reason (`staticPlugin` gets `indexHTML: false` plus an `ignorePatterns` for
`index.html`, so it hands out assets and nothing else).

- **The `<title>` stamped server-side must match what Helmet sets on mount**
  (`${pre} ⇄ ${label}`, `App.tsx`), or the tab changes under the user a moment
  after first paint. Helmet was the *only* thing setting a title: the built
  document has none at all, which left every crawler and link unfurler that
  does not run JS with a titleless page, and six identical ones at that.
- **The copy comes from the locale files, not from a table here.**
  `PITCH_TITLE`/`PITCH_BODY` in `frontend/static/locales/en/<domain>.yaml` are
  what the landing page renders, and the unfurl card describing that page must
  not be able to disagree with it. Read the built copy under `frontend/dist`
  first — that is the only one the image ships — and fall back to
  `frontend/static`, because CI runs `bun test` without a frontend build.
- **The generic description has to be removed, not merely added to.** Two
  `name="description"` tags in one head means the old all-connectors sentence is
  still a snippet candidate, and nothing about that is visible in a browser.
  `pageMeta.test.ts` stamps the real `frontend/index.html` and asserts exactly
  one survives, so reformatting that head cannot quietly break the regex.
- **Only a connector's own bare landing page is indexable.** A query string
  means an embed (`?userId=`, `?multi`) or an OAuth hand-back, and an unmapped
  host is the public `*.run.app` URL — all of them serve the same document, so
  they get `noindex` and every response carries a canonical. `isConnectorHost`
  is separate from `computeDomain` for this: falling back to TMDB is right for
  *serving* an unrecognised host and wrong for deciding what may be indexed.

There is no `og:image`: the connector logos are SVG, which unfurlers generally
do not render. Adding one means adding a PNG per connector.

No sitemap, deliberately. Each host is one page and `micheldev.com` already
links all six, so there is nothing to discover; robots.txt and sitemaps are
per-host anyway, so the apex's cannot apply to a subdomain. Note that Cloudflare
serves its own managed `robots.txt` on those subdomains — if directives are ever
needed there, check how it merges an origin file rather than assuming one wins.

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
- **A local `terraform apply` can roll prod back.** `infra/terraform.tfvars` is
  gitignored *and* outranks `TF_VAR_*` in Terraform's variable precedence, so
  the `image` someone last hand-wrote in it beats anything you export — the
  deciding line is one that reviewers cannot see, because it is not in the
  repo. CI is unaffected: it has no tfvars, so its
  `TF_VAR_image: …:${github.sha}` wins there. From a dev machine, though, a
  bare apply redeploys the Service *and* the backup Job at whatever stale
  build that file names. The plan does show it — as one `~ image` line buried
  in a long Cloud Run diff whose `env` blocks are all redacted as sensitive,
  so it survives a skim. Apply a plan you have already read, or pass
  `-var="image=…"` — a command-line `-var` is the only thing that outranks
  the file.

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
- Don't restate a connector's pitch in the backend to build a meta tag — read
  the locale file, see "Head tags and indexing".
- Don't report embed progress through the `Snackbar`. A Notion embed is often
  no taller than the toast, so it covered the widget it was reporting on;
  the widget has an inline status row for this (see `ConnectorWidget`).
- Don't `await archive.finalize()` before something is consuming the archive —
  see "Backup". Don't buffer an asset with `responseType: "arraybuffer"` either.
