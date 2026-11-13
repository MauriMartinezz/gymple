# Feature: Routines

Objective: let users group exercises into reusable routines with target sets, reps and rest. Branch: `feat/database-setup`. Delivery: work-unit commits on the branch (push/PR are the user's call). Test runner: Vitest (`pnpm test`, `pnpm test:integration` against `gymple_test`).

## Specs

- **S1** — User's words (original idea): "Se podrán agrupar ejercicios en Rutinas (Un conjunto de ejercicios que se pueda reutilizar), podrás setear tiempo de descanso, cantidad de series, incluso tu sensación de esfuerzo."
  - A routine has a name (required, trimmed, whitespace collapsed, max 120), an optional description (max 1000, empty → null, CRLF counted as one char), and an ordered list of items.
  - Each item: an exercise, target sets (integer 1–20), target reps range min–max (integers 1–100, min ≤ max), rest seconds (integer 0–600), optional notes (max 500).
  - Assumption: "sensación de esfuerzo" (RPE) is logged per performed set in workout sessions, not stored on routines.
- **S2** — User's words: "Una rutina es una suerte de guía ideal \"tallada a piedra\" (aunque en realidad no está mal poder modificarla, aunque los ejercicios que reemplaces ya perderán su historial)."
  - Routines can be edited: name, description and the whole item list (add, remove, reorder, change targets). Saving replaces the item list atomically.
  - Editing a routine never touches exercise history (history hangs off exercises, not routines).
- **S3** — Ownership (security): every read and write is scoped to the session user. Another user's routine behaves exactly like a missing one. A routine may only reference exercises owned by the same user; a foreign or missing exercise id is a validation error on that item, and nothing is saved.
- **S4** — Archive instead of delete (assumption, consistent with exercises): archived routines are hidden from the main list, shown in a collapsed "Archived" section, and can be restored. Archiving twice keeps the first date.
- **S5** — A routine needs at least one exercise ("Add at least one exercise."). The same exercise may appear more than once.
- **S6** — Exercise picker shows the user's active exercises; an archived exercise already in the routine stays listed (marked archived) and can be kept. If the user has no exercises, the new-routine page links to `/exercises/new`.
- **S7** — UI: `/routines` list (name, exercise count, edit, archive; empty state), `/routines/new`, `/routines/[id]/edit`, header nav link "Routines". Design tokens and `shared/ui/styles.ts` only; English UI copy; accessible labels and field errors.
- **S8** — Same quality bar as exercises: domain validation tests, use-case tests on an in-memory repository, a shared repository contract suite run on in-memory and MySQL (user isolation included), server action tests pinning the session as the only source of the user, and every page/action calling `requireUser()`.

## Tasks

| ID | Specs | Route | Status | Evidence |
|----|-------|-------|--------|----------|
| T1 | S1, S2, S3, S4, S5, S8 | delegated (context backstop) | done (uncommitted) | RED: each of 3 test files failed with "Cannot find module" before its implementation; GREEN: 42 routines tests, `pnpm test` 136/136, tsc and lint clean |
| T2 | S2, S3, S4, S8 | delegated (context backstop) | done (uncommitted) | RED: integration test failed with "Cannot find module ./drizzle-routine-repository"; GREEN: `pnpm test:integration` 25/25 (14 routines), `pnpm test` 136/136, tsc and lint clean; mutations (ownership filter, exercise-ownership check) each failed the isolation/foreign-exercise cases |
| T3 | S3, S6, S7, S8 | delegated (context backstop) | pending | — |

- T1 — Domain + application: `modules/routines/domain` (types, validation, repository port with exercise-ownership check), `modules/routines/application` use cases, in-memory repository + contract suite in `modules/routines/testing`, unit tests.
- T2 — Infrastructure: Drizzle repository (transactional item replacement, ownership checks), MySQL integration test running the contract suite.
- T3 — UI: server actions, pages, routine form with dynamic item list, list with archive/restore, nav link, action tests.

## Log

- **L1** (2026-11-13) User: "Perfecto, continua con las Rutinas"
- **L2** Route: all tasks delegated to one bounded writer each, sequentially, because the parent session passed the long-session context backstop. Tasks depend on each other, so no parallelism.
- **L3** Reference implementation to mirror: `modules/exercises/**` (layers, contract suite, action tests, archive semantics), commits 3ffa39c..6716cc7 and bbbd8ac.
- **L4** T1 done: `modules/routines/{domain,application,testing}`. Assumptions: `ROUTINE_ITEMS_MAX = 50` caps one submission; per-item errors live in `errors.itemErrors` (aligned with items, `undefined` when valid) and the list-level message in `errors.items`; archived exercises the user owns are accepted in items (S6). Contract fixture needs `aliceExercises` (second one archived), `bobExercise`, `missingExercise` from T2.
- **L5** T2 done: `modules/routines/infrastructure`. create/update run in one transaction (update locks the routine row `FOR UPDATE`, returns null before the exercise check); list loads items for all routines in one query. Because `routine_exercises.exercise_id` is `restrict`, deleting users fails while routines exist, so the routines integration test deletes routines in setup and `afterAll` to keep the exercises integration setup working.
- **L6** Follow-up (not in scope): `routine_exercises.exercise_id` and `session_sets.exercise_id` use ON DELETE RESTRICT, so deleting a user with routines fails (the user → exercises cascade is blocked). Matters once account deletion exists: delete routines/sessions before exercises in that flow, or revisit the FK rules.
