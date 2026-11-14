This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Accounts and email verification

Anyone can create an account at `/signup` (name, email, password). The account
cannot sign in until its email is verified: sign-up sends a verification link,
and signing in with an unverified account sends a new one. Links expire after
one hour. Accounts created by `pnpm db:seed` are already verified.

Emails are sent over SMTP:

| Variable     | Description                                                     | Default outside production       |
| ------------ | --------------------------------------------------------------- | -------------------------------- |
| `SMTP_URL`   | `smtp://` or `smtps://` URL, credentials included               | `smtp://localhost:1025`          |
| `EMAIL_FROM` | Sender address, e.g. `Gymple <no-reply@example.com>`            | `Gymple <no-reply@gymple.local>` |

Both are required in production. In development, `pnpm db:up` also starts
[Mailpit](https://mailpit.axllent.org/), which catches every email: open
<http://localhost:8025> to read them. `MAILPIT_SMTP_PORT` and `MAILPIT_UI_PORT`
change its ports.

## Roles: users, trainers and admins

Every account is a user, with its own exercises, routines and workouts.
Trainer and admin are capabilities added on top of the account; one account
can have both.

- **Admin**: a flag on the account. There is no screen to grant it; grant it
  to an existing account with:

  ```bash
  pnpm admin:grant <email>
  ```

  It prints the result and exits with code 1 when the email has no account.
  Admins see an **Admin** link in the header. Every page under `/admin` and
  every admin action checks the flag in the database; anyone else gets the
  not-found page.
- **Trainer**: only trainers have a DNI (7 or 8 digits; dots and spaces are
  ignored), unique among trainers. From `/admin` an admin can:
  - **New trainer**: name, email and DNI. Creates a verified account and
    emails a link to choose a password. If the email already has an account,
    the form points to certifying it instead.
  - **Certify existing account**: email and DNI. The account becomes a trainer.
  - **Revoke** / **Restore**: revoking removes only the trainer capability;
    the account and its own data stay. Restoring keeps the DNI on file.
  - **Edit**: name, email and DNI. A new email is marked unverified and
    receives a verification link; the account cannot sign in again until it
    is verified.

The trainer list shows active and revoked trainers, most recently certified
first.

### Trainers and students

A user can have many trainers and a trainer many students; a trainer can also
be another trainer's student, never their own.

- **Students** (header link, active trainers only): the trainer's invite link
  `/join/<code>` with a copy button, and **Get a new link**, which makes the
  old link stop working. Below it, the students, newest first: open one to see
  their finished workouts (history and detail, read-only), or **Remove** them.
- **`/join/<code>`**: a signed-in user sees the trainer's name and confirms
  **Join as student**; joining twice changes nothing. A signed-out visitor is
  offered sign-in or sign-up and comes back to the link after signing in
  (`/login?next=…` accepts same-origin paths only). A revoked trainer's link
  says they are not accepting students.
- **Trainers** (header link): the user's trainers, active or inactive, and
  **Leave**.

Trainers never see a student's active workout, routines editor, or anything
of someone who is not their student. Revoking a trainer suspends their links:
they see none of their students' data and cannot remove students, while
students see them as inactive and can still leave. Restoring the trainer
brings the links back.

### Load suggestions and comments

- **Load suggestions**: on a student's page the trainer opens one of the
  student's exercises and suggests a weight (0–999.99 kg, at most 2 decimals)
  and reps (1–100), optionally sets (1–20) and a note (up to 500 characters).
  Saving again replaces the trainer's suggestion; **Withdraw suggestion**
  removes it. Routines never change.
- The student sees the current suggestions on **Trainers**, and on the active
  workout card ("Suggested by Ana: 85 kg × 6", plus the sets and note). While
  an exercise has no sets in the workout, its first set is prefilled with the
  suggestion instead of last time's values; once a set is logged, the
  student's own last set prefills the next one, so changes stay in that
  workout. With several trainers, the most recent suggestion for the exercise
  wins.
- **Comments**: on a student's finished workout the trainer writes comments
  (up to 1000 characters) and can delete their own. The student reads every
  trainer's comments on the workout's page; deleting the workout deletes them.

A revoked trainer cannot suggest, withdraw, comment or delete. Their
suggestions stop applying and are hidden from the student until the trainer
is restored (likewise for a trainer the student left); their comments stay
readable by the student.

### Choosing or resetting a password

`/reset-password` is where the "choose your password" link lands (better-auth's
password reset flow, links are single-use and expire after one hour). Opened
without a valid link, it offers to email a new one, which is also how anyone
who forgot their password resets it ("Forgot your password?" on the sign-in
page). The answer never reveals whether an email has an account.

## Guest mode

Anyone can try Gymple without an account: "Continue as guest" on `/login` and `/signup` opens `/guest`.

- Guest data never reaches the server. Exercises and routines are saved in this browser's `localStorage` under one versioned key (`gymple.guest`); guest pages use no session, server action or database.
- The same domain rules and use cases run in the browser, through browser adapters of the repository ports (`modules/guest/infrastructure`) that pass the same contract suites as the MySQL adapters.
- "Delete guest data" (in the guest header) clears everything after a confirmation. Blocked or full storage, and unreadable saved data, show a message instead of failing silently.
- Guest data is not moved into an account on sign-up. Workouts for guests are coming next; trainers, admin and coaching are for accounts only.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
