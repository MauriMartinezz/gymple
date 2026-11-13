import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/infrastructure/db/client";
import {
  accounts,
  rateLimits,
  sessions,
  users,
  verifications,
} from "@/infrastructure/db/schema";
import { signInRateLimitFromEnv } from "./sign-in-rate-limit";

// Reads BETTER_AUTH_SECRET and BETTER_AUTH_URL from the environment.
export const auth = betterAuth({
  appName: "Gymple",
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
    // No sign-up screen yet: accounts are created with `pnpm db:seed`.
    disableSignUp: true,
  },
  // Applies only to requests through the HTTP handler (/api/auth/*), which is
  // why the login form calls the API instead of a server action.
  rateLimit: {
    enabled: true,
    storage: "database",
    customRules: { "/sign-in/email": signInRateLimitFromEnv() },
  },
  telemetry: { enabled: false },
  // Must stay last: lets server actions set the session cookie.
  plugins: [nextCookies()],
});
