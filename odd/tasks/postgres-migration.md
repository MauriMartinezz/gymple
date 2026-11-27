# Feature: Migrate the database from MySQL to PostgreSQL

Objective: run Gymple on PostgreSQL so it deploys on Vercel with Neon (Vercel Marketplace) as the database; local development and integration tests use a Postgres container. Branch: `feat/postgres-migration` (based on `feat/roles-and-guest`). Delivery: `single-pr` (user's choice: the migration is atomic, intermediate states do not compile). Test runner: Vitest (`pnpm test`, `pnpm test:integration` against `gymple_test`).

## Specs

- **S1** — User's words: "Me gustaría que migres a postgres así puedo subirlo todo en vercel y listo"
  - Every database access (schema, migrations, client, repositories, better-auth, scripts, integration tests, docker-compose) uses PostgreSQL; `mysql2` is removed.
  - Assumption: the driver is node-postgres (`pg`), which supports interactive transactions and works against Neon's pooled connection string and a local container alike.
- **S2** — Existing behaviour is preserved (no requirement change):
  - Exercise names stay unique per user ignoring case and accents; lists stay sorted by name ignoring case; guest import keeps matching exercises by name the same way; email lookups and uniqueness ignore case.
  - Assumption: implemented with an ICU nondeterministic collation (`und-u-ks-level1`), which matches the previous `utf8mb4_0900_ai_ci` behaviour and the in-memory fakes (`sensitivity: "base"`).
  - Invite codes keep comparing byte for byte (case-sensitive).
- **S3** — Local development: `pnpm db:up` starts Postgres (and Mailpit); `pnpm db:migrate`, `pnpm db:seed`, `pnpm admin:grant`, `pnpm test:integration` work against it. Migrations are regenerated from scratch for Postgres (no production data exists yet).
- **S4** — Docs (README, `.env.example`) describe the Postgres setup.

## Tasks

- [x] **T1** (S1, S3) — Dev/test infra: docker-compose Postgres 17 on 5433, test database init, `pg` + `@vercel/functions`, drizzle config, vitest default URL, `db:test:create`. Route: inline. Evidence: container healthy, `gymple_test` created. Commit: `feat(db): migrate from MySQL to PostgreSQL`.
- [x] **T2** (S1, S2) — Schema to pg-core (`serial`, `pgEnum`, timestamptz, `$onUpdate`), `case_insensitive` collation (custom migration 0000) on users.email, exercises.name, routines.name; migration 0001 regenerated; client on `pg` Pool with `attachDatabasePool`. Route: inline. Commit: `feat(db): migrate from MySQL to PostgreSQL`.
- [x] **T3** (S1, S2) — Repositories, adapters and better-auth (`provider: "pg"`): `.returning`, `onConflictDoUpdate`/`onConflictDoNothing`, `rowCount`, shared `uniqueViolationConstraint` (23505 + constraint name). Route: inline. Commit: `feat(db): migrate from MySQL to PostgreSQL`.
- [x] **T4** (S1, S3) — 11 integration test files, seed, guest import guard (`pg` forbidden); new contract case "ignoring accents". Route: inline. Evidence: `pnpm test` 69 files / 959 passed; `pnpm test:integration` 11 files / 139 passed; exercise contract with accent case green on in-memory, browser and Postgres; db:migrate, db:seed (idempotent), admin:grant (uppercase email) OK; `pnpm build` OK; sign-in smoke with uppercase email 200, session row stored. Commit: `feat(db): migrate from MySQL to PostgreSQL`.
- [x] **T6** (S1) — Pool `error` listener so an idle connection ended by the server (Neon autosuspend) does not crash the process; unit test pins it. Route: inline. Evidence: RED (emit throws) → GREEN; `pnpm test` 960 passed. Commits: `fix(db): keep idle connection errors from crashing the process`, `test(db): pin that idle connection errors do not crash the process`.
- [~] **T5** (S4) — README "Database" section done. `.env.example` pending: the agent is denied access to `.env*` files; the user updates it (and `.env`).

Route evidence: one dependent chain (schema → adapters → tests); no parallel units, no writer reason.

## Log

- **L1** (2026-11-27) — User: "Me gustaría que migres a postgres así puedo subirlo todo en vercel y listo"
- **L2** — Context: deploy target is Vercel. Vercel Postgres was retired; Postgres on Vercel is Neon through the Marketplace (billing in Vercel). Neon's native integration does not create per-preview database branches automatically.
- **L3** — Mapping: ~40 files coupled to MySQL ($returningId, onDuplicateKeyUpdate, affectedRows, ER_DUP_ENTRY parsing, onUpdateNow, mysqlEnum, varbinary, collation-dependent rules pinned by the exercise and trainer repository contracts). No LIKE queries, so a nondeterministic collation is safe.
- **L4** — Test-first exception: a port with no behaviour change; the existing contract and integration suites are the regression net (RED was the type-check and suites failing on the MySQL adapters). One new contract case pins accent-insensitivity (S2).
- **L5** — Authored ~700 changed lines (excluding generated migrations and lockfile), over the 400 heuristic; delivery strategy question pending. Risk: item 5 (dependencies and environment: database driver, container) → independent verifier.
- **L6** — User chose "Un solo PR". Independent verifier: S2–S4 PASS; S1 blocker `pnpm-lock.yaml` still resolved `mysql2` (optional peer of drizzle-orm and better-auth) → fixed by removing it and its 9 unreachable dependencies from the lockfile; clean `rm -rf node_modules && pnpm install --frozen-lockfile` installs no mysql2. Advisories applied: `db:test:create` idempotent again (`\gexec`), redundant `updatedAt` dropped from the invite-code upsert (Drizzle adds `$onUpdate` columns itself). Recheck: tsc, lint OK; `pnpm test` 959 passed; `pnpm test:integration` 139 passed.
- **L7** — Native review: the whole range exceeded the reviewer context budget (`lens_context_budget_exceeded`, 8164 lines). User chose to split; commits now `chore(db): regenerate migrations and lockfile` (generated) + `feat(db): migrate from MySQL to PostgreSQL` (683 lines). Review of the code commit (lineage review-22d241f6d7e171ea, lenses risk/resilience/reliability, consent granted): R4 pool without `error` listener (real) → fixed (T6); R3 "candidate ships no Postgres migrations" is an artefact of the split (the migrations are in the review base `chore(db)` commit). Targeted validator: R4 resolved, no regression, R3 open → `escalated`, terminal. The generated commit was assessed high (`process_boundary`) and not reviewed (7489 lines, over the budget). Delivery follows ordinary repository policy.
