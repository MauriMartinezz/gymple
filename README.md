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

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
