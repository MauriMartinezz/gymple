# Feature: Roles, trainers and guest mode

Objective: admin, trainer and user roles; trainers coach many students (and students have many trainers) through a profile invite link; guests try the app without an account, keeping their data in the browser. Branch: `feat/roles-and-guest` (based on `feat/workout-sessions`). Delivery: work-unit commits, `ask-on-risk` (forecast well over 400 lines: chain strategy to be asked before slicing). Test runner: Vitest (`pnpm test`, `pnpm test:integration` against `gymple_test`).

## Specs

- **S1** — User's words: "3 roles: entrenador, administrador y usaurio."
- **S2** — User's words: "El administrador puede dar de alta o certificar entrenadores, dar de baja a los mismos, editar valores como nombres, emails, dni, etc."
- **S3** — User's words: "Los entrenadores pueden tener entrenados y un link para su perfil para que se sumen sus alumnos, ver los entrenamientos de los alumnos y sugerir cargas, agregar reseñas o comentarios."
- **S4** — User's words: "Los usuarios pueden tener muchos entrenadores y los entrenadores muchos alumnos obviamente."
- **S5** — User's words: "También se podrá entrar a la aplicación como Invitado sin loguearse para que no sea obligatorio tener una cuenta para probar la aplicación" and "Lo que quiero que pase cuando carga algo un anónimo se guarde en el navegador, no quiero persistir datos de gente que no tiene cuenta".
  - Guest data never reaches the server; it lives in browser storage and runs the same domain rules and use cases through browser adapters of the repository ports.
- **Open (to confirm with the user):** who can create accounts (today sign-up is disabled; the invite link needs students to have accounts); what "sugerir cargas" targets; DNI scope.

## Tasks

| ID | Specs | Route | Status | Evidence |
|----|-------|-------|--------|----------|
| T1 | S1, S2 | inline | pending: product decisions | — |
| T2 | S3, S4 | inline | pending | — |
| T3 | S3 | inline | pending | — |
| T4 | S5 | inline | pending | — |

- T1 — Accounts and roles: role on users (+ migration), sign-up per the open decision, first admin via seed, admin screens to create/certify, deactivate and edit trainers.
- T2 — Trainer–student links: many-to-many table, trainer profile invite link, join/leave, trainer's student list and read-only view of their workouts.
- T3 — Trainer feedback: load suggestions and comments/reviews on students' workouts.
- T4 — Guest mode: browser-storage repositories (exercises, routines, sessions) behind the existing ports, client-run use cases, "Continue as guest" entry, no server writes.

## Log

- **L1** (2026-11-13) User: "Bueno, me gustaría hacer lo siguiente: 3 roles: entrenador, administrador y usaurio. El administrador puede dar de alta o certificar entrenadores, dar de baja a los mismos, editar valores como nombres, emails, dni, etc. Los entrenadores pueden tener entrenados y un link para su perfil para que se sumen sus alumnos, ver los entrenamientos de los alumnos y sugerir cargas, agregar reseñas o comentarios. Los usuarios pueden tener muchos entrenadores y los entrenadores muchos alumnos obviamente. También se podrá entrar a la aplicación como Invitado sin loguearse para que no sea obligatorio tener una cuenta para probar la aplicación"
- **L2** (2026-11-13) User: "Lo que quiero que pase cuando carga algo un anónimo se guarde en el navegador, no quiero persistir datos de gente que no tiene cuenta"
- **L3** Finding: sign-up is disabled (`modules/auth/infrastructure/better-auth.ts`, `disableSignUp: true`; accounts come from `pnpm db:seed`). Every page and action is server-side and scoped by `requireUser()`, so guest mode needs client-side adapters and UI wiring (T4). Risk items expected: 2 (auth, roles, permissions) in T1–T3, 1 (migrations) in T1–T2.
