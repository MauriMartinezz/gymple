import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import type { Db } from "@/infrastructure/db/client";
import {
  accounts,
  rateLimits,
  sessions,
  users,
  verifications,
} from "@/infrastructure/db/schema";
import type { EmailSender } from "@/infrastructure/email/email-sender";
import { setPasswordEmail } from "../application/set-password-email";
import { verificationEmail, verificationLink } from "../application/verification-email";
import { signInRateLimitFromEnv } from "./sign-in-rate-limit";

export interface AuthDependencies {
  db: Db;
  emailSender: EmailSender;
  /** Defaults to BETTER_AUTH_URL. */
  baseURL?: string;
  /** Defaults to BETTER_AUTH_SECRET. */
  secret?: string;
  /** Tests turn the limiter off; the app always keeps it on. */
  rateLimit?: boolean;
}

export type Auth = ReturnType<typeof createAuth>;

export function createAuth({ db, emailSender, baseURL, secret, rateLimit = true }: AuthDependencies) {
  return betterAuth({
    appName: "Gymple",
    baseURL,
    secret,
    database: drizzleAdapter(db, {
      provider: "mysql",
      schema: {
        user: users,
        session: sessions,
        account: accounts,
        verification: verifications,
        rateLimit: rateLimits,
      },
    }),
    advanced: {
      // Our tables use auto-increment integer ids.
      database: { generateId: "serial" },
    },
    emailAndPassword: {
      enabled: true,
      // Open sign-up, but no session until the email is verified (spam control).
      requireEmailVerification: true,
      // A new password signs out every other device.
      revokeSessionsOnPasswordReset: true,
      // Also how trainer accounts created by an admin choose their first
      // password (the link lands on /reset-password). Tokens are single-use
      // and expire after better-auth's default of 1 hour.
      sendResetPassword: async ({ user, url }) => {
        await emailSender.send(setPasswordEmail(user, url));
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      // An unverified user who tries to sign in gets a fresh link.
      sendOnSignIn: true,
      autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ user, url }) => {
        await emailSender.send(verificationEmail(user, verificationLink(url)));
      },
    },
    // Applies only to requests through the HTTP handler (/api/auth/*), which is
    // why the login and sign-up forms call the API instead of server actions.
    rateLimit: {
      enabled: rateLimit,
      storage: "database",
      customRules: { "/sign-in/email": signInRateLimitFromEnv() },
    },
    telemetry: { enabled: false },
    // Must stay last: lets server actions set the session cookie.
    plugins: [nextCookies()],
  });
}
