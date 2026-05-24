# CLAUDE.md

Guidance for Claude Code when working in this repo. See `README.md` for the
human-facing overview.

## Before declaring any task done

CI runs three checks on every push (see
`.github/workflows/all_notion-tmdb.yml`). Run all three locally before
claiming a change is complete — TypeScript can compile cleanly while Biome
still fails (and vice versa):

```sh
npm run check                          # Biome lint + format
npx --workspace frontend tsgo --noEmit # frontend typecheck
npx --workspace backend  tsgo --noEmit # backend typecheck
```

If Biome flags something, `npm run fix` applies safe fixes and formatting.
Anything left after `fix` is a real lint error and must be resolved in code,
not by disabling the rule — Biome uses `recommended: true` with only a small
allow-list of overrides in `biome.json`.

Common gotchas the recommended ruleset enforces:

- `noAssignInExpressions` — no `while ((x = next()) !== null)`; assign first,
  then test.
- `noExplicitAny` is **off**, but most other `suspicious/*` rules are on.

## Layout

Monorepo using npm workspaces:

- `backend/` — Azure Functions app (Fastify, Inversify DI, Notion + TMDB +
  IGDB + GBook + GoCardless + Bitwarden clients, Mongo/Cosmos).
- `frontend/` — React 19 + MUI, built with Vite.
- `azure/` — Bicep infra templates.
- `support/` — `build.ts` assembles `dist/` for deploy.

## Toolchain notes

- TypeScript is compiled with **`tsgo`** (the native-preview compiler from
  `@typescript/native-preview`), not `tsc`. Use `tsgo --noEmit` for type
  checks; the syntax matches `tsc` flags.
- Node 24 (`actions/setup-node@v4` with `node-version: 24`). Don't introduce
  syntax that requires a newer runtime.
- ESM everywhere (`"type": "module"` at the root).

## Don't

- Don't add `tsc` invocations — the project uses `tsgo`.
- Don't loosen Biome rules to make a change pass; fix the code.
- Don't commit without running the three CI commands above.
