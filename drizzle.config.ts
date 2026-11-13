import { defineConfig } from "drizzle-kit";

// drizzle-kit does not read .env files on its own.
try {
  process.loadEnvFile(".env");
} catch {
  // No .env file: rely on variables already set in the environment.
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.");
}

export default defineConfig({
  dialect: "mysql",
  schema: "./infrastructure/db/schema.ts",
  out: "./infrastructure/db/migrations",
  dbCredentials: { url: process.env.DATABASE_URL },
  strict: true,
  verbose: true,
});
