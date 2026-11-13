import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/infrastructure/db/schema";
import { describeRoutineRepositoryContract, type ContractFixture } from "../testing/routine-repository-contract";
import { DrizzleRoutineRepository } from "./drizzle-routine-repository";

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

// routine_exercises restricts deleting exercises, so deleting users (as every
// integration setup does) fails while routines exist: leave none behind.
const deleteRoutines = () => db.delete(schema.routines); // cascades to their items

afterAll(async () => {
  await deleteRoutines();
  await pool.end();
});

describeRoutineRepositoryContract("MySQL (Drizzle)", seed);

describe("DrizzleRoutineRepository atomicity", () => {
  it("keeps the previous name and items when an update fails after deleting them", async () => {
    const { repo, alice, aliceExercises } = await seed();
    const item = {
      exerciseId: aliceExercises[0],
      targetSets: 3,
      targetRepsMin: 8,
      targetRepsMax: 12,
      restSeconds: 90,
      notes: null,
    };
    const routine = await repo.create(alice, { name: "Push day", description: null, items: [item] });

    // 70000 overflows the smallint column, so the insert that follows the
    // delete of the old items fails mid-transaction.
    await expect(
      repo.update(alice, routine.id, {
        name: "Renamed",
        description: null,
        items: [{ ...item, targetSets: 70_000 }],
      }),
    ).rejects.toThrow();

    expect(await repo.findById(alice, routine.id)).toEqual(routine);
  });
});

async function seed(): Promise<ContractFixture> {
  await deleteRoutines();
  await db.delete(schema.users); // cascades to exercises
  const [alice] = await db.insert(schema.users).values({ email: "alice@test.dev", name: "Alice" }).$returningId();
  const [bob] = await db.insert(schema.users).values({ email: "bob@test.dev", name: "Bob" }).$returningId();
  const exercise = (userId: number, name: string) => ({ userId, name, muscleGroup: "chest" as const });
  const [first, second, bobExercise] = await db
    .insert(schema.exercises)
    .values([exercise(alice.id, "Bench press"), exercise(alice.id, "Dips"), exercise(bob.id, "Bench press")])
    .$returningId();
  // Archived exercises still belong to their owner.
  await db.update(schema.exercises).set({ archivedAt: new Date() }).where(eq(schema.exercises.id, second.id));
  return {
    repo: new DrizzleRoutineRepository(db),
    alice: alice.id,
    bob: bob.id,
    aliceExercises: [first.id, second.id],
    bobExercise: bobExercise.id,
    missingExercise: bobExercise.id + 1_000_000,
  };
}
