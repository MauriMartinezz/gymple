import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/infrastructure/db/client";
import { accounts, sessions, users, verifications } from "@/infrastructure/db/schema";

// Reads BETTER_AUTH_SECRET and BETTER_AUTH_URL from the environment.
export const auth = betterAuth({
  appName: "Gymple",
  database: drizzleAdapter(db, {
    provider: "mysql",
    schema: { user: users, session: sessions, account: accounts, verification: verifications },
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
  telemetry: { enabled: false },
  // Must stay last: lets server actions set the session cookie.
  plugins: [nextCookies()],
});
