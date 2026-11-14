# Feature: Roles, trainers and guest mode

Objective: admin, trainer and user roles; trainers coach many students (and students have many trainers) through a profile invite link; guests try the app without an account, keeping their data in the browser. Branch: `feat/roles-and-guest` (based on `feat/workout-sessions`). Delivery: work-unit commits, `ask-on-risk` (forecast well over 400 lines: chain strategy to be asked before slicing). Test runner: Vitest (`pnpm test`, `pnpm test:integration` against `gymple_test`).

## Specs

- **S1** — User's words: "3 roles: entrenador, administrador y usaurio."
- **S2** — User's words: "El administrador puede dar de alta o certificar entrenadores, dar de baja a los mismos, editar valores como nombres, emails, dni, etc."
- **S3** — User's words: "Los entrenadores pueden tener entrenados y un link para su perfil para que se sumen sus alumnos, ver los entrenamientos de los alumnos y sugerir cargas, agregar reseñas o comentarios."
- **S4** — User's words: "Los usuarios pueden tener muchos entrenadores y los entrenadores muchos alumnos obviamente."
- **S5** — User's words: "También se podrá entrar a la aplicación como Invitado sin loguearse para que no sea obligatorio tener una cuenta para probar la aplicación" and "Lo que quiero que pase cuando carga algo un anónimo se guarde en el navegador, no quiero persistir datos de gente que no tiene cuenta".
  - Guest data never reaches the server; it lives in browser storage and runs the same domain rules and use cases through browser adapters of the repository ports.
- **S6** — User's words: "Registro por invitacion o que requiera validacion por email para evitar tantas cuentas spam"
  - Decision: open sign-up (name, email, password) with mandatory email verification for everyone, invited or not — the trainer link is public, so an invitation alone does not stop spam. An unverified account cannot sign in; trying to sign in re-sends the verification email. New accounts get the `user` role. Accounts created by `pnpm db:seed` are marked verified.
  - Assumption: emails go through an `EmailSender` port; production uses SMTP (nodemailer, configured by `SMTP_URL` and `EMAIL_FROM`), development uses a Mailpit container in `docker-compose.yml`, tests use an in-memory fake. Verification links use better-auth's default expiry.
- **S7** — User's words: "un entrenador puede ser a su vez un asesorado de otro entrenador, es algo bastante comun. Si un administrador da de baja un entrenador solamente deja de poder ejercer sus funciones de entrenador"
  - Roles are not exclusive: every account is a user (own exercises, routines, workouts, trainers); trainer and admin are capabilities added on top. A trainer can be another trainer's student (never their own).
  - Revoking a trainer only removes the trainer capability; the account, its own training data and its own trainers stay untouched.
  - Assumption: on revocation the trainer's links to their students are kept but suspended — the trainer loses access to the students' workouts and cannot add suggestions or comments, students see the trainer as inactive, existing suggestions and comments stay readable by the student. Certifying the same person again restores those links.
- **S8** — User's words: "Está bien que lo tengan solo entrenadores, que son personas certificadas por nosotros"
  - Only trainers have a DNI; it is required to create or certify a trainer and is never asked of other users.
  - Assumption: a DNI is 7 or 8 digits (dots and spaces accepted and stripped on input), unique among trainers.
- **S9** — T1b behaviour (assumptions derived from S2, S7, S8):
  - Admin capability: a flag on the account; there is no UI to grant it. The first admin is granted with a CLI script (`pnpm admin:grant <email>`). Admin pages live under `/admin`; every admin page and action checks the admin flag on the server (`requireAdmin()`); a non-admin gets a not-found page.
  - "Dar de alta": the admin enters name, email and DNI; a new account is created (verified, since the admin vouches for it) with the trainer capability, and a "set your password" email is sent (better-auth password reset flow). If the email already has an account, the admin is pointed to certifying it instead.
  - "Certificar": the admin finds an existing account by email and enters the DNI; it gains the trainer capability.
  - "Dar de baja": revokes the trainer capability (S7); "Restore" re-certifies with the stored DNI.
  - "Editar": the admin edits a trainer's name, email and DNI. Changing the email marks it unverified and sends a verification email to the new address.
  - The admin list shows trainers (active and revoked) with name, email, DNI and status, newest first.
- **Open (to confirm with the user):** what "sugerir cargas" targets.

## Tasks

| ID | Specs | Route | Status | Evidence |
|----|-------|-------|--------|----------|
| T1a | S6 | delegated (context backstop) | done (400fa99, fix in next commit) | RED: module-missing for 5 unit files + integration test (verify-email-result test written after code); GREEN: `pnpm test` 451/451, `pnpm test:integration` 73/73, tsc, lint, build clean |
| T1b | S1, S2, S7, S8, S9 | delegated (context backstop) | done (bddfe29, fixes in next commit) | RED: module-missing for every new test file; GREEN: `pnpm test` 559/559, `pnpm test:integration` 102/102, build, tsc, lint clean; mutations (requireAdmin removed from revoke/restore: 6 fail; swapped for requireUser in create: 2 fail) killed |
| T2 | S3, S4 | inline | pending | — |
| T3 | S3 | inline | pending | — |
| T4 | S5 | inline | pending | — |

- T1a — Sign-up with email verification: `EmailSender` port + SMTP adapter + fake, better-auth verification config, `/signup` and verification-result pages, login handling of unverified accounts, Mailpit service, seed marks accounts verified, docs. Risk: items 2 (auth) and 5 (new dependency).
- T1b — Roles and admin (S1, S2, S7): admin flag and trainer status on users (+ migration), first admin via seed, admin screens to create/certify, deactivate and edit trainers.
- T2 — Trainer–student links: many-to-many table, trainer profile invite link, join/leave, trainer's student list and read-only view of their workouts.
- T3 — Trainer feedback: load suggestions and comments/reviews on students' workouts.
- T4 — Guest mode: browser-storage repositories (exercises, routines, sessions) behind the existing ports, client-run use cases, "Continue as guest" entry, no server writes.

## Log

- **L1** (2026-11-13) User: "Bueno, me gustaría hacer lo siguiente: 3 roles: entrenador, administrador y usaurio. El administrador puede dar de alta o certificar entrenadores, dar de baja a los mismos, editar valores como nombres, emails, dni, etc. Los entrenadores pueden tener entrenados y un link para su perfil para que se sumen sus alumnos, ver los entrenamientos de los alumnos y sugerir cargas, agregar reseñas o comentarios. Los usuarios pueden tener muchos entrenadores y los entrenadores muchos alumnos obviamente. También se podrá entrar a la aplicación como Invitado sin loguearse para que no sea obligatorio tener una cuenta para probar la aplicación"
- **L2** (2026-11-13) User: "Lo que quiero que pase cuando carga algo un anónimo se guarde en el navegador, no quiero persistir datos de gente que no tiene cuenta"
- **L4** (2026-11-13) User: "1) Registro por invitacion o que requiera validacion por email para evitar tantas cuentas spam" → S6; T1 split into T1a (sign-up) and T1b (roles/admin).
- **L3** Finding: sign-up is disabled (`modules/auth/infrastructure/better-auth.ts`, `disableSignUp: true`; accounts come from `pnpm db:seed`). Every page and action is server-side and scoped by `requireUser()`, so guest mode needs client-side adapters and UI wiring (T4). Risk items expected: 2 (auth, roles, permissions) in T1–T3, 1 (migrations) in T1–T2.
- **L5** T1a written by a bounded writer (commit 400fa99): `createAuth` factory takes the `EmailSender`; `requireEmailVerification`, `sendOnSignUp`, `sendOnSignIn` on, auto sign-in after verification off; verification links land on `/verify-email?status=verified` (better-auth appends `error=<CODE>` on a bad token); duplicate sign-up returns a generic 200 and sends nothing; SMTP config required in production (checked on first email), Mailpit defaults otherwise; nodemailer 10.5.0 pinned. Independent verifier launched (risk items 2 and 5).
- **L6** Independent verifier: every S6 item PASS, no blockers (probes: no account enumeration, no open redirect outside NODE_ENV=test, sign-up rate limited 3/10 s, verified login unchanged). Advisory 4 fixed by the parent: the verification email no longer includes the name typed at sign-up (anyone can sign up with someone else's address); RED 1 test → GREEN. Open advisories: SMTP failure only logged (user recovers by signing in); production SMTP misconfig surfaces on first send; Vitest disables better-auth origin checks, so redirect/CSRF protection is not pinned by the suite.
- **L7** (2026-11-13) User: "Estoy pensando algo, un entrenador puede ser a su vez un asesorado de otro entrenador, es algo bastante comun. Si un administrador da de baja un entrenador solamente deja de poder ejercer sus funciones de entrenador" → S7 (non-exclusive capabilities; revocation keeps links suspended, assumption).
- **L8** (2026-11-13) User: "Está bien que lo tengan solo entrenadores, que son personas certificadas por nosotros" → S8; T1b behaviour written as S9 (assumptions). Risk items for T1b: 1 (migration adding columns/table), 2 (admin permissions).
- **L9** T1b written by a bounded writer (commit bddfe29, one commit of ~4k lines: the units depend on each other through the migration and `requireAdmin`). Admin = `users.is_admin` (better-auth drops undeclared body fields; pinned by an integration test); trainer = row in `trainers` (DNI unique incl. revoked, `revoked_at`); `isActiveTrainer(userId)` is the check T2 must use for suspended links. Password reset enabled (`sendResetPassword`, single-use, 1 h) — admin-created trainers have no password and set it through it; "Forgot your password?" now works for everyone. Writer assumptions: failed sends are logged; certifying does not verify the email; a revoked trainer is restored, not certified again. Open: revoke sessions when the admin changes a trainer's email? 1 h set-password link long enough? Needs `pnpm db:migrate` on the dev database. Independent verifier launched (items 1, 2, 3).
- **L10** Independent verifier on T1b: every S1/S2/S7/S8/S9 item PASS, no blockers (migration 0002→0003 with existing users clean; no `is_admin` escalation via sign-up/update-user; reset redirects to foreign origins refused outside NODE_ENV=test; tokens single-use, 60 min). Parent fixed two advisories: certifying requires a verified email ("This account has not verified its email yet."; RED → GREEN), and a password reset signs out every other device (`revokeSessionsOnPasswordReset`; integration test fails without it). Open advisories: DNIs with a leading zero (`01234567` vs `1234567`) count as different; editing a trainer's email keeps old sessions and an already-sent set-password link valid for up to 1 h, and a mistyped first email gets only a verification email at the corrected address; timing can reveal whether an account exists on password reset.
