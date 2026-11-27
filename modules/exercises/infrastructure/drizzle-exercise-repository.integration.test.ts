import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll } from "vitest";
import * as schema from "@/infrastructure/db/schema";
import { describeExerciseRepositoryContract } from "../testing/exercise-repository-contract";
import { DrizzleExerciseRepository } from "./drizzle-exercise-repository";

// Runs against a real, disposable Postgres database (see `pnpm test:integration`).
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is not set.");
// Setup deletes every user: refuse anything that is not a test database.
if (!new URL(url).pathname.replace(/^\//, "").endsWith("_test")) {
  throw new Error(`Refusing to run integration tests against "${url}": the database name must end in _test.`);
}

const pool = new Pool({ connectionString: url, max: 4 });
const db = drizzle({ client: pool, schema });

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "infrastructure/db/migrations" });
});

afterAll(async () => {
  await pool.end();
});

describeExerciseRepositoryContract("Postgres (Drizzle)", async () => {
  await db.delete(schema.users); // cascades to exercises
  const [alice] = await db.insert(schema.users).values({ email: "alice@test.dev", name: "Alice" }).returning({ id: schema.users.id });
  const [bob] = await db.insert(schema.users).values({ email: "bob@test.dev", name: "Bob" }).returning({ id: schema.users.id });
  return { repo: new DrizzleExerciseRepository(db), alice: alice.id, bob: bob.id };
});
