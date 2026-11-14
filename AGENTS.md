<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": true` in the root `turbo.json` or `turbo.jsonc` to opt in; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->

# Project notes for agents and teammates

Read these before planning or changing code. They are the source of truth for scope and ownership:

- `implementation-handoff.md`: product scope, the two views, ownership, the two-minute demo cap.
- `model-pipeline-implementation-plan.md`: Luka's pipeline, the shared contracts, `PipelineStore`.
- `learning-progress-plan.md`: storage (Postgres + Drizzle), the parent dashboard, and section 9's dashboard foundation.

Don't build anything those docs mark as future work or as owned by another teammate (for example the pre/post learning checks).

## Environment

- **Node 24 or newer and npm exactly 11.19.0** are required. `package.json` enforces both, and older npm fails with `EBADDEVENGINES`.
- Easiest setup, with no `sudo`: install nvm, then run `nvm install` in the repo root (it reads `.nvmrc`), then `npm install -g npm@11.19.0`.
- Install from the repo root with `npm install`. Add a package to one app with `npm install -w web <pkg>`.
- Run the web app with `npm run dev -- --filter=web` (http://localhost:3000).
- Before pushing, run `npm run build`, `npm run lint` and `npm run check-types` from the root. All of them should pass.

## Current state

- `apps/web` is the real app (Next.js 16, App Router). `apps/docs` is untouched starter code.
- **Tailwind CSS v4 is set up in `apps/web`** through `postcss.config.mjs` and `@import "tailwindcss"` in `app/globals.css`. Design tokens go in the `@theme` block in `globals.css`. Don't add a `tailwind.config.js`, because v4 doesn't use one. `@source` also scans `packages/ui/src`.
- Only `web` uses Tailwind.
- **Parent dashboard skeleton exists** under `apps/web/app/parent/`, with logic in `apps/web/lib/parent/`. It reads through `getProgressReader()`. With `PIPELINE_STORE` unset it shows the sample fixture. `lib/parent/subscribe.ts` is a timer stub until the realtime service exists.
- **Storage is implemented** in `apps/web/server/storage/`:
  - `contract.ts`: `PipelineStore`, the record types and errors. This is the interface Luka's pipeline calls.
  - `schema.ts`: Drizzle tables. Migrations live in `apps/web/drizzle/`. After any schema change, run `npm run db:generate -w web` and commit the SQL.
  - `postgres.ts`: the adapter (`commitTurn` is one transaction: duplicate check, expected-turn update, insert). It works with any Drizzle Postgres driver.
  - `index.ts`: `getPipelineStore()` chooses the adapter from `PIPELINE_STORE`. Luka's memory adapter goes here.
  - Tests: `npm test -w web`. They run the real migrations against in-process Postgres (PGlite), so you need no database to run them.
- Environment variables are listed in `apps/web/.env.example`. Copy it to `apps/web/.env.local`.
- **The database is Tiger Cloud (managed Postgres).** Get `DATABASE_URL` privately from the dashboard owner. It never goes in git, docs or chat. `npm run db:migrate -w web` reads `.env.local`.

## Working rules

- Work on a feature branch (for example `parent-dashboard`), not directly on `main`. Pull `main` before starting.
- When `git pull` asks how to reconcile divergent branches, merge: `git pull --no-rebase`.
- Never commit secrets. `DATABASE_URL` and API keys stay in untracked `.env.local` files and are read only on the server.
- Never store raw audio. Children's data stays pseudonymous; see the privacy section of `learning-progress-plan.md`.
