import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/infrastructure/db/client";
import * as schema from "@/infrastructure/db/schema";
import { ActiveSessionExistsError } from "../domain/session-repository";
import { describeSessionRepositoryContract, type ContractFixture } from "../testing/session-repository-contract";
import { DrizzleSessionRepository } from "./drizzle-session-repository";

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

// session_sets and routine_exercises restrict deleting exercises, so deleting
// users (as every integration setup does) fails while sessions or routines
// exist: leave none behind.
async function deleteSessionsAndRoutines() {
  await db.delete(schema.workoutSessions); // cascades to their sets
  await db.delete(schema.routines); // cascades to their items
}

afterAll(async () => {
  await deleteSessionsAndRoutines();
  await pool.end();
});

describeSessionRepositoryContract("MySQL (Drizzle)", seed);

describe("DrizzleSessionRepository concurrency", () => {
  it("lets only one of two concurrent starts succeed", async () => {
    const { repo, alice } = await seed();

    const results = await Promise.allSettled([repo.start(alice, null), repo.start(alice, null)]);

    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    const rejected = results.find((r) => r.status === "rejected");
    expect(rejected?.reason).toBeInstanceOf(ActiveSessionExistsError);
  });

  it("numbers concurrently logged sets of one exercise without gaps or duplicates", async () => {
    const { repo, alice, aliceExercises } = await seed();
    const session = await repo.start(alice, null);
    const input = { weightKg: 80, reps: 8, rpe: null, restSeconds: null };

    await Promise.all(
      Array.from({ length: 10 }, () => repo.addSet(alice, session.id, aliceExercises.first, input)),
    );

    const numbers = (await repo.findById(alice, session.id))?.sets.map((s) => s.setNumber);
    expect([...(numbers ?? [])].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe("DrizzleSessionRepository atomicity", () => {
  it("keeps a deleted set and the numbering when renumbering fails mid-transaction", async () => {
    const { repo, alice, aliceExercises } = await seed();
    const input = { weightKg: 80, reps: 8, rpe: null, restSeconds: null };
    const session = await repo.start(alice, null);
    const first = await repo.addSet(alice, session.id, aliceExercises.first, input);
    await repo.addSet(alice, session.id, aliceExercises.first, { ...input, reps: 6 });
    const before = await repo.findById(alice, session.id);

    // Every UPDATE fails, so the renumbering that follows the delete throws.
    const failing = new DrizzleSessionRepository(failingUpdates(db));
    await expect(failing.deleteSet(alice, session.id, first!.id)).rejects.toThrow("forced failure");

    expect(await repo.findById(alice, session.id)).toEqual(before);
  });
});

/** A database whose UPDATE statements throw, inside transactions too. */
function failingUpdates(target: Db): Db {
  const breakUpdates = <T extends object>(executor: T): T =>
    new Proxy(executor, {
      get(object, property, receiver) {
        if (property === "update") {
          return () => {
            throw new Error("forced failure");
          };
        }
        if (property === "transaction") {
          return (run: (tx: unknown) => Promise<unknown>) =>
            (object as unknown as Db).transaction((tx) => run(breakUpdates(tx)));
        }
        return Reflect.get(object, property, receiver);
      },
    });
  return breakUpdates(target);
}

async function seed(): Promise<ContractFixture> {
  await deleteSessionsAndRoutines();
  await db.delete(schema.users); // cascades to exercises
  const [alice] = await db.insert(schema.users).values({ email: "alice@test.dev", name: "Alice" }).$returningId();
  const [bob] = await db.insert(schema.users).values({ email: "bob@test.dev", name: "Bob" }).$returningId();
  const exercise = (userId: number, name: string) => ({ userId, name, muscleGroup: "chest" as const });
  const [first, second, archived, bobExercise] = await db
    .insert(schema.exercises)
    .values([
      exercise(alice.id, "Bench press"),
      exercise(alice.id, "Dips"),
      exercise(alice.id, "Pec deck"),
      exercise(bob.id, "Bench press"),
    ])
    .$returningId();
  const [activeRoutine, archivedRoutine, bobRoutine] = await db
    .insert(schema.routines)
    .values([
      { userId: alice.id, name: "Push day" },
      { userId: alice.id, name: "Old push day" },
      { userId: bob.id, name: "Push day" },
    ])
    .$returningId();
  const archiveExercise = async (id: number) => {
    await db.update(schema.exercises).set({ archivedAt: new Date() }).where(eq(schema.exercises.id, id));
  };
  await archiveExercise(archived.id);
  await db.update(schema.routines).set({ archivedAt: new Date() }).where(eq(schema.routines.id, archivedRoutine.id));
  return {
    repo: new DrizzleSessionRepository(db),
    alice: alice.id,
    bob: bob.id,
    aliceExercises: { first: first.id, second: second.id, archived: archived.id },
    bobExercise: bobExercise.id,
    missingExercise: bobExercise.id + 1_000_000,
    aliceRoutines: { active: activeRoutine.id, archived: archivedRoutine.id },
    bobRoutine: bobRoutine.id,
    missingRoutine: bobRoutine.id + 1_000_000,
    archiveExercise,
  };
}
