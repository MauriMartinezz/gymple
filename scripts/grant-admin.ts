/**
 * Grants the admin capability to an existing account. There is no UI for
 * it: this is how the first admin is created.
 *
 *   pnpm admin:grant <email>
 */
import { runGrantAdmin } from "../modules/auth/application/grant-admin";

try {
  process.loadEnvFile(".env");
} catch {
  // No .env file: rely on variables already set in the environment.
}

async function main() {
  // Imported after loading .env: the client reads DATABASE_URL on import.
  const { db } = await import("../infrastructure/db/client");
  const { DrizzleAdminFlags } = await import("../modules/auth/infrastructure/drizzle-admin-flags");

  try {
    const { exitCode, message } = await runGrantAdmin(process.argv.slice(2), new DrizzleAdminFlags(db));
    (exitCode === 0 ? console.log : console.error)(message);
    process.exitCode = exitCode;
  } finally {
    await db.$client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
