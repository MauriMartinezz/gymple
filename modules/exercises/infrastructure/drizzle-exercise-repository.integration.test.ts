import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";
import { afterAll, beforeAll } from "vitest";
import * as schema from "@/infrastructure/db/schema";
import { describeExerciseRepositoryContract } from "../testing/exercise-repository-contract";
import { DrizzleExerciseRepository } from "./drizzle-exercise-repository";

// Runs against a real, disposable MySQL database (see `pnpm test:integration`).
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is not set.");

const pool = mysql.createPool({ uri: url, connectionLimit: 4 });
const db = drizzle({ client: pool, schema, mode: "default" });

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "infrastructure/db/migrations" });
});

afterAll(async () => {
  await pool.end();
});

describeExerciseRepositoryContract("MySQL (Drizzle)", async () => {
  await db.delete(schema.users); // cascades to exercises
  const [alice] = await db.insert(schema.users).values({ email: "alice@test.dev", name: "Alice" }).$returningId();
  const [bob] = await db.insert(schema.users).values({ email: "bob@test.dev", name: "Bob" }).$returningId();
  return { repo: new DrizzleExerciseRepository(db), alice: alice.id, bob: bob.id };
});
