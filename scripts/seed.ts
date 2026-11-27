/**
 * Creates (or resets the password of) the test user, marked as verified so
 * it can sign in without the verification email.
 *
 *   pnpm db:seed
 *
 * Credentials come from SEED_USER_EMAIL / SEED_USER_PASSWORD, defaulting to
 * the shared demo account. Development and demo data only.
 */
import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";

try {
  process.loadEnvFile(".env");
} catch {
  // No .env file: rely on variables already set in the environment.
}

// The default password is public: never fall back to it in production.
if (process.env.NODE_ENV === "production" && !process.env.SEED_USER_PASSWORD) {
  console.error("Refusing to seed in production without an explicit SEED_USER_PASSWORD.");
  process.exit(1);
}

const email = process.env.SEED_USER_EMAIL ?? "gymple@gymple.com";
const password = process.env.SEED_USER_PASSWORD ?? "Gymple123!";
const name = process.env.SEED_USER_NAME ?? "Gymple";

async function main() {
  // Imported after loading .env: the client reads DATABASE_URL on import.
  const { db } = await import("../infrastructure/db/client");
  const { accounts, users } = await import("../infrastructure/db/schema");

  const passwordHash = await hashPassword(password);

  try {
    await db.transaction(async (tx) => {
      let [user] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email));
      if (!user) {
        [user] = await tx.insert(users).values({ email, name, emailVerified: true }).returning({ id: users.id });
      } else {
        await tx.update(users).set({ emailVerified: true }).where(eq(users.id, user.id));
      }

      const credential = and(eq(accounts.userId, user.id), eq(accounts.providerId, "credential"));
      const [existing] = await tx.select({ id: accounts.id }).from(accounts).where(credential);

      if (existing) {
        await tx.update(accounts).set({ password: passwordHash }).where(eq(accounts.id, existing.id));
      } else {
        await tx.insert(accounts).values({
          userId: user.id,
          accountId: String(user.id),
          providerId: "credential",
          password: passwordHash,
        });
      }
    });
    console.log(`Seeded user ${email}`);
  } finally {
    await db.$client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
