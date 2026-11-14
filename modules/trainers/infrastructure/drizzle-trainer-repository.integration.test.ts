import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/infrastructure/db/schema";
import { describeTrainerRepositoryContract } from "../testing/trainer-repository-contract";
import { DrizzleTrainerRepository } from "./drizzle-trainer-repository";

// Runs against a real, disposable MySQL database (see `pnpm test:integration`).
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is not set.");
// Setup deletes every user: refuse anything that is not a test database.
if (!new URL(url).pathname.replace(/^\//, "").endsWith("_test")) {
  throw new Error(`Refusing to run integration tests against "${url}": the database name must end in _test.`);
}

const pool = mysql.createPool({ uri: url, connectionLimit: 4 });
const db = drizzle({ client: pool, schema, mode: "default" });

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "infrastructure/db/migrations" });
});

// Sessions and routines restrict deleting exercises (and so users): remove them first.
async function deleteAllUsers() {
  await db.delete(schema.workoutSessions);
  await db.delete(schema.routines);
  await db.delete(schema.users); // cascades to trainers, accounts, sessions and exercises
}

afterAll(async () => {
  await deleteAllUsers();
  await pool.end();
});

async function setup() {
  await deleteAllUsers();
  return {
    repo: new DrizzleTrainerRepository(db),
    addAccount: async ({ name, email, emailVerified = false }: { name: string; email: string; emailVerified?: boolean }) => {
      const [{ id }] = await db.insert(schema.users).values({ name, email, emailVerified }).$returningId();
      return id;
    },
  };
}

describeTrainerRepositoryContract("MySQL (Drizzle)", setup);

describe("DrizzleTrainerRepository", () => {
  it("revoking keeps the account's own training data", async () => {
    const { repo } = await setup();
    const trainer = await repo.createAccountWithTrainer({ name: "Ana", email: "ana@example.com", dni: "12345678" });
    await db.insert(schema.exercises).values({ userId: trainer.userId, name: "Squat", muscleGroup: "legs" });
    await db.insert(schema.routines).values({ userId: trainer.userId, name: "Legs" });

    await repo.setRevoked(trainer.userId, true);

    expect(await db.select().from(schema.exercises).where(eq(schema.exercises.userId, trainer.userId))).toHaveLength(1);
    expect(await db.select().from(schema.routines).where(eq(schema.routines.userId, trainer.userId))).toHaveLength(1);
    expect(await db.select().from(schema.users).where(eq(schema.users.id, trainer.userId))).toHaveLength(1);
  });

  it("never grants the admin flag", async () => {
    const { repo } = await setup();
    const trainer = await repo.createAccountWithTrainer({ name: "Ana", email: "ana@example.com", dni: "12345678" });

    const [row] = await db.select({ isAdmin: schema.users.isAdmin }).from(schema.users).where(eq(schema.users.id, trainer.userId));
    expect(row.isAdmin).toBe(false);
  });

  it("lets only one of two concurrent certifications with the same DNI succeed", async () => {
    const { repo, addAccount } = await setup();
    const a = await addAccount({ name: "A", email: "a@example.com" });
    const b = await addAccount({ name: "B", email: "b@example.com" });

    const results = await Promise.allSettled([repo.certify(a, "7654321"), repo.certify(b, "7654321")]);

    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(await repo.list()).toHaveLength(1);
  });
});
